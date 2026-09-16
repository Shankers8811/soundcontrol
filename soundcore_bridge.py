#!/usr/bin/env python3
"""SoundControl RFCOMM bridge — zero third-party dependencies.

Pipes exact Soundcore DSP frames (08 EE …) into Classic Bluetooth RFCOMM.
Default channel is 4; over-ears sometimes answer on 12 or 15.

    python3 soundcore_bridge.py                      # loopback, port 8765
    python3 soundcore_bridge.py --mac AA:BB:CC:DD:EE:FF --channel 4
    python3 soundcore_bridge.py --allow-origin https://you.github.io

Access control: the bridge listens on the loopback interface, so it is not
reachable from the network — but *your browser* can reach it from any page you
visit, and /scan plus the WebSocket can read your paired-device list and write
raw frames to your hearing. Requests from web content are therefore answered
only for origins this project ships or develops against (see origin_allowed).

On top of that, the desktop app mints a fresh per-session secret on every
launch and requires it on every request (see token_ok): HTTP callers send
`Authorization: Bearer <token>` (or `X-Bridge-Token:`), WebSocket clients
connect to `/ws?token=<token>`. Configure it with the SOUNDCONTROL_BRIDGE_TOKEN
environment variable (preferred: argv is visible to other processes) or --token.
Without a token the bridge keeps the origin-allowlist behaviour, so running it
by hand for development works exactly as before.

Talk to it from the web UI over WebSocket JSON:

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


def _parse_windows_scan_output(text: str) -> list[dict[str, str]]:
    """Parse the 'MAC|Name' lines produced by the PowerShell snippet below."""
    devices: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        mac_part, _, name = line.partition("|")
        mac = _normalize_mac(mac_part)
        if not mac or mac in seen:
            continue
        seen.add(mac)
        devices.append({"mac": mac, "name": name.strip() or mac})
    return devices


def _windows_paired_devices() -> list[dict[str, str]]:
    """Enumerate devices Windows has paired, with their MAC addresses.

    HKLM\\SYSTEM\\CurrentControlSet\\Services\\BTHPORT\\Parameters\\Devices holds one
    subkey per paired classic Bluetooth device: the key name is the BD_ADDR and the
    (UTF-16) Name value the friendly name. Crucially this also lists earbuds that
    are currently *connected* and playing audio — devices a BLE scan can never see,
    which makes this exactly the right set for the RFCOMM bridge (it can only reach
    paired devices anyway). PowerShell ships with Windows, so the bridge stays
    zero-dependency.
    """
    script = (
        "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\BTHPORT\\Parameters\\Devices' "
        "| ForEach-Object { "
        "$p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; "
        "$n = if ($p.Name -is [byte[]]) { [Text.Encoding]::Unicode.GetString($p.Name).Trim([char]0) } "
        "elseif ($null -ne $p.Name) { [string]$p.Name } else { [string]$p.'(default)' }; "
        "\"{0}|{1}\" -f $_.PSChildName, $n }"
    )
    try:
        raw = subprocess.check_output(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=10,
        )
    except Exception:
        return []
    return _parse_windows_scan_output(raw)


def scan_devices() -> list[dict[str, str]]:
    if sys.platform == "win32":
        return _windows_paired_devices()
    out: list[dict[str, str]] = []
    try:
        raw = subprocess.check_output(
            ["bluetoothctl", "devices"], stderr=subprocess.DEVNULL, text=True, timeout=3
        )
        for line in raw.splitlines():
            parts = line.split(None, 2)
            if len(parts) >= 3 and parts[0] == "Device":
                out.append({"mac": parts[1], "name": parts[2]})
    except Exception:
        pass
    return out


BRIDGE = Bridge()


# --- Access control -----------------------------------------------------------
# Who may talk to the bridge from a browser. A web page can send a fetch() or a
# WebSocket to http://127.0.0.1:8765, so "it only listens on loopback" is not a
# defence: the attack path is the victim's own browser. Answers are restricted
# to clients this project ships, plus any non-browser client (local code that
# could already open RFCOMM by itself gains nothing from a browser check).
LOCAL_ORIGIN_HOSTS = frozenset({"127.0.0.1", "localhost", "::1", "[::1]"})
# The published web app. It cannot reach an http/ws loopback service from an
# https origin under Private Network Access rules, but allow it so a locally
# hosted or proxied build keeps working.
BUNDLED_WEB_ORIGINS = frozenset({"https://shankers8811.github.io"})
# The packaged desktop app loads from file://, an opaque origin, so its requests
# carry "Origin: null". A web page can arrange a null origin too (a sandboxed
# iframe), so null alone is not proof — the desktop app is identified by its
# Electron user agent, which a page cannot forge (User-Agent is a forbidden
# header name for fetch() and WebSocket).
DESKTOP_UA_MARKERS = ("Electron/", "soundcontrol/")
EXTRA_ALLOWED_ORIGINS: set[str] = set()
ALLOW_ANY_ORIGIN = False
# Per-session secret minted by the desktop app (see electron-main.cjs). None
# when the bridge is run by hand, in which case the origin allowlist above is
# the whole boundary, exactly as before.
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
    """True when a browser request carrying `origin` may reach the bridge."""
    if ALLOW_ANY_ORIGIN:
        return True
    if not origin:
        # No Origin header at all: not web content (app main process probe,
        # curl, tests, native helpers).
        return True
    if origin in EXTRA_ALLOWED_ORIGINS:
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
    if scheme == "http":
        # The dev server (http://localhost:5173) and the bridge's own origin.
        return host in LOCAL_ORIGIN_HOSTS
    if scheme == "https":
        return origin in BUNDLED_WEB_ORIGINS
    return False


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
        if ALLOW_ANY_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif origin:
            # Echo the exact origin so that *our* client can read the response.
            # A wildcard here is what let any web page read /scan.
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
            # _ws() enforces the token itself: handshakes cannot carry
            # headers from a browser, so the secret travels as ?token=.
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
            body = json.dumps({"devices": scan_devices()}).encode()
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
            "<h1>SoundControl RFCOMM bridge</h1><p>WebSocket endpoint: <code>/ws</code></p>"
        ).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        self.wfile.write(page)

    def _ws(self) -> None:
        # Browsers cannot set headers on a WebSocket handshake, so the desktop
        # app authenticates with ?token= instead (non-browser clients may use
        # the Authorization / X-Bridge-Token header like on HTTP).
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
    p = argparse.ArgumentParser(description="SoundControl RFCOMM bridge")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--mac", default="")
    p.add_argument("--channel", type=int, default=4)
    p.add_argument(
        "--allow-origin",
        action="append",
        default=[],
        metavar="ORIGIN",
        help="Extra browser origin allowed to use the bridge, e.g. https://you.github.io. "
        "Pass '*' to answer any origin (not recommended: any web page you visit could "
        "then read your paired devices and write to your earbuds).",
    )
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
    global ALLOW_ANY_ORIGIN, BRIDGE_TOKEN, TOKEN_SOURCE
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
    for item in args.allow_origin:
        value = item.strip().rstrip("/")
        if value == "*":
            ALLOW_ANY_ORIGIN = True
            print("bridge: WARNING allowing any origin (--allow-origin *)", file=sys.stderr)
        elif value:
            EXTRA_ALLOWED_ORIGINS.add(value)
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
