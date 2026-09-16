#!/usr/bin/env python3
"""Regression tests for the RFCOMM frame splitter.

RFCOMM is a byte stream: one read can carry half a frame, a whole frame, or
several frames back to back. ``split_frame`` must recover exactly the frames
the device sent, in order, and must never invent one.

The splitter used to scan for a checksum boundary even while a response was
still arriving. An additive mod-256 checksum collides roughly once every 256
positions, so that scan emitted truncated garbage for about 11% of split
responses — which is what made battery and device-info reads fail
intermittently on real hardware.

Run:  python3 -m unittest discover -s tests -v
      python3 tests/test_frame_split.py
"""

from __future__ import annotations

import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from soundcore_bridge import _frame_checksum, split_frame  # noqa: E402


def frame(cat: int, typ: int, payload: bytes, *, advertised: int | None = None) -> bytes:
    """Build a device→host frame (09 FF ...) exactly like the firmware does."""
    body = bytearray([0x09, 0xFF, 0x00, 0x00, 0x01, cat, typ, 0x00, 0x00])
    body.extend(payload)
    if advertised is None:
        total = 10 + len(payload)
        advertised = total
    body[7] = advertised & 0xFF
    body[8] = (advertised >> 8) & 0xFF
    body.append(_frame_checksum(body))
    return bytes(body)


def info_frame(seed: int = 0, payload_len: int = 48) -> bytes:
    """The cat=01 type=01 device-info blob, with battery at payload 40/41/42."""
    rnd = random.Random(seed)
    payload = bytearray(rnd.randrange(256) for _ in range(payload_len))
    payload[40], payload[41], payload[42] = 4, 4, 3
    return frame(0x01, 0x01, bytes(payload))


def battery_frame(left: int = 4, right: int = 4) -> bytes:
    """The cat=01 type=03 live battery reply used by the simulator/hardware."""
    return frame(0x01, 0x03, bytes([left, right]))


def drain(buf: bytes) -> tuple[list[bytes], bytes]:
    """Feed a buffer through split_frame until it stops yielding frames."""
    frames: list[bytes] = []
    while True:
        got, rest = split_frame(buf)
        if got is None:
            return frames, rest
        buf = rest
        if got:
            frames.append(got)


class TestCompleteFrames(unittest.TestCase):
    def test_whole_frame_in_one_read(self):
        f = info_frame()
        frames, rest = drain(f)
        self.assertEqual(frames, [f])
        self.assertEqual(rest, b"")

    def test_back_to_back_frames_are_all_recovered(self):
        a, b, c = info_frame(1), battery_frame(), info_frame(2)
        frames, rest = drain(a + b + c)
        self.assertEqual(frames, [a, b, c])
        self.assertEqual(rest, b"")

    def test_real_battery_frame_round_trips(self):
        f = battery_frame(7, 3)
        frames, _ = drain(f)
        self.assertEqual(frames, [f])
        # The app reads left/right from payload bytes 0 and 1.
        self.assertEqual(list(frames[0][9:-1]), [7, 3])


class TestPartialBuffers(unittest.TestCase):
    """The heart of the fix: a half-arrived frame must never be returned."""

    def test_no_frame_emitted_for_any_partial_prefix(self):
        for seed in range(200):
            f = info_frame(seed=seed)
            for cut in range(2, len(f)):
                got, _ = split_frame(f[:cut])
                if got:
                    self.assertEqual(
                        got,
                        f,
                        f"seed={seed} cut={cut}: splitter returned a {len(got)}-byte "
                        f"frame from a {cut}-byte partial buffer",
                    )

    def test_byte_at_a_time_reassembles_the_frame_exactly(self):
        f = info_frame(seed=7)
        buf = b""
        frames: list[bytes] = []
        for byte in f:
            buf += bytes([byte])
            got, buf = split_frame(buf)
            if got:
                frames.append(got)
        self.assertEqual(frames, [f], "streaming one byte at a time lost the frame")

    def test_random_chunking_recovers_exact_sequence(self):
        rnd = random.Random(1234)
        sent = [info_frame(1), battery_frame(4, 3), info_frame(2), battery_frame(1, 1)]
        stream = b"".join(sent)
        buf = b""
        got: list[bytes] = []
        i = 0
        while i < len(stream):
            n = rnd.randrange(1, 17)
            buf += stream[i : i + n]
            i += n
            while True:
                out, buf = split_frame(buf)
                if out is None:
                    break
                if out:
                    got.append(out)
        self.assertEqual(got, sent)
        self.assertEqual(buf, b"")

    def test_partial_buffer_is_preserved_not_consumed(self):
        f = info_frame(seed=3)
        head = f[:20]
        got, rest = split_frame(head)
        self.assertIsNone(got)
        self.assertEqual(rest, head, "a waiting buffer must be preserved verbatim")


