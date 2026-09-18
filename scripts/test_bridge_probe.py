#!/usr/bin/env python3
"""Unit tests for the RFCOMM channel probe in soundcore_bridge.py.

Run with `npm run test:bridge` (or `python3 scripts/test_bridge_probe.py`).

The bug these guard against: accepting an RFCOMM socket is not proof the
channel is the Soundcore DSP. Hands-free and A2DP control channels accept a
connection and then never answer, which used to leave the app showing
"Connected" with no battery and no ANC. `Bridge.connect` now handshakes every
candidate and keeps the first channel that actually replies.

No Bluetooth hardware and no Windows are required: `socket.socket` is replaced
with a fake that scripts what each channel does.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import socket
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE_PATH = os.path.join(ROOT, "soundcore_bridge.py")

spec = importlib.util.spec_from_file_location("soundcore_bridge", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(bridge)

passed = 0
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
    else:
        # Long logs are truncated so a failure stays readable.
        if len(detail) > 400:
            detail = detail[:400] + f"… ({len(detail)} chars)"
        failures.append(f"{label}{' — ' + detail if detail else ''}")


# A real, checksum-valid `09 FF` state reply (103-byte payload trimmed to the
# minimum that still parses: header + length + checksum must be coherent).
def reply_frame(payload: bytes) -> bytes:
    total = 10 + len(payload)
    body = bytes([0x09, 0xFF, 0x00, 0x00, 0x01, 0x01, 0x01, total & 0xFF, (total >> 8) & 0xFF]) + payload
    return body + bytes([sum(body) & 0xFF])


INFO_REPLY = reply_frame(bytes(range(43)))


class FakeSocket:
    """Stand-in for a Bluetooth RFCOMM socket with scripted behaviour."""

    def __init__(self, behaviour: str, log: list[str], channel: int) -> None:
        self.behaviour = behaviour
        self.log = log
        self.channel = channel
        self.sent: list[bytes] = []
        self.closed = False

    def settimeout(self, _value: float) -> None:
        return None

    def connect(self, addr: tuple) -> None:
        self.log.append(f"connect:{addr[1]}")
        if self.behaviour.startswith("refuse"):
            raise OSError(112, "Host is down")

    def sendall(self, data: bytes) -> None:
        self.sent.append(data)
        self.log.append(f"send:{self.channel}")

    def recv(self, _n: int) -> bytes:
        if self.behaviour == "answer":
            return INFO_REPLY
        if self.behaviour == "answer-split":
            # First read yields half a frame; the parser must wait.
            self.behaviour = "answer-tail"
            return INFO_REPLY[:6]
        if self.behaviour == "answer-tail":
            return INFO_REPLY[6:]
        if self.behaviour == "noise-then-answer":
            self.behaviour = "answer"
            return b"\x00\x01\x02" + INFO_REPLY
        if self.behaviour == "garbage":
            return b"\xAA\xBB\xCC\xDD" * 8
        if self.behaviour == "late-answer":
            # Silent through the probe and the first watchdog wait; answers
            # exactly once after the second handshake send — the control slot
            # freeing up mid-session.
            if len(self.sent) >= 2 and not getattr(self, "_answered", False):
                self._answered = True
                return INFO_REPLY
            raise socket.timeout()
        raise socket.timeout()

    def close(self) -> None:
        self.closed = True
        self.log.append(f"close:{self.channel}")


def run(behaviours: dict, requested: int = 4, hold: float = 0.0):
    """Drive Bridge.connect with `behaviours` mapping channel -> behaviour.

    `hold` keeps the adopted link open that many seconds before closing, so
    time-based behaviour (the silent-link watchdog) gets to fire while stderr
    is still captured.
    """
    log: list[str] = []
    created: list[FakeSocket] = []

    def factory(_family, _type, _proto):
        # The channel is only known once connect() is called, so hand back a
        # socket whose channel is filled in then.
        sock = FakeSocket("pending", log, -1)
        created.append(sock)
        return sock

    real_socket = socket.socket
    bridge.socket.socket = factory  # type: ignore[attr-defined]

    b = bridge.Bridge()
    b.broadcast = lambda payload: log.append(f"broadcast:{payload.get('message', payload.get('type'))}")  # type: ignore[method-assign]

    # Patch connect so the fake learns its channel and behaviour.
    def patched_connect(self, addr):
        self.channel = addr[1]
        self.behaviour = behaviours.get(addr[1], "refuse")
        log.append(f"connect:{addr[1]}")
        if self.behaviour.startswith("refuse"):
            raise OSError(112, "Host is down")

    FakeSocket.connect = patched_connect  # type: ignore[method-assign]

    error: Exception | None = None
    adopted = False
    captured = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured):
            b.connect("AA:BB:CC:DD:EE:FF", requested)
            adopted = b.sock is not None
            if hold:
                time.sleep(hold)
    except Exception as exc:  # noqa: BLE001
        error = exc
    finally:
        log.append(f"stderr:{captured.getvalue()}")
        bridge.socket.socket = real_socket  # type: ignore[attr-defined]
        # Stop the reader thread: with the fake socket it would otherwise spin
        # forever re-reading the same scripted reply.
        b.close()
    return b, log, error, created, adopted


print("Bridge channel-probe tests\n")

# 1. The first candidate answers: it must be adopted immediately.
b, log, err, _, adopted = run({4: "answer"})
check("ch4 answers -> adopted", err is None and b.channel == 4, str(err))
check("ch4 answers -> handshake sent", any("send:4" in x for x in log), str(log))
check("ch4 answers -> reports the channel", any("DSP answered on channel 4" in x for x in log))
check("ch4 answers -> socket adopted and reader started", adopted)

# 2. ch4 accepts but stays silent; ch12 answers. This is the exact failure the
#    old code got wrong.
b, log, err, _, adopted = run({4: "silent", 12: "answer"})
check("silent ch4 + answering ch12 -> picks ch12", err is None and b.channel == 12, f"{err} ch={b.channel}")
check("silent ch4 was probed with a handshake", any("send:4" in x for x in log), str(log))
check("silent ch4 socket was closed", any("close:4" in x for x in log), str(log))
# The per-channel reason goes to stderr (which the packaged app captures into
# %AppData%\soundcontrol\main.log), not to the WebSocket log.
stderr_text = next((x for x in log if x.startswith("stderr:")), "")
check(
    "picks ch12 -> stderr explains why ch4 was rejected",
    "channel 4 accepted the socket but never answered" in stderr_text,
    stderr_text,
)

# 3. The P20i family answers on channel 10, which the old candidate list did
#    not even try.
b, log, err, _, adopted = run({4: "refuse", 12: "refuse", 15: "refuse", 10: "answer"})
check("P20i ch10 is in the candidate list", err is None and b.channel == 10, f"{err} ch={b.channel}")

# 4. A split frame must still be recognised.
b, log, err, _, adopted = run({4: "answer-split"})
check("split frame across two reads -> adopted", err is None and b.channel == 4, str(err))

# 5. Leading stream noise before the frame must be skipped.
b, log, err, _, adopted = run({4: "noise-then-answer"})
check("noise before the frame -> adopted", err is None and b.channel == 4, str(err))

# 6. Garbage that never forms a valid frame must not be mistaken for a reply.
b, log, err, _, adopted = run({4: "garbage", 12: "answer"})
check("garbage on ch4 is not a reply -> falls through to ch12", err is None and b.channel == 12, f"{err} ch={b.channel}")

# 7. Nothing answers but something accepts: fall back and say so loudly.
b, log, err, _, adopted = run({4: "silent", 12: "silent"})
check("all silent -> still connects (manual use)", err is None and b.channel == 4, f"{err}")
check("all silent -> warns about no handshake", any("did not answer" in x for x in log), str(log))

# 8. Nothing at all accepts: the error must explain what to do.
b, log, err, _, adopted = run({})
check("nothing accepts -> raises", err is not None)
check("error names the DSP channel problem", err is not None and "DSP channel" in str(err), str(err))
check("error tells the user to leave the buds connected", err is not None and "Windows Bluetooth" in str(err), str(err))
check(
    "error no longer tells the user to use pairing mode",
    err is not None and "Put them in pairing mode" not in str(err),
    str(err),
)
check(
    "error says to leave the buds connected instead",
    err is not None and "not in pairing mode" in str(err),
    str(err),
)

# 9. A requested channel is tried first, so --channel still works.
b, log, err, _, adopted = run({15: "answer", 4: "answer"}, requested=15)
check("requested channel wins", err is None and b.channel == 15, f"{err} ch={b.channel}")

# 10. The whole probe must fit inside the renderer's connect timeout.
worst = len(bridge.DSP_CHANNEL_CANDIDATES) * (
    bridge.PROBE_CONNECT_TIMEOUT + bridge.PROBE_REPLY_TIMEOUT
)
check(
    f"worst-case probe ({worst:.1f}s) fits the 30s renderer timeout",
    worst < 30,
    f"{worst:.1f}s",
)
check("handshake is the 01:01 state request", bridge.HANDSHAKE.hex().upper() == "08EE00000001010A0002")
check(
    "firmware-flash channels are not probed",
    13 not in bridge.DSP_CHANNEL_CANDIDATES and 16 not in bridge.DSP_CHANNEL_CANDIDATES,
    str(bridge.DSP_CHANNEL_CANDIDATES),
)

# 11. _answers_handshake unit behaviour.
check("empty buffer is not an answer", bridge._answers_handshake(b"") is False)
check("partial header is not an answer", bridge._answers_handshake(b"\x09") is False)
check("valid frame is an answer", bridge._answers_handshake(INFO_REPLY) is True)
check("truncated frame is not an answer", bridge._answers_handshake(INFO_REPLY[:-1]) is False)
check("bad checksum is not an answer", bridge._answers_handshake(INFO_REPLY[:-1] + b"\x00") is False)
check("frame after noise is an answer", bridge._answers_handshake(b"\x01\x02\x03" + INFO_REPLY) is True)
check("two frames in one read is an answer", bridge._answers_handshake(INFO_REPLY + INFO_REPLY) is True)

# 12. split_frame still round-trips a reply.
frame, rest = bridge.split_frame(INFO_REPLY)
check("split_frame returns the whole frame", frame == INFO_REPLY, f"{frame!r}")
check("split_frame leaves nothing behind", rest == b"", f"{rest!r}")
two, rest2 = bridge.split_frame(INFO_REPLY + INFO_REPLY)
check("split_frame returns one frame at a time", two == INFO_REPLY and rest2 == INFO_REPLY)

# 12b. Input hardening: malformed addresses and pathological buffers must be
#      rejected cleanly — never a confusing OS error, never a crash or an
#      unbounded scan.
bad = bridge.Bridge()
mac_error: Exception | None = None
try:
    bad.connect("nope", 4)
except Exception as exc:  # noqa: BLE001
    mac_error = exc
check("invalid MAC raises before any socket work", mac_error is not None)
check(
    "invalid MAC error names the address problem",
    mac_error is not None and "Invalid Bluetooth address" in str(mac_error),
    str(mac_error),
)
empty_error: Exception | None = None
try:
    bad.connect("", 4)
except Exception as exc:  # noqa: BLE001
    empty_error = exc
check("empty MAC raises too", empty_error is not None and "Invalid Bluetooth address" in str(empty_error), str(empty_error))
check(
    "dashed/lowercase MACs are normalised, not rejected",
    bridge._normalize_mac("aa-bb-cc-dd-ee-ff") == "AA:BB:CC:DD:EE:FF",
)

progress, tail = bridge.split_frame(b"\x00" * 600)
check(
    "oversized pure-noise buffer is discarded in one bounded step",
    progress == b"" and tail == b"",
    f"{progress!r} / {len(tail)} bytes left",
)
progress2, tail2 = bridge.split_frame(b"\x09\xFF" + b"\x00" * 600)
check(
    "oversized buffer with a magic header shrinks one byte at a time (no crash, no hang)",
    progress2 == b"" and len(tail2) == 601 and tail2[:1] == b"\xFF",
    f"{progress2!r} / {len(tail2)} bytes left",
)
check("large garbage is never mistaken for a handshake answer", bridge._answers_handshake(b"\xAA" * 4096) is False)
check("empty payload splits to a no-op", bridge.split_frame(b"") == (None, b""))

# 13. Silent-link watchdog: a silent fallback link must be named out loud
#     instead of leaving the UI at a fake "Connected".
old_watchdog = bridge.SILENT_LINK_WATCHDOG_S
bridge.SILENT_LINK_WATCHDOG_S = 0.3
try:
    b, log, err, _, adopted = run({4: "silent"}, hold=0.8)
    check("silent fallback stays adopted for manual use", err is None and adopted, str(err))
    stderr_text = next((x for x in log if x.startswith("stderr:")), "")
    check(
        "silent-link watchdog fires on a dead link",
        "silent-link watchdog" in stderr_text,
        stderr_text[:400],
    )
    check(
        "watchdog tells the user what holds the control slot",
        "control slot" in stderr_text,
        stderr_text[:400],
    )
    # An answering link must never trip the watchdog.
    b, log, err, _, adopted = run({4: "answer"}, hold=0.8)
    stderr_text = next((x for x in log if x.startswith("stderr:")), "")
    check("answering link -> no watchdog", "silent-link watchdog" not in stderr_text, stderr_text[:400])

    # 14. Self-healing: the slot frees up mid-session, the device answers a
    #     background retry, and the bridge must announce it — no manual
    #     reconnect needed.
    b, log, err, _, adopted = run({4: "late-answer"}, hold=1.2)
    check("late answer -> adopted", err is None and adopted, str(err))
    stderr_text = next((x for x in log if x.startswith("stderr:")), "")
    check("late answer -> watchdog reported the silence first", "silent-link watchdog" in stderr_text, stderr_text[:400])
    check(
        "late answer -> promotion message says battery/ANC are live",
        "after retry" in stderr_text and "live now" in stderr_text,
        stderr_text[:400],
    )
    check(
        "late answer -> device frame reached the renderer",
        any(x.startswith("broadcast:rx") for x in log),
        str([x for x in log if "broadcast" in x][:6]),
    )

    # 15. The silent-fallback message must not swallow the refused channels.
    b, log, err, _, adopted = run({4: "silent", 12: "silent"}, hold=0.4)
    stderr_text = next((x for x in log if x.startswith("stderr:")), "")
    check("fallback -> still warns about the missing handshake", "did not answer" in stderr_text, stderr_text[:400])
    check(
        "fallback -> names the refused channels too",
        "ch15" in stderr_text and "Host is down" in stderr_text,
        stderr_text[:400],
    )
finally:
    bridge.SILENT_LINK_WATCHDOG_S = old_watchdog

# 16. WS command robustness: malformed or non-object JSON must receive a clean
#     error reply. An exception escaping _handle (e.g. AttributeError from
#     msg.get() on a JSON array) used to drop the client silently and print a
#     socketserver traceback into main.log — hostile or buggy local payloads
#     must never achieve either.
class FakeWsSock:
    """Captures the server's WebSocket frames without a real socket."""

    def __init__(self) -> None:
        self.sent = bytearray()

    def sendall(self, data: bytes) -> None:
        self.sent.extend(data)


