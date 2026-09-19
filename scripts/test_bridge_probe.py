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

# 12c. Pass 11 §10 stream hardening: fragmented feeds, lying length fields,
#      unknown opcodes, minimal and all-FF frames — split_frame never
#      crashes, never merges two frames into one, never invents a boundary.
half = len(INFO_REPLY) // 2
frame_p, rest_p = bridge.split_frame(INFO_REPLY[:half])
check(
    "truncated frame waits for its tail instead of inventing a boundary",
    frame_p is None and rest_p == INFO_REPLY[:half],
    f"{frame_p!r} / {len(rest_p)} bytes held",
)
frame_c, rest_c = bridge.split_frame(INFO_REPLY[:half] + INFO_REPLY[half:])
check("same frame split across two reads is reassembled whole", frame_c == INFO_REPLY and rest_c == b"")

lying_large = bytearray(INFO_REPLY)
lying_large[7] = (len(INFO_REPLY) + 6) & 0xFF
lying_large[-1] = sum(lying_large[:-1]) & 0xFF
frame_l, rest_l = bridge.split_frame(bytes(lying_large))
check(
    "length field lying too large falls back to the checksum boundary",
    frame_l == bytes(lying_large) and rest_l == b"",
    f"{frame_l!r}",
)

lying_small = bytearray(INFO_REPLY)
lying_small[7] = 20
lying_small[8] = 0
lying_small[-1] = sum(lying_small[:-1]) & 0xFF
frame_s, rest_s = bridge.split_frame(bytes(lying_small))
check(
    "length field lying too small is not trusted without a valid checksum",
    frame_s == bytes(lying_small) and rest_s == b"",
    f"{frame_s!r}",
)

unknown_op = bytes([0x09, 0xFF, 0x00, 0x00, 0x7F, 0x7F, 0x01, 12, 0x00]) + b"\xAB\xCD"
unknown_op += bytes([sum(unknown_op) & 0xFF])
frame_u, rest_u = bridge.split_frame(unknown_op)
check(
    "unknown-opcode frame with a valid checksum passes through intact (renderer decides)",
    frame_u == unknown_op and rest_u == b"",
    f"{frame_u!r}",
)

minimal = reply_frame(b"")
frame_m, rest_m = bridge.split_frame(minimal)
check(
    "minimal zero-payload 10-byte frame extracts cleanly",
    len(minimal) == 10 and frame_m == minimal and rest_m == b"",
)

ff_frame = reply_frame(b"\xFF\xFF")
frame_f, rest_f = bridge.split_frame(ff_frame)
check("all-FF battery payload frame extracts cleanly", frame_f == ff_frame and rest_f == b"")

stream = b"\xAA\xBB" + INFO_REPLY + INFO_REPLY + INFO_REPLY[:half]
buf = stream
frames: list[bytes] = []
held: bytes = b""
while True:
    frame, rest = bridge.split_frame(buf)
    if frame is None:
        held = rest
        break
    if frame:
        frames.append(frame)
    buf = rest
check("noise + two whole frames + a truncated tail resync frame-per-frame", frames == [INFO_REPLY, INFO_REPLY], f"{len(frames)} frames")
check("stream loop parks exactly the incomplete tail", held == INFO_REPLY[:half], f"{len(held)} bytes held")
frame_t, rest_t = bridge.split_frame(held + INFO_REPLY[half:])
check("arriving tail completes the third frame with nothing left over", frame_t == INFO_REPLY and rest_t == b"")

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

# --- Earbud-only control boundary (Phase 17) --------------------------------
#
# SOUND CONTROL = EAR BUD / HEADPHONE DEVICE CONTROL — never Windows audio.
# The helper must only ever transmit recognized Soundcore earbud command
# frames on its RFCOMM socket. These checks pin the second, helper-side gate
# (the renderer enforces the same registry in src/protocol/targets.ts;
# scripts/test_command_targets.mjs cross-checks the TypeScript side).

