#!/usr/bin/env python3
"""Emulated SoundControl helper for startup/lifecycle e2e tests.

Runs the *real* `soundcore_bridge.py` HTTP/WebSocket server (token auth,
origin allowlist, JSON protocol, channel-probe logic) on Linux/macOS/Windows
without any Bluetooth hardware:

  * `socket.socket(AF_BLUETOOTH, ...)` is replaced with an in-process fake
    RFCOMM socket that behaves like a paired Soundcore device — it accepts on
    channel 4, answers the `08 EE … 01:0A` handshake with a checksum-valid
    `09 FF` frame, and acks every host frame while connected.
  * `scan_devices()` is replaced with a deterministic device list so the
    hello/scan responses can be asserted byte-for-byte.
  * `--startup-delay` reproduces the cold-start window in which Electron has
    already shown the renderer but the helper is not yet listening — the race
    the renderer's 15s WebSocket budget exists to survive.

The token is taken from SOUNDCONTROL_BRIDGE_TOKEN (exactly how Electron hands
it to the real helper) or --token.

Driven by `scripts/test_startup_e2e.mjs` (`npm run test:e2e`); not part of
the packaged application.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import socket
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE_PATH = os.path.join(ROOT, "soundcore_bridge.py")

spec = importlib.util.spec_from_file_location("soundcore_bridge", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(bridge)

# The emulated device: what the fake RFCOMM socket pretends to be.
EMULATED_MAC = "AA:BB:CC:DD:EE:FF"
EMULATED_NAME = "Soundcore Liberty 4 NC"
EMULATED_BATTERY = 80
EMULATED_CHANNEL = 4


def _device_frame(cat: int, typ: int, payload: bytes) -> bytes:
    """Build a checksum-valid `09 FF` device→host frame (see PROTOCOL.md)."""
    total = 10 + len(payload)
    body = bytes(
        [0x09, 0xFF, 0x00, 0x00, 0x01, cat, typ, total & 0xFF, (total >> 8) & 0xFF]
    ) + payload
    return body + bytes([sum(body) & 0xFF])


def _ack_payload(cat: int, typ: int) -> bytes:
    """Deterministic per-command replies, shaped like the real device's."""
    if (cat, typ) == (0x01, 0x05):
        # Serial + firmware: 10 bytes ASCII firmware, then 16 bytes serial.
        return b"04.88" + b"04.88" + b"EMU0000000000001"
    if (cat, typ) in ((0x01, 0x01), (0x01, 0x03)):
        return bytes([4, 4])  # left/right battery levels
    return b""


class FakeRfcomm:
    """Blocking-socket stand-in for a paired Soundcore device on channel 4.

    Semantics the real bridge depends on, all reproduced:
      * connect() to any other channel raises OSError (host down),
      * recv() blocks up to the configured timeout then raises socket.timeout,
      * every host frame (`08 EE …`) is answered with a valid `09 FF` frame,
      * close() wakes a blocking recv, which then raises OSError.
    """

    def __init__(self) -> None:
        self._inbox = bytearray()
        self._cond = threading.Condition()
        self._timeout: float | None = None
        self._closed = False
        self.channel: int | None = None

    def settimeout(self, value: float | None) -> None:
        self._timeout = value

    def getpeername(self) -> tuple:
        return (EMULATED_MAC, self.channel or EMULATED_CHANNEL)

    def connect(self, addr: tuple) -> None:
        _mac, channel = addr[0], int(addr[1])
        if channel != EMULATED_CHANNEL:
            raise OSError(112, "Host is down")
        self.channel = channel

    def sendall(self, data: bytes) -> None:
        if self._closed:
            raise OSError(9, "Bad file descriptor")
        if len(data) >= 9 and data[0] == 0x08 and data[1] == 0xEE:
            frame = _device_frame(data[5], data[6], _ack_payload(data[5], data[6]))
            with self._cond:
                self._inbox += frame
                self._cond.notify_all()

    def recv(self, n: int) -> bytes:
        deadline = None if self._timeout is None else time.monotonic() + self._timeout
        with self._cond:
            while not self._inbox and not self._closed:
                if deadline is None:
                    self._cond.wait(0.05)
                    continue
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise socket.timeout()
                self._cond.wait(min(remaining, 0.05))
            if self._closed and not self._inbox:
                raise OSError(9, "Bad file descriptor")
            out = bytes(self._inbox[:n])
            del self._inbox[:n]
            return out

    def close(self) -> None:
        with self._cond:
            self._closed = True
            self._cond.notify_all()


def _install_fake_rfcomm() -> None:
    """Route AF_BLUETOOTH sockets to FakeRfcomm; everything else stays real."""
    # Some CI Python builds omit socket.AF_BLUETOOTH entirely (the bridge
    # module guards it with a getattr fallback). Inject the same Linux value
    # here so every socket layer in this process agrees on the family, and
    # compare against the constant the bridge actually passes.
    if not hasattr(socket, "AF_BLUETOOTH"):
        socket.AF_BLUETOOTH = 31  # type: ignore[attr-defined]
    af_bluetooth = bridge.AF_BLUETOOTH
    real_socket = socket.socket

    def factory(family: int = -1, type: int = -1, proto: int = -1, *args, **kwargs):
        if family == af_bluetooth:
            return FakeRfcomm()
        return real_socket(family, type, proto, *args, **kwargs)

    socket.socket = factory  # type: ignore[misc]


def _install_fake_scan() -> None:
    def fake_scan(fresh: bool = False) -> list[dict[str, object]]:
        return [{"mac": EMULATED_MAC, "name": EMULATED_NAME, "battery": EMULATED_BATTERY}]

    bridge.scan_devices = fake_scan  # type: ignore[assignment]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--token", default="")
    p.add_argument(
        "--startup-delay",
        type=float,
        default=0.0,
        help="Seconds to wait before binding — emulates the Python cold start "
        "window in which the renderer is already up but the helper is not.",
    )
    args = p.parse_args()

    token = args.token.strip() or os.environ.get("SOUNDCONTROL_BRIDGE_TOKEN", "").strip()
    if token:
        bridge.BRIDGE_TOKEN = token
        bridge.TOKEN_SOURCE = "environment"

    _install_fake_rfcomm()
    _install_fake_scan()

    if args.startup_delay > 0:
        time.sleep(args.startup_delay)

    httpd = bridge.ThreadingHTTPServer((args.host, args.port), bridge.Handler)
    # Machine-readable readiness line for the Node harness (stdout, flushed).
    print(
        f'{{"event":"ready","host":"{args.host}","port":{args.port},"pid":{os.getpid()}}}',
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