def ws_reply(sock: FakeWsSock):
    """Decode the first (unmasked, server->client) text frame as JSON."""
    raw = bytes(sock.sent)
    assert raw and raw[0] == 0x81, f"not a text frame: {raw[:4]!r}"
    n = raw[1] & 0x7F
    assert not (raw[1] & 0x80), "server frames must be unmasked"
    if n < 126:
        return bridge.json.loads(raw[2 : 2 + n].decode())
    assert n == 126, "test payloads are far below the 64 KiB frame size"
    length = int.from_bytes(raw[2:4], "big")
    return bridge.json.loads(raw[4 : 4 + length].decode())


for label, payload in (
    ("garbage bytes", b"\xff\xfe not json at all"),
    ("JSON array", bridge.json.dumps([1, 2, 3]).encode()),
    ("JSON string", bridge.json.dumps("connect").encode()),
    ("JSON number", bridge.json.dumps(42).encode()),
    ("JSON null", b"null"),
    ("empty object", b"{}"),
    ("unknown command", bridge.json.dumps({"type": "bogus-cmd"}).encode()),
):
    sock = FakeWsSock()
    try:
        bridge.Handler._handle(object(), sock, payload)
        reply = ws_reply(sock)
        check(
            f"WS {label} -> clean error reply",
            reply.get("type") == "error" and bool(reply.get("error")),
            repr(reply)[:200],
        )
    except Exception as exc:  # noqa: BLE001 — the test fails on ANY escape
        check(f"WS {label} -> clean error reply", False, f"raised {type(exc).__name__}: {exc}")

print(f"  {passed} checks")
if failures:
    print(f"\n{len(failures)} FAILED:")
    for f in failures:
        print(f"  x {f}")
    sys.exit(1)
print("All bridge probe checks passed.")
