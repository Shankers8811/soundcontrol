#!/usr/bin/env python3
"""SoundControl RFCOMM bridge — zero third-party dependencies.

Pipes exact Soundcore DSP frames (08 EE …) into Classic Bluetooth RFCOMM on
Windows and Linux hosts.

The DSP channel is not fixed: 4 on most earbuds, 10 on the P20i family, 12/15
on several over-ears, 30 on the Space 2. Rather than trusting the first
channel that accepts a socket, `Bridge.connect` sends the `01:01` handshake to
each candidate and keeps the first one that answers with a valid `09 FF`
frame. Pass --channel to start the probe somewhere else.

    python3 soundcore_bridge.py                      # loopback, port 8765
    python3 soundcore_bridge.py --mac AA:BB:CC:DD:EE:FF --channel 4

Access control: the bridge listens on the loopback interface and is intended
only for the packaged Windows/Linux desktop renderer. The renderer receives a
fresh per-session secret from Electron and sends it on every request (see token_ok):
HTTP callers send `Authorization: Bearer <token>` (or `X-Bridge-Token:`), and
the renderer connects to `/ws?token=<token>`. Configure manual runs with the
SOUNDCONTROL_BRIDGE_TOKEN environment variable or --token.

Talk to it from the desktop renderer over WebSocket JSON:

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
# AF_BLUETOOTH exists on Windows and Linux builds, but some CI Python
# distributions omit it, which used to kill the channel-probe unit tests with
# an AttributeError before their fake socket layer was even reached. Same
# getattr-guard pattern as RFCOMM above: on supported hosts the real constant
# is used; elsewhere the Linux value (31) is a safe stand-in because tests
# replace socket.socket wholesale.
AF_BLUETOOTH = getattr(socket, "AF_BLUETOOTH", 31)

# `08 EE 00 00 00 01 01 0A 00 02` — the state request the official app sends
# first. Every supported model answers it with a `09 FF` frame, which makes it
# the cheapest possible "is this really the DSP channel?" test.
HANDSHAKE = bytes.fromhex("08EE00000001010A0002")

# RFCOMM channels the Soundcore DSP has been observed on, most common first.
# The official app resolves this from SDP; desktop Bluetooth stacks do not
# expose a reliable vendor-service record in the same way, so the bridge
# probes in this order instead.
# Deliberately excluded: 12/13 are TOTA/BESOTA firmware-flash channels on some
# families (mervin008/soundcorebridge hard-blocks them for writes) and 16 is
# Apple iAP2. We only ever send a read-only state request, and probing never
# writes firmware, but the exclusion keeps a future write path from guessing.
DSP_CHANNEL_CANDIDATES = (4, 12, 15, 10, 30, 1)

# A cold desktop Bluetooth stack can take a couple of seconds to accept, and
# a busy headset a moment to answer. Kept short on purpose: the whole probe
# runs inside the renderer's connect timeout, so 6 candidates must fit in it.
PROBE_CONNECT_TIMEOUT = 2.5
PROBE_REPLY_TIMEOUT = 1.5

# A channel is adopted only after it answers the exact read-only 01:01
# handshake. An RFCOMM service that accepts a socket but stays silent may be
# hands-free/A2DP or a firmware channel; keeping it open would make later
# control writes unsafe, so silent channels are rejected rather than guessed.

# Input-size guards. The bridge only ever talks to the local desktop app, but
# a compromised or buggy local caller must not be able to make the helper
# allocate unbounded memory: WebSocket frames carry a 64-bit length header we
# used to trust blindly, and a `tx` hex string of any size was written
# straight to RFCOMM. Real Soundcore frames are at most 512 bytes (see
# split_frame), so both caps are far above any legitimate payload.
WS_MAX_MESSAGE_BYTES = 1 << 20  # 1 MiB per WebSocket message
TX_MAX_BYTES = 4096  # per RFCOMM write

# --- Earbud-only control boundary (Phase 17) --------------------------------
# SOUND CONTROL = EAR BUD / HEADPHONE DEVICE CONTROL, never host audio.
# This helper's only device I/O is the RFCOMM socket to the connected
# earbuds: it contains no Windows audio, mixer, endpoint or registry APIs and
# must never gain any. The host is touched only for transport discovery
# (read-only paired-device enumeration) and the helper's own process needs.
#
# The renderer validates outbound frames against the earbud command registry
# (src/protocol/targets.ts) before any write; the check below is an
# independent second gate, so even a buggy or hostile renderer cannot make
# this helper transmit anything but recognized Soundcore earbud commands.
# Keep this set in sync with the renderer's currently transmissible command
# set. The renderer registry still records the source-backed 01:85 factory
# reset for model-gating/evidence, but the helper deliberately excludes that
# destructive frame because it has no model identity and cannot authorize a
# reset safely on its own.
TX_ALLOWED_FRAMES = frozenset(
    {
        "01:01",  # state.request        (handshake)
        "01:03",  # battery.query
        "01:04",  # charging.query
        "01:05",  # device.info          (serial + firmware)
        # 01:85 factory reset is intentionally absent; see the policy comment.
        "01:87",  # game-mode.set
        "01:7F",  # ldac.query
        "01:FF",  # ldac.set
        "02:81",  # equalizer.set
        "02:83",  # equalizer.set-drc
        "03:87",  # equalizer.set-hearid (D1202 disabled HearID form)
        "02:86",  # surround.set
        "06:81",  # sound-modes.set      (ANC / transparency / wind)
        "0B:84",  # dual-audio.set
        "10:85",  # game-mode.set-a3947
    }
)

# Total RFCOMM frame lengths. The helper repeats the renderer's structural
# contract so a caller that bypasses the UI cannot send an arbitrary payload
# under a recognized CAT:TYPE. `06:81` is the only family with several
# documented lengths; its 4/6/7/8-byte payloads become 14/16/17/18 total.
TX_FRAME_LENGTHS = {
    "01:01": (10,),
    "01:03": (10,),
    "01:04": (10,),
    "01:05": (10,),
    "01:7F": (10,),
    "01:87": (11,),
    "01:FF": (11,),
    "02:81": (20, 32),
    "02:83": (32,),
    "02:86": (11,),
    "03:87": (124,),
    "06:81": (14, 16, 17, 18),
    "0B:84": (11,),
    "10:85": (11,),
}


def validate_tx_frame(data: bytes) -> Optional[str]:
    """Earbud-only transmission gate.

    Returns None when `data` is a recognized, checksum-valid Soundcore earbud
    command frame that may be transmitted to the device, or a human-readable
    rejection reason when it is not. Anything else — wrong header, incoherent
    length, bad checksum, or a CAT:TYPE outside the supported command set —
    is refused BEFORE it reaches the RFCOMM socket.
    """
    if len(data) < 10:
        return "not a Soundcore earbud protocol frame (too short)"
    if data[0:5] != b"\x08\xee\x00\x00\x00":
        return "not a Soundcore earbud protocol frame (bad header)"
    total = data[7] | (data[8] << 8)
    if total != len(data):
        return f"length field ({total}) does not match the frame ({len(data)} bytes)"
    if (sum(data[:-1]) & 0xFF) != data[-1]:
        return "checksum mismatch"
    key = f"{data[5]:02X}:{data[6]:02X}"
    if key not in TX_ALLOWED_FRAMES:
        return f"not a recognized supported earbud command ({key})"
    allowed_lengths = TX_FRAME_LENGTHS.get(key, ())
    if len(data) not in allowed_lengths:
        expected = " or ".join(str(n) for n in allowed_lengths) or "none"
        return f"unsupported payload shape for {key}: {len(data)} bytes (expected {expected})"
    return None


def _answers_handshake(buf: bytes) -> bool:
    """True only for a complete, exact `09 FF 01 01` state response.

    The declared total length is part of the framing contract. Do not use a
    checksum-only boundary fallback here: a silent/non-DSP service must never
    be promoted to an active control channel because arbitrary bytes happened
    to sum to a plausible checksum.
    """
    i = 0
    while i + 1 < len(buf):
        if buf[i] != 0x09 or buf[i + 1] != 0xFF:
            i += 1
            continue
        if i + 9 >= len(buf):
            return False  # header found, frame still arriving
        # The response to 01:01 must itself be the inbound 01:01 state frame.
        if buf[i + 5] != 0x01 or buf[i + 6] != 0x01:
            i += 2
            continue
        indicated = buf[i + 7] | (buf[i + 8] << 8)
        if not 10 <= indicated <= 512:
            i += 2
            continue
        if len(buf) < i + indicated:
            return False
        end = i + indicated
        if _frame_checksum(buf[i : end - 1]) == buf[end - 1]:
            return True
        i += 2
    return False


class Bridge:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.sock: Optional[socket.socket] = None
        self.mac = ""
        self.channel = 4
        self.clients: list[socket.socket] = []
        # Serialises writes to the RFCOMM socket: the WebSocket handler thread
        # can issue a command while another request is being handled, and
        # interleaved sendall() calls would garble frames on the device link.
        self.tx_lock = threading.Lock()
        # Serialises whole connect attempts (see connect()). Separate from
        # self.lock, which guards the WebSocket client list and is taken by
        # broadcast() *inside* a connect — nesting the two would deadlock.
        self.connect_lock = threading.Lock()

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
        channel that answers with a valid `09 FF 01 01` state frame is kept.
        If nothing answers, the bridge refuses to adopt an unproven RFCOMM
        service rather than risking later control writes on the wrong channel.
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
        if channel not in DSP_CHANNEL_CANDIDATES:
            allowed = ", ".join(str(candidate) for candidate in DSP_CHANNEL_CANDIDATES)
            raise RuntimeError(
                f"Unsupported RFCOMM channel {channel}; refusing to probe it. "
                f"Documented DSP candidates are: {allowed}"
            )
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

        # An accepting but silent RFCOMM service is not proven to be the
        # Soundcore DSP. Never adopt it: later writes could target a hands-free,
        # A2DP-control, or firmware service. The caller gets the complete probe
        # diagnosis and may retry after closing the phone app.
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
            "Leave the earbuds connected in this computer's Bluetooth settings "
            "(not in pairing mode) and close the Soundcore phone app — it holds "
            "the single control slot."
        )
        return " ".join(parts)

    def _adopt(self, sock: socket.socket, mac: str, ch: int) -> None:
        sock.settimeout(0.4)
        self.sock = sock
        self.mac = mac
        self.channel = ch
        threading.Thread(target=self._reader, daemon=True).start()

    @staticmethod
    def _probe(sock: socket.socket) -> bool:
        """Send 01:01; true only for a valid declared-length 01:01 reply."""
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
                    self.broadcast({"type": "rx", "hex": frame.hex().upper()})
        # Only the reader that still owns the active socket may clear state or
        # announce a link-down. A reconnect can replace self.sock while this
        # thread is unwinding; broadcasting the old reader's close used to
        # tear down the new renderer session as well.
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
    """Parse MAC|Name|Battery|Connected lines produced by PowerShell.

    Connected comes from the Bluetooth connection-state PnP property rather
    than from the pairing registry or PnP PresentOnly presence. This keeps
    paired, Bluetooth-connected, and RFCOMM-connected as separate states in
    the desktop UI.
    """
    devices: list[dict[str, object]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|", 3)
        mac_part = parts[0]
        name = parts[1].strip() if len(parts) > 1 else ""
        raw_battery = parts[2].strip() if len(parts) > 2 else ""
        raw_connected = parts[3].strip().lower() if len(parts) > 3 else ""
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
        # Missing/unsupported PnP property is UNKNOWN, not proof of link-down.
        if raw_connected in {"1", "true", "yes", "0", "false", "no"}:
            item["connected"] = raw_connected in {"1", "true", "yes"}
        if battery is not None:
            item["battery"] = battery
        devices.append(item)
    return devices


def _parse_bluetoothctl_devices_output(text: str) -> list[dict[str, object]]:
    """Parse ``bluetoothctl devices`` / ``paired-devices`` output.

    BlueZ prints one device per line as ``Device MAC friendly name``. Names
    may contain spaces, and a device can appear in more than one command's
    output, so addresses are normalized and deduplicated here rather than in
    the subprocess caller.
    """
    devices: list[dict[str, object]] = []
    by_mac: dict[str, dict[str, object]] = {}
    for line in text.splitlines():
        match = re.match(r"^\s*Device\s+([0-9A-Fa-f:]{12,17})(?:\s+(.*?))?\s*$", line)
        if not match:
            continue
        mac = _normalize_mac(match.group(1))
        if not mac:
            continue
        name = (match.group(2) or "").replace("\x00", "").strip()
        item = by_mac.get(mac)
        if item is None:
            item = {"mac": mac, "name": name or mac}
            by_mac[mac] = item
            devices.append(item)
        elif name and item.get("name") == mac:
            item["name"] = name
    return devices


def _parse_bluetoothctl_info_output(text: str) -> dict[str, object]:
    """Extract the useful fields from ``bluetoothctl info MAC`` output."""
    result: dict[str, object] = {}
    name = ""
    alias = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("Name:"):
            name = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Alias:"):
            alias = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Connected:"):
            state = stripped.split(":", 1)[1].strip().lower()
            if state in ("yes", "no"):
                result["connected"] = state == "yes"
        elif stripped.startswith("Battery Percentage:"):
            # BlueZ normally prints `0x5a (90)`, but older versions expose
            # only the hexadecimal value. Accept both without treating an
            # absent battery service as an error.
            value = re.search(r"\((\d{1,3})\)", stripped)
            if value is None:
                value = re.search(r"0x([0-9A-Fa-f]{1,2})", stripped)
            if value is not None:
                try:
                    battery = int(value.group(1), 16) if value.group(0).lower().startswith("0x") else int(value.group(1))
                    if 0 <= battery <= 100:
                        result["battery"] = battery
                except ValueError:
                    pass
    if alias and alias != "(null)":
        result["name"] = alias
    elif name and name != "(null)":
        result["name"] = name
    return result


def _bluetoothctl(*args: str) -> str:
    """Run a read-only bluetoothctl query, returning empty output on failure."""
    try:
        env = os.environ.copy()
        # Keep command/status words stable while allowing UTF-8 device names.
        env.setdefault("LC_ALL", "C.UTF-8")
        result = subprocess.run(
            ["bluetoothctl", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=4,
            check=False,
            env=env,
        )
    except (FileNotFoundError, OSError, subprocess.SubprocessError):
        return ""
    return result.stdout or ""


def _linux_paired_devices() -> list[dict[str, object]]:
    """Enumerate BlueZ-known devices and their connected/battery state.

    `bluetoothctl` is part of the standard BlueZ user tools and does not need
    root privileges for these read-only queries. We merge paired and cached
    discovery output so a device that is currently connected is visible even
    when a particular bluetoothctl version does not support the `Connected`
    filter. RFCOMM connection itself is still performed by the bridge socket.
    """
    discovered: list[dict[str, object]] = []
    seen: set[str] = set()
    for command in (("paired-devices",), ("devices",), ("devices", "Connected")):
        for item in _parse_bluetoothctl_devices_output(_bluetoothctl(*command)):
            mac = str(item["mac"])
            if mac in seen:
                continue
            seen.add(mac)
            discovered.append(item)

    for item in discovered:
        mac = str(item["mac"])
        info = _parse_bluetoothctl_info_output(_bluetoothctl("info", mac))
        if info.get("name"):
            item["name"] = info["name"]
        if "connected" in info:
            item["connected"] = info["connected"]
        if "battery" in info:
            item["battery"] = info["battery"]
    return discovered


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
$present = @{}
# PnP -PresentOnly means "present in the PnP tree", not necessarily
# currently connected over Bluetooth. The Bluetooth connection-state property
# is the authoritative host-side signal (DEVPROPKEY_Bluetooth_IsConnected,
# property 15); use it below while keeping paired addresses from the registry.
# Some adapters do not expose the property, so those devices remain paired with
# connected=unknown rather than being promoted by a weaker PresentOnly heuristic.
$connectedKey = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | ForEach-Object {
    $id = [string]$_.InstanceId
    $mac = ""
    if ($id -match '(?i)DEV_([0-9A-F]{12})') { $mac = $Matches[1].ToUpper() }
    elseif ($id -match '(?i)([0-9A-F]{12})_C[0-9A-F]+$') { $mac = $Matches[1].ToUpper() }
    if (-not $mac) { return }
    $state = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $connectedKey -ErrorAction SilentlyContinue |
        Where-Object { $_.Type -ne 'Empty' -and $null -ne $_.Data } |
        Select-Object -First 1
    if ($null -ne $state -and ([string]$state.Data) -match '(?i)^(true|false|1|0|yes|no)$') {
        if ([string]$state.Data -match '(?i)^(true|1|yes)$') { $present[$mac] = 'true' }
        elseif (-not $present.ContainsKey($mac)) { $present[$mac] = 'false' }
    }
}
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
        $connected = if ($present.ContainsKey($key)) { $present[$key] } else { "" }
        "{0}|{1}|{2}|{3}" -f $key, $n, $b, $connected
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
    # Windows uses the paired-device registry/PnP view; Linux uses BlueZ's
    # read-only bluetoothctl view. Both are deliberately polled by the
    # renderer so a device connected after launch appears without a manual
    # refresh. Enumeration shells out and can take seconds on a cold adapter,
    # so cache briefly; fresh=True (?fresh=1) bypasses the cache.
    global _SCAN_CACHE, _SCAN_CACHE_AT
    if sys.platform not in ("win32", "linux"):
        return []
    import time as _time

    now = _time.monotonic()
    with _SCAN_CACHE_LOCK:
        if not fresh and _SCAN_CACHE and (now - _SCAN_CACHE_AT) < _SCAN_CACHE_TTL:
            return [dict(d) for d in _SCAN_CACHE]
    devices = _windows_paired_devices() if sys.platform == "win32" else _linux_paired_devices()
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
    """True when a request comes from the desktop renderer or local tooling."""
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
            "<h1>SoundControl Bluetooth helper</h1><p>Local IPC endpoint: <code>/ws</code></p>"
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
        if not isinstance(msg, dict):
            # Valid JSON that is not an object (array/string/number/null) has
            # no "type" field. Answer with a clean error: letting msg.get()
            # raise AttributeError would drop the client silently and print a
            # socketserver traceback into the log — a malformed or hostile
            # local payload must never produce either.
            send_ws(sock, json.dumps({"type": "error", "error": "invalid message"}).encode())
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
                reason = validate_tx_frame(data)
                if reason:
                    # Earbud-only control boundary: the frame never reaches
                    # the Bluetooth socket. The reply is a clear error, not
                    # a silent drop, so the renderer can surface it.
                    send_ws(
                        sock,
                        json.dumps(
                            {"type": "error", "error": f"rejected: {reason}"}
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
    if sys.platform not in ("win32", "linux"):
        raise SystemExit("SoundControl supports Windows and Linux desktop hosts")
    p = argparse.ArgumentParser(description="SoundControl Windows/Linux Bluetooth helper")
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
        # A token authenticates the caller but the channel is still plain HTTP,
        # so a non-loopback bind is never permitted, even for manual runs.
        raise SystemExit(
            f"bridge: refusing non-loopback host {args.host!r}; "
            "the Bluetooth helper must bind to 127.0.0.1/localhost/::1"
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
