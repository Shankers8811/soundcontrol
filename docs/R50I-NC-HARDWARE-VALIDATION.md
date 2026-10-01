# R50i NC (A3959) hardware validation

Soundcore R50i NC · **A3959** · protocol profile `p30i` · sound modes `06:81` (17-byte frame) · EQ `02:83`.

> **This document is a blank test sheet, not a result.** Nothing here is a PASS
> until a human writes an observed physical result in it. The automated suites
> (`npm run test:matrix`, `verify:protocol`) only prove the frames are internally
> valid, routed to the right profile and match the documented A3959 byte map —
> they are **PROTOCOL VERIFIED**, never *physical hardware verified*.

## What the fixed build must show on the wire (before touching the device)

`npm run trace:r50i-nc` prints every action below without a device attached, so the
owner can diff the console against it. Level changes must move the manual nibble
in byte 1 *and* keep byte 3 at `00`; a scene tap must set byte 3 to `02` and the
scene byte; the adaptive toggle must set byte 3 to `01`.

| Action | Expected payload (after `00 00 06 81 …`) |
| --- | --- |
| Manual level 1 | `00 15 00 00 01 FF 01` |
| Manual level 3 | `00 35 00 00 01 FF 01` |
| Manual level 5 | `00 55 00 00 01 FF 01` |
| Adaptive (toggle) | `00 35 00 01 01 FF 01` (nibble echoes the device's report) |
| Scene Transport | `00 35 00 02 01 FF 00` |
| Scene Outdoor | `00 35 00 02 01 FF 01` |
| Scene Indoor | `00 35 00 02 01 FF 02` |
| Normal | `02 35 02 00 01 FF 01` |

Wind suppression on = byte 4 `01`, off = `00` — the app mirrors the device, so a
`00` there means the unit itself reported wind suppression off.

### EQ physical-test set

The EQ sheet below must be exercised with **four factory presets and one extreme
custom curve**: Soundcore Signature, Flat, Bass Booster, Acoustic, then a custom
curve pushed to the ends of the range (for example -12 / +12 / -12 / +12 / …).
The custom curve is an 8-band dB write; the console prints the frame, the preset
id and the model with every one of them.

## The four log lines that decide the test

| Console line | What it proves |
| --- | --- |
| `MODEL: A3959 · NAME: P30i / R50i NC · profile p30i · sound modes tws-p30i · EQ 02:83 · state payload 90 bytes` | The app identified the R50i NC and accepted a full `01:01` state frame. **No model-specific write is attempted until this appears.** |
| `STATE sound modes @64 [00 55 00 00 01 FF 01] — mode=… sub=… manualL=… adaptiveL=… scene=… wind=… sens=…` | The device's own report of its sound modes. This is the BEFORE/AFTER evidence. |
| `TX … 08 EE …` | The exact frame that went on the wire, with the decoded fields and checksum state. |
| `Earbud-only boundary: frame NOT sent — …` | **The frame never reached the device.** Capture this line instead of a pass/fail; test nothing further until it is gone. |

`npm run trace:r50i-nc` prints the same frames offline, without a device, so the
expected bytes can be compared before any hardware is connected.

## Evidence levels

| Level | Meaning | How it is earned |
| --- | --- | --- |
| PROTOCOL VERIFIED | The frame matches OpenSCQ30's A3959 definition and our packet tests. | `npm run test:matrix`, `npm run verify:protocol` |
| SIMULATOR VERIFIED | The app's simulated device accepts the frame and shows the change. | `npm test` (simulator checks) |
| OBSERVED (log only) | A real device produced a log line; not yet interpreted. | Device log |
| **PHYSICAL HARDWARE VERIFIED** | A human heard/measured the change **and** the device's own state frame changed. | This checklist, filled in by the device owner |

An unchanged state frame means the firmware ignored or rejected the write. A
changed state frame with no audible change means our interpretation of the bytes
is wrong. Neither is a pass.

## What the previous build got wrong (why a re-test is required)

The user's test on 2026-10-01 showed no audible change for ANC levels 1–5, scenes,
adaptive ANC or EQ presets. The cause found in the source:

- `06:81` byte 3 (the automation selector, `NoiseCancelingMode`) used our legacy
  value **2 = "MultiScene"** for every ANC write, and sent sensitivity `0x00`.
  Upstream OpenSCQ30 commit `9b6e42a7` (2025-11-29) fixed the enum to
  **`Manual = 0`, `Adaptive = 1`, `MultiScene = 2`**, and its manual-NC test
  transmits `06:81 [00, 25, 00, 00, 01, FF, 01]`.
- A manual level tap therefore flew in "MultiScene" mode, where the firmware owns
  the strength: the manual nibble never took effect. Scenes were equally invisible
  because the automation byte never changed either.
- This build now sends `Manual = 0x00` for a level tap, `Adaptive = 0x01` for the
  adaptive toggle, `MultiScene = 0x02` for a scene tap, echoes the adaptive nibble
  the device reported, and sends sensitivity `0xFF` until the device reports one.
- Byte 4 of every sound-mode frame is the wind-suppression bit the device itself
  reports, so the app never silently turns wind suppression off when it writes a
  level. On this unit the expected manual level 2 frame is the upstream vector
  `08 EE 00 00 00 06 81 11 00 00 25 00 00 01 FF 01 B4`.
- Transparency is not offered for A3959 (`ambientTransparency: false`): the icon is
  not rendered and the model gate refuses any ambient `0x01` frame for this
  profile. There is nothing to test here — the correct evidence is **that no frame
  is emitted**, which `npm run trace:r50i-nc` shows as `REFUSED … (expected)`.

- If the console shows **no `TX` line** for an action (only
  `Earbud-only boundary: frame NOT sent — …`), the write was blocked before the
  wire: SoundControl refuses every model-specific frame until a valid `01:01`
  state frame confirms the layout, so an unidentified/partially-received state
  would make *every* control look dead. That is a different bug from a rejected
  frame, and the log distinguishes them.

This is the hypothesis to confirm on hardware, not a proven fix.

## Exact byte map (A3959 `06:81`, 7-byte payload)

```
frame: 08 EE 00 00 00 06 81 11 00 | p1 p2 p3 p4 p5 p6 p7 | checksum
p1 = ambient state:      0x00 = Noise cancelling · 0x01 = Transparency · 0x02 = Normal
p2 = high nibble manual strength 1..5, low nibble firmware-owned adaptive 1..5
p3 = ambient state echoed (same as p1)
p4 = automation:         0x00 = Manual · 0x01 = Adaptive · 0x02 = Multi-scene
p5 = wind-noise suppression bit 0 (0x01 = on)
p6 = adaptive sensitivity 0..10, 0xFF = "not reported / do not change"
p7 = multi-scene:        0x00 = Transport · 0x01 = Outdoor · 0x02 = Indoor
```

## Expected software-side frames (from this build, before testing)

Reproduce them with `npm run trace:r50i-nc` and compare with the app's console.
These are expectations, not results.

| Action | Expected `06:81` payload `[p1..p7]` |
| --- | --- |
| ANC level 1 | `[00, 15, 00, 00, 00, FF, 01]` |
| ANC level 2 | `[00, 25, 00, 00, 00, FF, 01]` |
| ANC level 3 | `[00, 35, 00, 00, 00, FF, 01]` |
| ANC level 4 | `[00, 45, 00, 00, 00, FF, 01]` |
| ANC level 5 | `[00, 55, 00, 00, 00, FF, 01]` |
| Adaptive ANC | `[00, 55, 00, 01, 00, FF, 01]` (nibble echoes the device's report) |
| Transport scene | `[00, 55, 00, 02, 00, FF, 00]` |
| Outdoor scene | `[00, 55, 00, 02, 00, FF, 01]` |
| Indoor scene | `[00, 55, 00, 02, 00, FF, 02]` |
| Wind suppression on | same as the active mode but `p5 = 01` |
| Transparency | `[01, 55, 01, 00, 00, FF, 01]` |
| Normal | `[02, 55, 02, 00, 00, FF, 01]` |

Levels 1–5 differ **only** in the high nibble of `p2`; the checksum changes too.

EQ (`02:83`, 32-byte frame) = preset id `u16 LE` + 8 band bytes + 2 trailing bytes
+ 10 DRC bytes. Band byte `0x78` = 0 dB, and the range is ±12 dB in 1 dB steps
(`12 dB → 0xF0`, `−12 dB → 0x00`). Extreme test curve `+12 −12 +12 −12 +12 −12 +12 −12`:

```
08 EE 00 00 00 02 83 20 00 FE FE F0 00 F0 00 F0 00 F0 00 78 00 92 51 A2 4D A3 4E A1 5B 78 00 06
```

### Open questions in the EQ bytes (resolve with these captures)

* **Rock (id `0x11`)** — SoundControl ships the three-source consensus
  `96 8C 6E 6E 82 96 96 96` (bands 7–8 = +3/+3 dB), while OpenSCQ30's current
  per-device table for the P30i / R50i NC (`common_settings_type_2`) carries
  `96 8C 6E 6E 82 96 A0 AA` (+4/+5 dB, the P20i HCI divergence already noted in
  `PROTOCOL.md`). The other 21 curves agree byte for byte. If Rock sounds wrong
  next to the official app, this one preset is the first thing to change.
* **Custom curve, invisible band 10** — SoundControl writes `0x00` (−12 dB, the
  value every factory preset carries in that slot); OpenSCQ30's custom-curve
  path fills the invisible bands with `0x78` (0 dB). The DRC channel is
  identical either way, so this only matters if the firmware reads channel 1.

Both are byte-level questions about frames the app *does* send; neither is a
reason to skip the tests below.

## Checklist — fill in by hand

Statuses: `PASS` · `FAIL` · `NOT TESTED` · `NOT SUPPORTED` · `OBSERVED ONLY`.
Leave every row as **NOT TESTED** until you have both a state-frame diff and an
audible/physical observation.

For each test capture: the **TX line** from the console, the **`STATE sound modes @64 [...]`**
line before and after, and the audible result.

| # | Test | Expected | TX frame (from console) | RX / state frame (before → after) | Physical result | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ANC level 1 | Strongest cancelling; `p2` high nibble `1`; state byte 64 high nibble changes | | | | NOT TESTED |
| 2 | ANC level 2 | Change vs level 1; `p2` high nibble `2` | | | | NOT TESTED |
| 3 | ANC level 3 | Change vs level 2; `p2` high nibble `3` | | | | NOT TESTED |
| 4 | ANC level 4 | Change vs level 3; `p2` high nibble `4` | | | | NOT TESTED |
| 5 | ANC level 5 | Weakest cancelling; `p2` high nibble `5` | | | | NOT TESTED |
| 6 | Adaptive ANC | `p4 = 01`; device adjusts strength; state shows adaptive | | | | NOT TESTED |
| 7 | Transport scene | `p4 = 02`, `p7 = 00`; state byte 70 shows the scene | | | | NOT TESTED |
| 8 | Outdoor scene | `p4 = 02`, `p7 = 01` | | | | NOT TESTED |
| 9 | Indoor scene | `p4 = 02`, `p7 = 02` | | | | NOT TESTED |
| 10 | Wind suppression | `p5 = 01`; wind noise reduced in the app's toggle | | | | NOT TESTED |
| 11 | Normal | `p1/p3 = 02`; cancelling off | | | | NOT TESTED |
| 12 | EQ — Soundcore Signature | Sound returns to neutral; `02:83` preset `0x0000` | | | | NOT TESTED |
| 13 | EQ — Acoustic | Audible change vs Signature; preset `0x0001` | | | | NOT TESTED |
| 14 | EQ — Bass Booster | Audible bass boost; preset recorded | | | | NOT TESTED |
| 15 | EQ — Bass Reducer | Audible bass cut; preset recorded | | | | NOT TESTED |
| 16 | Extreme custom EQ | Audible alternation; preset `0xFEFE`, bands `F0 00 F0 00 F0 00 F0 00` | | | | NOT TESTED |
| 18 | EQ — Rock (open question) | Compare with the official app; note whether our `96 96` tail or OpenSCQ30's `A0 AA` tail matches | | | | NOT TESTED |
| 17 | Transparency | Not offered: the A3959 profile ships `transparency: false` (OpenSCQ30 changelog: "R50i NC should not have transparency modes"), so the UI cannot send it. The builder still encodes `p1/p3 = 01` for round-trip tests only. | — | — | — | NOT TESTED |

If a row cannot be tested because the control is not offered or the device has no
such function, write `NOT SUPPORTED` **with the reason**, or delete the row.

## The test build

Use a build that contains this fix:

* **From CI:** GitHub → *Actions* → **Windows Build** → the run for this branch
  (commit `82fc1e0` or newer) → *Artifacts* → **`SoundControl-Windows-Test-Unsigned`**.
* **Locally:** `npm ci && npm run build:win` (or `npm run dev` for the dev server).

The unsigned installer attached to the `v1.0.7-windows-unsigned-1` pre-release
predates this fix and must not be used for these tests.

## How to capture the evidence

1. Connect the R50i NC in SoundControl, open **Settings → Diagnostics → console**.
2. Press **Read state** (sends `01:01`); keep the log — this is BEFORE.
3. Do **one** action from the checklist.
4. Press **Read state** again; keep the log — this is AFTER.
5. Press **Export JSON** (or copy the lines) and attach it to the test row,
   together with what you heard.

Interpretation:

- TX present, AFTER state identical to BEFORE for the changed field → the
  firmware ignored/rejected the write: report it, do not call it a pass.
- AFTER state changed, no audible difference → the byte interpretation is wrong;
  the raw log is exactly what is needed to fix it.
- No TX line at all → the UI/action path, not the protocol, is the bug.

## Report template

```
Firmware version (Settings → About / app footer):
Test #      :
Console TX  :
Console RX  :
State before:
State after :
Audible result:
Verdict     : PASS / FAIL / NOT SUPPORTED
```

## Rules for this checklist

- Do not edit the Status column to PASS without a physical observation.
- Do not use this checklist for factory reset, firmware flashing or any command
  that is not in the app's normal UI.
- If a control sends no TX line, that is a separate (UI) bug — record it as such.
- Nothing in this file overrides the guardrail: **hardware behaviour is only ever
  established by the device owner running these tests.**