def _frame(cat: int, typ: int, payload: bytes = b"") -> bytes:
    """A checksum-valid Soundcore frame with the given CAT:TYPE."""
    total = 10 + len(payload)
    body = (
        bytes([0x08, 0xEE, 0x00, 0x00, 0x00, cat, typ, total & 0xFF, (total >> 8) & 0xFF])
        + payload
    )
    return body + bytes([sum(body) & 0xFF])


EXPECTED_TX_ALLOWED = {
    "01:01", "01:03", "01:04", "01:05", "01:7F", "01:85", "01:87", "01:FF",
    "02:81", "02:83", "02:86", "06:81", "0B:84", "10:85",
}

check(
    "TX_ALLOWED_FRAMES matches the 14-command Soundcore contract",
    set(bridge.TX_ALLOWED_FRAMES) == EXPECTED_TX_ALLOWED,
    f"got {sorted(bridge.TX_ALLOWED_FRAMES)}",
)

for key in sorted(EXPECTED_TX_ALLOWED):
    cat, typ = (int(x, 16) for x in key.split(":"))
    reason = bridge.validate_tx_frame(_frame(cat, typ))
    check(f"validate_tx_frame accepts registered command {key}", reason is None, str(reason))

check(
    "validate_tx_frame accepts the real INIT handshake frame",
    bridge.validate_tx_frame(bytes.fromhex("08EE00000001010A0002")) is None,
)

INIT = bytes.fromhex("08EE00000001010A0002")
bad_cs = bytearray(INIT)
bad_cs[-1] ^= 0xFF
bad_len = bytearray(INIT)
bad_len[7] = 0x2A
for label, data, expect in (
    ("empty frame", b"", "too short"),
    ("truncated frame", b"\x08\xEE\x00", "too short"),
    ("bad header", b"A" * 20, "bad header"),
    ("length field lies", bytes(bad_len), "length field"),
    ("checksum mismatch", bytes(bad_cs), "checksum"),
    ("unknown CAT 07:81 (checksum-valid)", _frame(0x07, 0x81), "not a recognized"),
    ("unknown TYPE 06:99 (checksum-valid)", _frame(0x06, 0x99), "not a recognized"),
    ("fantasy volume frame 03:80", _frame(0x03, 0x80, b"\x64"), "not a recognized"),
):
    reason = bridge.validate_tx_frame(data)
    check(
        f"validate_tx_frame rejects {label}",
        isinstance(reason, str) and expect in reason,
        repr(reason),
    )

# Handler level: a rejected frame must never reach BRIDGE.send; a recognized
# frame must. The send path is recorded (and never touches a real socket).
sent_frames: list[bytes] = []
real_send = bridge.BRIDGE.send


def recording_send(data: bytes) -> None:
    sent_frames.append(data)


bridge.BRIDGE.send = recording_send
try:
    sock = FakeWsSock()
    bridge.Handler._handle(
        object(),
        sock,
        bridge.json.dumps({"type": "tx", "hex": _frame(0x07, 0x81).hex()}).encode(),
    )
    reply = ws_reply(sock)
    check(
        "WS tx with unrecognized frame -> rejected error, never transmitted",
        reply.get("type") == "error"
        and "rejected" in str(reply.get("error", ""))
        and "not a recognized" in str(reply.get("error", ""))
        and not sent_frames,
        repr(reply)[:200] + f" sent={len(sent_frames)}",
    )

    sock = FakeWsSock()
    bridge.Handler._handle(
        object(), sock, bridge.json.dumps({"type": "tx", "hex": INIT.hex()}).encode()
    )
    reply = ws_reply(sock)
    check(
        "WS tx with a recognized frame -> transmitted",
        reply.get("type") == "sent" and len(sent_frames) == 1 and sent_frames[0] == INIT,
        repr(reply)[:200] + f" sent={len(sent_frames)}",
    )
finally:
    bridge.BRIDGE.send = real_send

print(f"  {passed} checks")
if failures:
    print(f"\n{len(failures)} FAILED:")
    for f in failures:
        print(f"  x {f}")
    sys.exit(1)
print("All bridge probe checks passed.")
