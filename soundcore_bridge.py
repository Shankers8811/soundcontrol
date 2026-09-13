#!/usr/bin/env python3
"""SoundControl RFCOMM bridge — zero third-party dependencies.

Pipes exact Soundcore DSP frames (08 EE …) into Classic Bluetooth RFCOMM.
Default channel is 4; over-ears sometimes answer on 12 or 15.

    python3 soundcore_bridge.py --host 0.0.0.0 --port 8765
    python3 soundcore_bridge.py --mac AA:BB:CC:DD:EE:FF --channel 4

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
import json
import os
import socket
import struct
import subprocess
import sys
import threading
import hashlib
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

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
        if s:
            try:
                s.close()
            except OSError:
                pass

    def _reader(self) -> None:
        buf = b""
        while self.sock:
            try:
                chunk = self.sock.recv(1024)
            except socket.timeout:
                continue
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            while True:
                frame, buf = split_frame(buf)
                if frame is None:
                    break
                self.broadcast({"type": "rx", "hex": frame.hex().upper()})
        self.broadcast({"type": "sys", "error": "RFCOMM closed"})


def split_frame(buf: bytes) -> tuple[Optional[bytes], bytes]:
    if len(buf) < 10:
        return None, buf
    if buf[0] in (0x08, 0x09) and buf[1] in (0xEE, 0xFF):
        # Prefer explicit little-endian total_len when it looks sane.
        total = buf[7] | (buf[8] << 8)
        if 10 <= total <= 512 and total <= len(buf):
            return buf[:total], buf[total:]
        # Classic frames: consume a reasonable chunk (up to 64) ending at checksum.
        take = min(len(buf), 64)
        return buf[:take], buf[take:]
    return buf[:1], buf[1:]


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


def scan_devices() -> list[dict[str, str]]:
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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: A003
        sys.stderr.write("bridge: " + (fmt % args) + "\n")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.headers.get("Upgrade", "").lower() == "websocket":
            self._ws()
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
    args = p.parse_args()
    if args.mac:
        try:
            BRIDGE.connect(args.mac, args.channel)
            print(f"preconnected {BRIDGE.mac} ch{BRIDGE.channel}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"preconnect failed: {exc}", file=sys.stderr)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SoundControl bridge http://{args.host}:{args.port}/ws", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        BRIDGE.close()


if __name__ == "__main__":
    main()
