#!/usr/bin/env python3
"""SoundControl RFCOMM bridge — zero third-party dependencies.

Pipes exact Soundcore DSP frames (08 EE …) into Classic Bluetooth RFCOMM.
Default channel is 4; over-ears sometimes answer on 12 or 15.

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
import socket
import struct
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlsplit

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
RFCOMM = getattr(socket, "BTPROTO_RFCOMM", 3)


class Bridge:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.sock: Optional[socket.socket] = None
        self.mac = ""
        self.channel = 4
        self.clients: list[socket.socket] = []

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
        mac = mac.replace("-", ":").strip().upper()
        if not mac:
            raise RuntimeError("MAC address required")
        self.close()
        last_err: Optional[Exception] = None
        tried = [channel] + [c for c in (4, 12, 15, 1) if c != channel]
        for ch in tried:
            s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, RFCOMM)
            try:
                s.settimeout(8)
                s.connect((mac, ch))
                s.settimeout(0.4)
                self.sock = s
                self.mac = mac
                self.channel = ch
                threading.Thread(target=self._reader, daemon=True).start()
                return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                try:
                    s.close()
                except OSError:
                    pass
        raise RuntimeError(f"RFCOMM connect failed: {last_err}")

    def send(self, data: bytes) -> None:
        if not self.sock:
            raise RuntimeError("Not connected")
        self.sock.sendall(data)

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

    A partial buffer is never scanned for a boundary. An additive checksum
    matches a false boundary roughly once every 256 byte positions, so
    scanning a response that is still arriving used to emit a truncated
    garbage frame about 11% of the time — and RFCOMM splits responses across
    reads constantly. The advertised length is therefore authoritative until
    it has fully arrived; only then are the documented ±1 length variants of
    legacy firmware considered.

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

    if 10 <= indicated <= 512:
        if len(buf) >= indicated:
            # The advertised length has fully arrived, so it is safe to judge
            # the frame. Prefer the advertised length, then the documented
            # off-by-one variants of legacy firmware.
            for end in (indicated, indicated - 1, indicated + 1):
                if 10 <= end <= len(buf):
                    candidate = buf[:end]
                    if _frame_checksum(candidate[:-1]) == candidate[-1]:
                        return candidate, buf[end:]
        if len(buf) <= indicated:
            # Still arriving. Waiting is the only safe option: an additive
            # checksum matches a false boundary roughly once every 256 byte
            # positions, so scanning here emits truncated garbage. A legacy
            # off-by-one frame resolves on the next read, once the advertised
            # length (or anything beyond it) has arrived.
            return None, buf

    # The advertised length is missing, insane, or wrong by more than the
    # tolerable one byte, so resynchronize by scanning for a checksum
    # boundary. This only runs on a buffer that is complete as far as the
    # length field claims, or whose length field cannot be trusted at all.
    limit = min(len(buf), 512)
    for end in range(10, limit + 1):
        if _frame_checksum(buf[: end - 1]) == buf[end - 1]:
            return buf[:end], buf[end:]

    # No boundary yet. If the buffer is unreasonably large, drop one byte so a
    # later valid header can be found.
    if len(buf) > 512:
        return b"", buf[1:]
    return None, buf


def b64sha(key: str) -> str:
    digest = hashlib.sha1((key + GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: A003
        sys.stderr.write("bridge: " + (fmt % args) + "\n")

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
        send_ws(
            sock,
            json.dumps({"type": "hello", "devices": scan_devices(), "pid": os.getpid()}).encode(),
        )
        try:
            while True:
                msg = recv_ws(sock)
                if msg is None:
                    break
                if not msg:
                    continue
                self._handle(sock, msg)
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
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SoundControl bridge http://{args.host}:{args.port}/ws", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        BRIDGE.close()


if __name__ == "__main__":
    main()