class TestLegacyLengths(unittest.TestCase):
    def test_advertised_length_one_byte_too_large(self):
        # The captured 0x0E TWS ANC family reports a total one byte high.
        # Such a frame must not be delivered early — that is exactly the
        # truncated-frame bug — but it must still be recovered, in order,
        # once the advertised number of bytes has arrived.
        f = frame(0x06, 0x81, bytes([0x01, 0x05, 0x01, 0x00]))
        self.assertEqual(f[7], 10 + 4)
        lying = bytearray(f)
        lying[7] = f[7] + 1
        lying[-1] = _frame_checksum(lying[:-1])
        lying = bytes(lying)

        got, rest = split_frame(lying)
        self.assertIsNone(got, "must wait for the advertised length before closing the frame")
        self.assertEqual(rest, lying)

        following = battery_frame(4, 3)
        frames, leftover = drain(lying + following)
        self.assertEqual(frames, [lying, following])
        self.assertEqual(leftover, b"")

    def test_advertised_length_one_byte_too_small(self):
        f = frame(0x02, 0x81, bytes(8))
        lying = bytearray(f)
        lying[7] = f[7] - 1
        lying[-1] = _frame_checksum(lying[:-1])
        got, _ = split_frame(bytes(lying))
        self.assertEqual(got, bytes(lying))

    def test_insane_length_still_resynchronizes(self):
        # A zeroed length field cannot be trusted; the checksum scan must close
        # the frame once it is fully buffered.
        f = frame(0x01, 0x03, b"\x04\x04")
        broken = bytearray(f)
        broken[7] = 0x00
        broken[8] = 0x00
        broken[-1] = _frame_checksum(broken[:-1])
        got, rest = split_frame(bytes(broken))
        self.assertEqual(got, bytes(broken))
        self.assertEqual(rest, b"")

    def test_oversized_length_field_does_not_stall_forever(self):
        f = frame(0x01, 0x03, b"\x04\x04")
        broken = bytearray(f)
        broken[7] = 0xFF
        broken[8] = 0xFF  # 65535 — bigger than any real frame
        broken[-1] = _frame_checksum(broken[:-1])
        got, _ = split_frame(bytes(broken))
        self.assertEqual(got, bytes(broken))


class TestResync(unittest.TestCase):
    def test_leading_noise_is_discarded(self):
        f = info_frame(seed=9)
        # b"" is the documented progress sentinel: noise was dropped, but no
        # complete frame is available yet.
        got, rest = split_frame(b"\x00\x11\x22" + f)
        self.assertEqual(got, b"")
        self.assertEqual(rest, f, "noise ahead of the header must be dropped")
        # The dropped noise must not cost us the frame itself.
        again, _ = split_frame(rest)
        self.assertEqual(again, f)

    def test_lone_magic_byte_is_kept_for_the_next_read(self):
        got, rest = split_frame(b"\x00\x00\x09")
        self.assertEqual(got, b"")
        self.assertEqual(rest, b"\x09")

    def test_pure_noise_is_discarded(self):
        got, rest = split_frame(b"\x33\x44\x55")
        self.assertEqual(got, b"")
        self.assertEqual(rest, b"")

    def test_short_prefix_waits(self):
        got, rest = split_frame(b"\x09\xFF\x00\x00\x01")
        self.assertIsNone(got)
        self.assertEqual(rest, b"\x09\xFF\x00\x00\x01")


class TestBoundedGrowth(unittest.TestCase):
    """A lying length field must never wedge the reader on a fixed buffer."""

    def test_corrupt_length_field_cannot_stall_the_reader(self):
        # A frame claiming a tiny length plus a long unrecognizable tail: the
        # splitter may resynchronize onto a false boundary, but it must make
        # progress rather than buffer forever.
        junk = bytearray([0x09, 0xFF, 0x00, 0x00, 0x01, 0x7A, 0x01, 0x0A, 0x00])
        junk.extend(b"\xAA" * 600)
        buf = bytes(junk)
        moved = False
        for _ in range(600):
            got, rest = split_frame(buf)
            if got is not None:
                moved = True
            if got is None and rest == buf:
                break
            buf = rest
            if not buf:
                break
        self.assertTrue(moved, "reader never made progress on a corrupt length field")
        self.assertLess(len(buf), len(junk))

    def test_lying_length_does_not_grow_past_the_guard(self):
        # 600 bytes that never validate must not be held indefinitely: once
        # past 512 the splitter sheds one byte to find the next header.
        buf = b"\x09\xFF\x00\x00\x01\x7A\x01\x0A\x00" + b"\x11" * 600
        got, rest = split_frame(buf)
        self.assertLessEqual(len(rest), len(buf))


if __name__ == "__main__":
    unittest.main(verbosity=2)
