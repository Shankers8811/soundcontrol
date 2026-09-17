#!/usr/bin/env python3
"""SoundControl RFCOMM bridge — zero third-party dependencies.

Pipes exact Soundcore DSP frames (08 EE …) into Classic Bluetooth RFCOMM.

The DSP channel is not fixed: 4 on most earbuds, 10 on the P20i family, 12/15
on several over-ears, 30 on the Space 2. Rather than trusting the first
channel that accepts a socket, `Bridge.connect` sends the `01:01` handshake to
each candidate and keeps the first one that answers with a valid `09 FF`
frame. Pass --channel to start the probe somewhere else.

    python3 soundcore_bridge.py                      # loopback, port 8765
    python3 soundcore_bridge.py --mac AA:BB:CC:DD:EE:FF --channel 4

Access control: the bridge listens on the loopback interface and is intended
only for the packaged Windows desktop renderer. The renderer receives a fresh
per-session secret from Electron and sends it on every request (see token_ok):
HTTP callers send `Authorization: Bearer <token>` (or `X-Bridge-Token:`), and
the renderer connects to `/ws?token=<token>`. Configure manual runs with the
SOUNDCONTROL_BRIDGE_TOKEN environment variable or --token.

Talk to it from the Windows renderer over WebSocket JSON:

    { "type": "connect", "mac": "AA:BB:CC:DD:EE:FF", "channel": 4 }
    { "type": "tx", "hex": "08EE00000001010A0002" }
    { "type": "disconnect" }

Responses:

    { "type": "rx", "hex": "09FF..." }
    { "type": "connected", "mac": "...", "channel": 4 }
    { "type": "error", "error": "..." }
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlsplit

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
RFCOMM = getattr(socket, "BTPROTO_RFCOMM", 3)
# AF_BLUETOOTH exists on Windows (the only production runtime) and on most
# Linux builds, but some CI Python distributions omit it, which used to kill
# the channel-probe unit tests with an AttributeError before their fake
# socket layer was even reached. Same getattr-guard pattern as RFCOMM above:
# on Windows the real constant is always used; elsewhere the Linux value (31)
# is a safe stand-in because tests replace socket.socket wholesale.
AF_BLUETOOTH = getattr(socket, "AF_BLUETOOTH", 31)

# `08 EE 00 00 00 01 01 0A 00 02` — the state request the official app sends
# first. Every supported model answers it with a `09 FF` frame, which makes it
# the cheapest possible "is this really the DSP channel?" test.
HANDSHAKE = bytes.fromhex("08EE00000001010A0002")

# RFCOMM channels the Soundcore DSP has been observed on, most common first.
# The official app resolves this from SDP; Windows gives us no reliable SDP
# record for the vendor service, so the bridge probes in this order instead.
# Deliberately excluded: 12/13 are TOTA/BESOTA firmware-flash channels on some
# families (mervin008/soundcorebridge hard-blocks them for writes) and 16 is
# Apple iAP2. We only ever send a read-only state request, and probing never
# writes firmware, but the exclusion keeps a future write path from guessing.
DSP_CHANNEL_CANDIDATES = (4, 12, 15, 10, 30, 1)

# A cold Windows Bluetooth stack can take a couple of seconds to accept, and a
# busy headset a moment to answer. Kept short on purpose: the whole probe runs
# inside the renderer's connect timeout, so 6 candidates must fit in it.
PROBE_CONNECT_TIMEOUT = 2.5
PROBE_REPLY_TIMEOUT = 1.5

# When nothing answered the handshake we still adopt the first accepting
# channel (manual console use), but the UI would then sit at "Connected" with
# empty battery/ANC forever. This watchdog names that condition out loud: if
# the silent link has not produced a single device frame after this many
# seconds, the bridge reports it instead of pretending all is well — and then
# keeps re-sending the read-only handshake every SILENT_LINK_WATCHDOG_S, so a
# control slot that frees up later (phone app closed) heals by itself and the
# renderer is told "battery and ANC are live now" without a manual reconnect.
SILENT_LINK_WATCHDOG_S = 8.0

# Input-size guards. The bridge only ever talks to the local desktop app, but
# a compromised or buggy local caller must not be able to make the helper
# allocate unbounded memory: WebSocket frames carry a 64-bit length header we
# used to trust blindly, and a `tx` hex string of any size was written
# straight to RFCOMM. Real Soundcore frames are at most 512 bytes (see
# split_frame), so both caps are far above any legitimate payload.
WS_MAX_MESSAGE_BYTES = 1 << 20  # 1 MiB per WebSocket message
TX_MAX_BYTES = 4096  # per RFCOMM write


def _answers_handshake(buf: bytes) -> bool:
    """True when `buf` holds at least one checksum-valid `09 FF` frame."""
    i = 0
    while i + 1 < len(buf):
        if buf[i] == 0x09 and buf[i + 1] == 0xFF:
            if i + 9 >= len(buf):
                return False  # header found, frame still arriving
            indicated = buf[i + 7] | (buf[i + 8] << 8)
            end = None
            if 10 <= indicated <= 512 and len(buf) >= i + indicated:
                end = i + indicated
            else:
                for candidate in range(i + 10, min(len(buf), i + 512) + 1):
                    if _frame_checksum(buf[i : candidate - 1]) == buf[candidate - 1]:
                        end = candidate
                        break
            if end is not None and _frame_checksum(buf[i : end - 1]) == buf[end - 1]:
                return True
            i += 2
        else:
            i += 1
    return False


class Bridge:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.sock: Optional[socket.socket] = None
        self.mac = ""
        self.channel = 4
        self.clients: list[socket.socket] = []
        # Serialises writes to the RFCOMM socket: the WebSocket handler thread
        # (tx commands) and the silent-link watchdog thread (background
        # handshake retries) can both sendall() it, and interleaved writes
        # would garble frames on the device link.
        self.tx_lock = threading.Lock()
        # Serialises whole connect attempts (see connect()). Separate from
        # self.lock, which guards the WebSocket client list and is taken by
        # broadcast() *inside* a connect — nesting the two would deadlock.
        self.connect_lock = threading.Lock()
        # Set by the reader on the first inbound device frame after _adopt;
        # the silent-link watchdog waits on it.
        self.first_rx = threading.Event()

    def broadcast(self, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        dead: list[socket.socket] = []
        with self.lock:
            targets = list(self.clients)
        for c in targets:
            try:
                send_ws(c, raw)
            except OSError:
                dead.append(c)
        if dead:
            with self.lock:
                self.clients = [c for c in self.clients if c not in dead]

    def connect(self, mac: str, channel: int) -> None:
        """Serialise concurrent connect attempts, then run the channel probe.

        The desktop renderer only ever has one connect in flight (the store
        guards duplicates), but a second WebSocket client — manual console
        use, a leftover window — could otherwise race two probes: both mutate
        `self.sock`, one adopts a socket the other just closed, and the
        surviving link leaks. Holding a lock makes a connect atomic with
        respect to other connects; a second caller blocks for the duration of
        the probe (up to ~24s), which is acceptable for a single-user local
        helper. Distinct from `self.lock` (client list) and `tx_lock`
        (RFCOMM writes): broadcast() and the reader take those *inside* a
        connect, so nesting the same lock here would deadlock.
        """
        with self.connect_lock:
            self._connect(mac, channel)

    def _connect(self, mac: str, channel: int) -> None:
        """Open the DSP socket, proving the channel actually speaks Soundcore.

        Accepting an RFCOMM connection does **not** mean the channel is the
        DSP. Hands-free, A2DP control and other profiles accept a socket and
        then stay silent forever, which is exactly the "Connected, but no
        battery and no ANC" failure this used to produce: the old code kept
        the first channel that accepted and reported success.

        So each candidate is probed with the `01:01` handshake and only a
        channel that answers with a valid `09 FF` frame is kept. If nothing
        answers — a device that only replies to a later command, or a manual
        console session — fall back to the first channel that at least
        accepted, and say so in the log.
        """
        # Validate before touching any socket: a malformed address must be
        # reported as such, not surface as a confusing OS-level "host down".
        normalized = _normalize_mac(mac)
        if not normalized:
            raise RuntimeError(
                f"Invalid Bluetooth address {mac!r} — expected 12 hex digits, "
                "e.g. AA:BB:CC:DD:EE:FF"
            )
        mac = normalized
        self.close()

        candidates = [channel] + [c for c in DSP_CHANNEL_CANDIDATES if c != channel]
        failures: list[str] = []
        silent: list[int] = []

        for ch in candidates:
            try:
                sock = socket.socket(AF_BLUETOOTH, socket.SOCK_STREAM, RFCOMM)
            except OSError as exc:
                failures.append(f"ch{ch}: no Bluetooth socket ({exc})")
                break
            try:
                sock.settimeout(PROBE_CONNECT_TIMEOUT)
                sock.connect((mac, ch))
            except Exception as exc:  # noqa: BLE001
                failures.append(f"ch{ch}: {exc}")
                try:
                    sock.close()
                except OSError:
                    pass
                continue

            answered = self._probe(sock)
            if answered:
                self._adopt(sock, mac, ch)
                msg = f"DSP answered on channel {ch}"
                sys.stderr.write(f"bridge: {msg}\n")
                self.broadcast({"type": "sys", "message": msg, "channel": ch})
                return

            # The socket is up but the service never replied to the handshake.
            sys.stderr.write(
                f"bridge: channel {ch} accepted the socket but never answered "
                f"the 01:01 handshake (not the DSP service)\n"
            )
            silent.append(ch)
            try:
                sock.settimeout(0.4)
            except OSError:
                pass
            sock.close()

        if silent:
            # Nothing spoke Soundcore, but something accepted. Prefer the
            # requested channel so a manual `--channel` run still works.
            ch = silent[0]
            sock = socket.socket(AF_BLUETOOTH, socket.SOCK_STREAM, RFCOMM)
            try:
                sock.settimeout(PROBE_CONNECT_TIMEOUT)
                sock.connect((mac, ch))
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(self._failure_message(failures, silent, exc)) from exc
            self._adopt(sock, mac, ch)
            msg = (
                f"connected to channel {ch}, but the earbuds did not answer the "
                f"handshake — battery and ANC will stay empty until they do"
            )
            if failures:
                # The user needs to see why the other candidates were rejected,
                # not just that two channels stayed silent.
                msg += ". Other channels refused: " + "; ".join(failures[:4])
            sys.stderr.write(f"bridge: {msg}\n")
            self.broadcast({"type": "sys", "message": msg, "channel": ch})
            threading.Thread(target=self._silent_watchdog, args=(sock, ch), daemon=True).start()
            return

        raise RuntimeError(self._failure_message(failures, silent, None))

    @staticmethod
    def _failure_message(
        failures: list[str], silent: list[int], last: Optional[Exception]
    ) -> str:
        parts = ["Could not open a Soundcore DSP channel."]
        if silent:
            parts.append(
                "These channels accepted a socket but never answered the "
                f"handshake: {', '.join(f'ch{c}' for c in silent)}."
            )
        if failures:
            shown = failures[:4]
            parts.append("Tried: " + "; ".join(shown) + ("…" if len(failures) > 4 else ""))
        if not silent and not failures and last is not None:
            parts.append(str(last))
        parts.append(
            "Leave the earbuds connected in Windows Bluetooth settings (not in "
            "pairing mode) and close the Soundcore phone app — it holds the "
            "single control slot."
        )
        return " ".join(parts)

    def _adopt(self, sock: socket.socket, mac: str, ch: int) -> None:
        sock.settimeout(0.4)
        self.sock = sock
        self.mac = mac
        self.channel = ch
        self.first_rx.clear()
        threading.Thread(target=self._reader, daemon=True).start()

    def _silent_watchdog(self, sock: socket.socket, ch: int) -> None:
        """Name the fake-"Connected" condition, then keep trying to heal it.

        Only started when the adopted channel never answered the handshake.
        After SILENT_LINK_WATCHDOG_S of silence the socket is almost certainly
        a non-DSP profile, or the Soundcore phone app still holds the single
        control slot. The bridge says so out loud (stderr + the renderer
        console) instead of sitting at a forever-empty "Connected" — and then
        keeps re-sending the read-only handshake in the background. When the
        slot frees up and the device finally answers, the reader thread sets
        `first_rx` and this thread announces that battery/ANC are live, so the
        user does not have to reconnect by hand. The socket is never closed
        here: a manual console session must keep working either way.
        """
        reported = False
        while self.sock is sock and not self.first_rx.is_set():
            if self.first_rx.wait(SILENT_LINK_WATCHDOG_S):
                break  # the device spoke (spontaneously or after a retry)
            if self.sock is not sock:
                return  # a reconnect replaced this link while we waited
            if not reported:
                msg = (
                    f"silent-link watchdog: channel {ch} has sent nothing for "
                    f"{int(SILENT_LINK_WATCHDOG_S)}s — that socket is probably not "
                    "the DSP, or the Soundcore phone app still holds the control "
                    "slot. Keeping the link open and retrying the handshake in "
                    "the background; close the phone app if it is open."
                )
                sys.stderr.write(f"bridge: {msg}\n")
                self.broadcast({"type": "sys", "error": msg, "channel": ch})
                reported = True
            try:
                with self.tx_lock:
                    sock.sendall(HANDSHAKE)
            except OSError:
                return  # the link died; the reader thread reports the close
        if self.sock is not sock:
            return
        msg = (
            f"DSP answered on channel {ch} after retry — battery and ANC are "
            "live now"
        )
        sys.stderr.write(f"bridge: {msg}\n")
        self.broadcast({"type": "sys", "message": msg, "channel": ch})

    @staticmethod
    def _probe(sock: socket.socket) -> bool:
        """Send the handshake; true when a valid `09 FF` frame comes back."""
        try:
            sock.sendall(HANDSHAKE)
        except OSError:
            return False
        deadline = time.monotonic() + PROBE_REPLY_TIMEOUT
        buf = b""
        while time.monotonic() < deadline:
            try:
                sock.settimeout(max(0.05, deadline - time.monotonic()))
                chunk = sock.recv(512)
            except socket.timeout:
                continue
            except OSError:
                return False
            if not chunk:
                return False
            buf += chunk
            if _answers_handshake(buf):
                return True
        return False

    def send(self, data: bytes) -> None:
        # Capture the socket locally: close() on another thread can null and
        # close self.sock between the check and the write, and sendall() on
        # the stale object then fails with a clean OSError (reported to the
        # caller as a protocol error) instead of an AttributeError.
        sock = self.sock
        if sock is None:
            raise RuntimeError("Not connected")
        with self.tx_lock:
            sock.sendall(data)

    def close(self) -> None:
        s = self.sock
        self.sock = None
        self.mac = ""
        if s:
            try:
                s.close()
            except OSError:
                pass

    def _reader(self) -> None:
        # Keep the socket identity local. A reconnect can replace
        # self.sock while the previous reader thread is unwinding; the old
        # thread must not consume or clear the new connection.
        sock = self.sock
        if sock is None:
            return
        buf = b""
        while self.sock is sock:
            try:
                chunk = sock.recv(1024)
            except socket.timeout:
                continue
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            while True:
                frame, remainder = split_frame(buf)
                if frame is None:
                    # split_frame may discard noise while it resynchronizes.
                    if remainder != buf:
                        buf = remainder
                        continue
                    break
                buf = remainder
                if frame:
                    if frame[:1] == b"\x09":
                        # First device-originated frame of this link; stops
                        # the silent-link watchdog if one is waiting.
                        self.first_rx.set()
                    self.broadcast({"type": "rx", "hex": frame.hex().upper()})
        if self.sock is sock:
            self.sock = None
            self.mac = ""
        self.broadcast({"type": "sys", "error": "RFCOMM closed"})


def _frame_checksum(data: bytes) -> int:
    return sum(data) & 0xFF


def split_frame(buf: bytes) -> tuple[Optional[bytes], bytes]:
    """Extract one validated Soundcore frame from a stream buffer.

    RFCOMM is a byte stream, so reads can split a frame or contain several
    frames. The current Soundcore families put the total frame length in
    bytes 7–8, but older captures are not always consistent. Trust a sane
    length only when its checksum validates; otherwise scan for a checksum
    boundary instead of consuming an arbitrary 64-byte chunk (which used to
    merge adjacent responses and lose every frame after it).

    ``b''`` is a progress sentinel: leading noise was discarded, but there is
    not yet a complete frame to return.
    """
    if len(buf) < 2:
        return None, buf

    header_at = next(
        (i for i in range(len(buf) - 1) if buf[i] in (0x08, 0x09) and buf[i + 1] in (0xEE, 0xFF)),
        None,
    )
    if header_at is None:
        # Keep a possible first half of the two-byte magic for the next read.
        return b"", buf[-1:] if buf[-1] in (0x08, 0x09) else b""
    if header_at:
        return b"", buf[header_at:]
    if len(buf) < 9:
        return None, buf

    indicated = buf[7] | (buf[8] << 8)
    if 10 <= indicated <= 512 and len(buf) >= indicated:
        candidate = buf[:indicated]
        if _frame_checksum(candidate[:-1]) == candidate[-1]:
            return candidate, buf[indicated:]

    # Fallback for legacy frames with a missing or inaccurate length field.
    # A few command families advertise a length one byte larger than the
    # actual frame (for example the captured 0x0E TWS ANC frame), so do not
    # wait forever for the indicated length when the checksum already closes
    # a shorter frame.
    limit = min(len(buf), 512)
    for end in range(10, limit + 1):
        if _frame_checksum(buf[: end - 1]) == buf[end - 1]:
            return buf[:end], buf[end:]

    # A complete frame may still be arriving. If the buffer is unreasonably
    # large, drop one byte so a later valid header can be found.
    if len(buf) > 512:
        return b"", buf[1:]
    return None, buf


def b64sha(key: str) -> str:
    digest = hashlib.sha1((key + GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


# One WebSocket connection is written from several threads at once: the
# handler thread sends command responses (connected/sent/error) while the
# RFCOMM reader thread broadcasts device frames, and the watchdog thread can
# interject a sys message. Two concurrent sendall() calls on the same socket
# can interleave mid-frame and corrupt the stream (the browser then drops the
# connection), so every frame write is serialised. Coarse but cheap: traffic
# on this socket is a handful of small JSON messages per second.
_WS_SEND_LOCK = threading.Lock()


def send_ws(sock: socket.socket, payload: bytes, opcode: int = 0x1) -> None:
    header = bytearray()
    header.append(0x80 | opcode)
    n = len(payload)
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header.extend(struct.pack("!H", n))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", n))
    with _WS_SEND_LOCK:
        sock.sendall(bytes(header) + payload)


def recv_ws(sock: socket.socket) -> Optional[bytes]:
    hdr = recvn(sock, 2)
    if not hdr:
        return None
    opcode = hdr[0] & 0x0F
    masked = bool(hdr[1] & 0x80)
    length = hdr[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", recvn(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recvn(sock, 8))[0]
    if length > WS_MAX_MESSAGE_BYTES:
        # Do not allocate whatever a 64-bit length header claims; drop this
        # client only. Legitimate renderer messages are a few hundred bytes.
        raise ValueError(f"oversized WebSocket frame ({length} bytes)")
    mask = recvn(sock, 4) if masked else b""
    data = recvn(sock, length)
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    if opcode == 0x8:
        return None
    if opcode == 0x9:
        send_ws(sock, data, 0xA)
        return b""
    return data


def recvn(sock: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return b""
        buf += chunk
    return buf


def _normalize_mac(raw: str) -> str:
    """Coerce 'a4c494123456' or 'A4:C4:94:12:34:56' into upper colon form; '' if invalid."""
    hexed = "".join(ch for ch in raw if ch in "0123456789abcdefABCDEF").upper()
    if len(hexed) != 12:
        return ""
    return ":".join(hexed[i : i + 2] for i in range(0, 12, 2))


def _parse_windows_scan_output(text: str) -> list[dict[str, object]]:
    """Parse the ``MAC|Name|Battery`` lines produced by PowerShell.

    Windows PowerShell can emit non-ASCII Bluetooth names using the active
    console code page. The caller explicitly decodes UTF-8, and this parser
    also removes the common all-question-mark placeholder instead of showing
    it as a device name in the UI.
    """
    devices: list[dict[str, object]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|", 2)
        mac_part = parts[0]
        name = parts[1].strip() if len(parts) > 1 else ""
        raw_battery = parts[2].strip() if len(parts) > 2 else ""
        mac = _normalize_mac(mac_part)
        if not mac or mac in seen:
            continue
        seen.add(mac)
        name = name.replace("\x00", "").strip()
        if not name or not name.strip("?"):
            name = mac
        battery: Optional[int] = None
        try:
            value = int(raw_battery)
            if 0 <= value <= 100:
                battery = value
        except (TypeError, ValueError):
            pass
        item: dict[str, object] = {"mac": mac, "name": name}
        if battery is not None:
            item["battery"] = battery
        devices.append(item)
    return devices


def _windows_paired_devices() -> list[dict[str, object]]:
    """Enumerate paired Bluetooth devices and Windows-reported battery levels.

    The registry contains every paired address, including earbuds that are
    already connected and playing audio. PnP exposes the friendly name and,
    on Windows 10/11 devices that publish the standard battery property,
    ``{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2`` contains the percentage.
    """
    script = r"""
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$levels = @{}
$names = @{}
Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | ForEach-Object {
    $id = [string]$_.InstanceId
    $friendly = [string]$_.FriendlyName
    $mac = ""
    if ($id -match '(?i)DEV_([0-9A-F]{12})') { $mac = $Matches[1].ToUpper() }
    elseif ($id -match '(?i)([0-9A-F]{12})_C[0-9A-F]+$') { $mac = $Matches[1].ToUpper() }
    if (-not $mac) { return }
    if ($friendly -and $friendly -notmatch '(?i)Microsoft Bluetooth|Bluetooth Enumerator|RFCOMM Protocol|Generic Attribute|A2DP|AVRCP|Hands-Free|Audio Gateway') {
        $existing = if ($names.ContainsKey($mac)) { [string]$names[$mac] } else { "" }
        if (-not $existing -or $friendly -match '(?i)soundcore|anker|liberty|life |space ') {
            $names[$mac] = $friendly
        }
    }
    $v = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue |
        Where-Object { $_.Type -ne 'Empty' -and $null -ne $_.Data } |
        Select-Object -First 1
    if ($null -ne $v) {
        try {
            $n = [int]$v.Data
            if ($n -ge 0 -and $n -le 100) { $levels[$mac] = $n }
        } catch { }
    }
}
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices' -ErrorAction SilentlyContinue |
    ForEach-Object {
        $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        $n = if ($p.Name -is [byte[]]) {
            [Text.Encoding]::Unicode.GetString([byte[]]$p.Name).Trim([char]0).Trim()
        } elseif ($null -ne $p.Name) {
            [string]$p.Name
        } else { "" }
        $key = $_.PSChildName.ToUpper()
        if ($names.ContainsKey($key) -and $names[$key]) { $n = [string]$names[$key] }
        if (-not $n -or -not $n.Trim("?")) { $n = $key }
        $b = if ($levels.ContainsKey($key)) { $levels[$key] } else { "" }
        "{0}|{1}|{2}" -f $key, $n, $b
    }
"""
    try:
        raw = subprocess.check_output(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except Exception:
        return []
    return _parse_windows_scan_output(raw)



_SCAN_CACHE: list[dict[str, object]] = []
_SCAN_CACHE_AT = 0.0
_SCAN_CACHE_TTL = 3.0
_SCAN_CACHE_LOCK = threading.Lock()


def scan_devices(fresh: bool = False) -> list[dict[str, object]]:
    # The packaged bridge is intentionally Windows-only. Windows registry and
    # PnP enumeration are what let us find already-paired devices reliably.
    # Enumeration shells out to PowerShell (~1-4s), so cache briefly: the
    # renderer polls for liveness separately via /health and only needs a
    # fresh device list on user refresh. Pass fresh=True (?fresh=1) to bypass.
    global _SCAN_CACHE, _SCAN_CACHE_AT
    if sys.platform != "win32":
        return []
    import time as _time

    now = _time.monotonic()
    with _SCAN_CACHE_LOCK:
        if not fresh and _SCAN_CACHE and (now - _SCAN_CACHE_AT) < _SCAN_CACHE_TTL:
            return [dict(d) for d in _SCAN_CACHE]
    devices = _windows_paired_devices()
    with _SCAN_CACHE_LOCK:
        _SCAN_CACHE = [dict(d) for d in devices]
        _SCAN_CACHE_AT = now
    return devices


BRIDGE = Bridge()


# --- Access control -----------------------------------------------------------
# The packaged renderer loads from file:// and sends Origin: null. A local
# development renderer may use http://localhost, so the bridge accepts only
# those Electron/local origins and never a public website origin.
LOCAL_ORIGIN_HOSTS = frozenset({"127.0.0.1", "localhost", "::1", "[::1]"})
DESKTOP_UA_MARKERS = ("Electron/", "soundcontrol/")
# Per-session secret minted by the desktop app (see electron-main.cjs).
BRIDGE_TOKEN: Optional[str] = None
TOKEN_SOURCE = ""  # "environment" | "flag" | "" (logged at startup, never the value)


def token_ok(presented: Optional[str]) -> bool:
    """True when `presented` matches the configured per-session secret.

    With no secret configured this is vacuously true: a manually run bridge
    stays usable without one, and the origin allowlist still applies.
    """
    if not BRIDGE_TOKEN:
        return True
    if not presented:
        return False
    try:
        return hmac.compare_digest(presented, BRIDGE_TOKEN)
    except TypeError:
        return False


def bearer_from(headers) -> Optional[str]:
    """Extract the caller's secret from an HTTP request, if it sent one."""
    auth = headers.get("Authorization", "")
    if auth[:7].lower() == "bearer ":
        return auth[7:].strip() or None
    token = headers.get("X-Bridge-Token", "").strip()
    return token or None


def origin_allowed(origin: Optional[str], user_agent: str = "") -> bool:
    """True when a request comes from the Windows renderer or local tooling."""
    if not origin:
        # Main-process probes, curl, tests, and native local tooling have no
        # Origin header and are already protected by loopback/token policy.
        return True
    if origin == "null":
        return any(marker in user_agent for marker in DESKTOP_UA_MARKERS)
    try:
        parts = urlsplit(origin)
        scheme, host = parts.scheme, (parts.hostname or "")
    except ValueError:
        return False
    if scheme in ("", "file"):
        return any(marker in user_agent for marker in DESKTOP_UA_MARKERS)
    return scheme == "http" and host in LOCAL_ORIGIN_HOSTS


# Redacts the per-session secret from access logs: the WebSocket handshake
# carries it as `GET /ws?token=...`, and Electron mirrors helper stderr into
# %AppData%\soundcontrol\main.log — the token must never land there.
_TOKEN_QS_RE = re.compile(r"([?&]token=)[^&\s\"']+", re.IGNORECASE)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: A003
        safe = tuple(_TOKEN_QS_RE.sub(r"\1<redacted>", str(a)) for a in args)
        sys.stderr.write("bridge: " + (fmt % safe) + "\n")

    # -- origin gate ---------------------------------------------------------
    def _origin(self) -> Optional[str]:
        return self.headers.get("Origin")

    def _allowed(self) -> bool:
        """Check the caller and log a rejection, so main.log explains a 403."""
        origin = self._origin()
        if origin_allowed(origin, self.headers.get("User-Agent", "")):
            return True
        sys.stderr.write(
            f"bridge: rejected {self.command} {self.path} from origin {origin!r}\n"
        )
        self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        body = json.dumps({"ok": False, "error": "origin not allowed by bridge"}).encode()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass
        return False

    def _token_ok(self) -> bool:
        """Enforce the per-session secret (a no-op when none is configured)."""
        if token_ok(bearer_from(self.headers)):
            return True
        sys.stderr.write(f"bridge: rejected {self.command} {self.path}: bad or missing token\n")
        self.send_response(401)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        body = json.dumps({"ok": False, "error": "bridge token required"}).encode()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass
        return False

    def _cors(self) -> None:
        origin = self._origin()
        self.send_header("Vary", "Origin")
        if origin:
            # Echo only the renderer/local origin already accepted by _allowed.
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization, x-bridge-token")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")

    def do_OPTIONS(self) -> None:  # noqa: N802
        # Preflights carry no Authorization header by design, so only the
        # origin gate applies here; the token is checked on the real request.
        if not self._allowed():
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if not self._allowed():
            return
        if self.headers.get("Upgrade", "").lower() == "websocket":
            # _ws() enforces the token itself: renderer handshakes cannot carry
            # custom headers, so the secret travels as ?token=.
            self._ws()
            return
        if not self._token_ok():
            return
        if self.path.startswith("/health"):
            body = json.dumps(
                {
                    "ok": True,
                    "connected": BRIDGE.sock is not None,
                    "mac": BRIDGE.mac,
                    "channel": BRIDGE.channel,
                }
            ).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/scan"):
            query = parse_qs(urlsplit(self.path).query)
            fresh = (query.get("fresh", [""])[0] or "").strip().lower() in ("1", "true", "yes")
            body = json.dumps({"devices": scan_devices(fresh=fresh)}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        page = (
            "<!doctype html><meta charset=utf-8><title>SoundControl bridge</title>"
            "<body style='font-family:sans-serif;background:#07080c;color:#f3efe6;padding:2rem'>"
            "<h1>SoundControl Windows helper</h1><p>Local IPC endpoint: <code>/ws</code></p>"
        ).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        self.wfile.write(page)

    def _ws(self) -> None:
        # The renderer cannot set custom headers on a WebSocket handshake, so
        # the desktop app authenticates with ?token= instead. Local tooling may
        # use the Authorization / X-Bridge-Token header like on HTTP.
        query = parse_qs(urlsplit(self.path).query)
        presented = (query.get("token", [None])[0]) or bearer_from(self.headers)
        if not token_ok(presented):
            sys.stderr.write("bridge: rejected WebSocket handshake: bad or missing token\n")
            body = json.dumps({"ok": False, "error": "bridge token required"}).encode()
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except OSError:
                pass
            return
        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = b64sha(key)
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        sock = self.connection
        with BRIDGE.lock:
            BRIDGE.clients.append(sock)
        try:
            send_ws(
                sock,
                json.dumps({"type": "hello", "devices": scan_devices(), "pid": os.getpid()}).encode(),
            )
            while True:
                msg = recv_ws(sock)
                if msg is None:
                    break
                if not msg:
                    continue
                self._handle(sock, msg)
        except ValueError as exc:
            # An oversized/garbled frame: drop this client with a clear line
            # in the log instead of allocating whatever it claimed.
            sys.stderr.write(f"bridge: closing WebSocket client: {exc}\n")
        except OSError:
            # The renderer vanished mid-read (window closed, app force-quit,
            # crash). One clean line — a socketserver traceback in main.log
            # here used to look like a bridge failure.
            sys.stderr.write("bridge: WebSocket client disconnected\n")
        finally:
            with BRIDGE.lock:
                BRIDGE.clients = [c for c in BRIDGE.clients if c is not sock]

    def _handle(self, sock: socket.socket, raw: bytes) -> None:
        try:
            msg = json.loads(raw.decode("utf-8"))
        except Exception:
            send_ws(sock, json.dumps({"type": "error", "error": "invalid json"}).encode())
            return
        kind = msg.get("type")
        try:
            if kind == "connect":
                BRIDGE.connect(str(msg.get("mac", "")), int(msg.get("channel", 4)))
                send_ws(
                    sock,
                    json.dumps(
                        {"type": "connected", "mac": BRIDGE.mac, "channel": BRIDGE.channel}
                    ).encode(),
                )
            elif kind == "tx":
                data = bytes.fromhex(str(msg.get("hex", "")).replace(" ", ""))
                if len(data) > TX_MAX_BYTES:
                    send_ws(
                        sock,
                        json.dumps(
                            {
                                "type": "error",
                                "error": f"tx payload too large ({len(data)} bytes; max {TX_MAX_BYTES})",
                            }
                        ).encode(),
                    )
                    return
                BRIDGE.send(data)
                send_ws(sock, json.dumps({"type": "sent", "n": len(data)}).encode())
            elif kind == "disconnect":
                BRIDGE.close()
                send_ws(sock, json.dumps({"type": "disconnected"}).encode())
            elif kind == "scan":
                send_ws(sock, json.dumps({"type": "hello", "devices": scan_devices()}).encode())
            else:
                send_ws(sock, json.dumps({"type": "error", "error": f"unknown {kind}"}).encode())
        except Exception as exc:  # noqa: BLE001
            send_ws(sock, json.dumps({"type": "error", "error": str(exc)}).encode())


def main() -> None:
    if sys.platform != "win32":
        raise SystemExit("SoundControl is a Windows-only desktop application")
    p = argparse.ArgumentParser(description="SoundControl Windows Bluetooth helper")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--mac", default="")
    p.add_argument("--channel", type=int, default=4)
    p.add_argument(
        "--token",
        default="",
        metavar="SECRET",
        help="Per-session secret required on every request. Prefer the "
        "SOUNDCONTROL_BRIDGE_TOKEN environment variable instead: command-line "
        "arguments are visible to other processes on the machine.",
    )
    p.add_argument(
        "--token-required",
        action="store_true",
        help="Refuse to start unless a token is configured (via --token or "
        "SOUNDCONTROL_BRIDGE_TOKEN).",
    )
    args = p.parse_args()
    global BRIDGE_TOKEN, TOKEN_SOURCE
    if args.token.strip():
        BRIDGE_TOKEN = args.token.strip()
        TOKEN_SOURCE = "flag"
        print(
            "bridge: WARNING --token puts the secret in argv, which other processes can "
            "read; prefer SOUNDCONTROL_BRIDGE_TOKEN",
            file=sys.stderr,
        )
    elif os.environ.get("SOUNDCONTROL_BRIDGE_TOKEN", "").strip():
        BRIDGE_TOKEN = os.environ["SOUNDCONTROL_BRIDGE_TOKEN"].strip()
        TOKEN_SOURCE = "environment"
    if args.token_required and not BRIDGE_TOKEN:
        p.error("--token-required was given but no token is configured")
    if BRIDGE_TOKEN:
        print(
            f"bridge: token auth enabled (secret from {TOKEN_SOURCE}); "
            "origin allowlist still applies",
            file=sys.stderr,
        )
    else:
        print(
            "bridge: no token configured — origin allowlist only "
            "(fine for manual/dev use; the desktop app always sets a per-session token)",
            file=sys.stderr,
        )
    if args.mac:
        try:
            BRIDGE.connect(args.mac, args.channel)
            print(f"preconnected {BRIDGE.mac} ch{BRIDGE.channel}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"preconnect failed: {exc}", file=sys.stderr)
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        # Anyone on the LAN could then write raw frames to the paired device.
        # A token authenticates the caller but the channel is still plain
        # HTTP, so loopback remains the only supported binding.
        print(
            f"bridge: WARNING binding {args.host}:{args.port} exposes Bluetooth writes "
            f"to the network ({'token required' if BRIDGE_TOKEN else 'no token configured'}); "
            "use the default 127.0.0.1",
            file=sys.stderr,
        )
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        # EADDRINUSE in practice means a previous SoundControl helper (or a
        # manual run) still owns the port. A raw traceback in main.log is not
        # actionable; say what happened instead. Electron captures this line.
        raise SystemExit(
            f"bridge: could not bind {args.host}:{args.port} ({exc}) — "
            "is another SoundControl bridge already running?"
        ) from exc
    print(f"SoundControl bridge http://{args.host}:{args.port}/ws", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        BRIDGE.close()
        httpd.server_close()


if __name__ == "__main__":
    main()
