# PHASE 19 — R50i NC (A3959) real ANC failure investigation

**Date:** 2026-09-19 · **Branch:** `arena/01a0b886-soundcontrol`

## ANC STATUS: NOT WORKING — TRANSPORT/SEQUENCE ISSUE

**Investigation classification, not a proven hardware root cause.** The existing
build is physically non-working according to the user's test. Transport/reporting
and A3959 source-sequence discrepancies have been reproduced in code and corrected
as candidates. **The changed build has not been tested on the user's earbuds.**
Protocol semantics, firmware and channel selection remain possible contributors.
There is no basis for selecting “DEVICE ACKNOWLEDGES” or “PHYSICALLY VERIFIED
WORKING”: no real A3959 RX capture or successful acoustic retest was supplied.

**Phase 18 status B remains correct. No physical feature was promoted.**

## Failure and findings

The user can feel Android Soundcore ANC changes on the same A3959. SoundControl
changes its UI but not perceived ANC, including while audio plays continuously.
This report is accepted, not contradicted by CI or simulated packets.

The [complete audit](docs/PHASE-19-ANC-AUDIT.md) traces:
`NoiseControl.tsx → setAnc → ancIntent → sendAnc → buildAnc → buildP30iAnc →
withDeviceBoundary → transport.write → WebSocket → soundcore_bridge.py →
sendall → RFCOMM → RX parsing/device state`.

Concrete findings:

1. **False transmission success:** renderer `write()` returned after `ws.send`,
   not Python's RFCOMM completion. Helper rejection could not reject the write.
   Optimistic ANC state and swallowed busy errors hid failure.
2. **Source-semantics mismatch:** A3959 upstream marks the adaptive low nibble
   read-only and sensitivity independent (0..10). SoundControl derived both from
   manual level or zeroed them. MultiScene's selector was never sent for scenes.
3. **Source-sequence mismatch:** A3959 upstream explicitly uses state-preserving,
   one-field transitions with dependency rules and waits for each command reply.
   SoundControl sent one rebuilt state with no response/readback sequencing.
4. **Missing/misparsed state:** the `01:01` handler did not extract sound modes
   despite documentation claiming it did. `06:01` parsing ignored A3959 automation
   and scene, and accepted short reports.
5. **RX stream defect:** the legacy checksum-prefix fallback could truncate a
   fragmented valid response. A deterministic collision regression reproduces it.
6. **Channel evidence overstated:** handshake response means Soundcore traffic,
   not usable ANC control. Channel 12 was still probed despite a comment saying
   12/13/16 were excluded. This safety mismatch is now enforced; no new channel
   has been declared correct for A3959.

None alone establishes the cause of the user's acoustic failure without actual
TX/RX/channel/firmware and the Android comparison. The likely investigation area
is now much narrower, but the requested physical outcome is **not established**.

## Exact bytes, actual device evidence and external evidence

- Previous A3959 format: `08 EE 00 00 00 06 81 11 00` + seven payload bytes + sum
  checksum. Payload: ambient, manual/adaptive nibbles, repeated ambient,
  automation, wind, sensitivity, scene.
- Full reconstructed Phase 18 frames for manual 1–5, Normal, Transparency,
  Adaptive and wind on/off: [audit §2](docs/PHASE-19-ANC-AUDIT.md#2-exact-phase-18-constructed-frames).
  These are explicitly **constructed**, not captured transmissions.
- New 13-vector exact-hex set (including each scene):
  `tests/fixtures/a3959-anc.json`. Explicit synthetic baseline; not hardware proof.
- **Actual A3959 TX frames: UNAVAILABLE. Actual A3959 RX frames: UNAVAILABLE.**
- **Failing RFCOMM channel/session: UNKNOWN / UNAVAILABLE.** Android channel:
  **UNKNOWN**. No telemetry-only/control-channel distinction has been proved.
- **User firmware: UNAVAILABLE. FIRMWARE COMPATIBILITY UNKNOWN.** `01:05` remains
  the firmware query; no invented ANC minimum version or gaming-gate reuse.
- **Android physical reference:** user report only; no working HCI sequence is in
  the repository. No preceding command, arbitrary delay or initialization was
  invented. Generic BLE examples and other-model captures were excluded.
- OpenSCQ30 A3959 source was independently inspected and pinned to
  `c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa`. Four other cited projects had no
  A3959/P30i/R50i match at their inspected revisions. Exact revisions, applicability,
  byte evidence and remaining disagreements are recorded in audit §§3–6.

## Code changes

- Correlated TX id/session/channel, `TX_ACCEPTED` versus `TX_SENT`, renderer write
  rejection on helper error/timeout, anonymous socket session ids, control-client
  ownership, reconnect isolation, synchronized writes/close, retained probe bytes.
- Strict RX length/checksum framing instead of checksum-prefix guessing.
- A3959 fresh-state requirement; preserve reported adaptive strength/sensitivity;
  never write wind-detected bit; model gate checks A3959 payload/detected bit.
- Source-derived transition planner and reply waits; no automatic ANC retries.
  Serialized ANC transactions pause battery polls/reject competing app writes.
- Full `01:01` sound-mode extraction and independent A3959 `06:01` validation,
  including Adaptive and scene. Device state wins; no optimistic ANC selection.
- Honest requested/sent/unconfirmed/readback-match/mismatch wording. Errors do
  not pretend that the frame necessarily failed to reach the device.
- A3959 Noise Control diagnostics for A–I, all levels/scenes/adaptive/wind, Read
  state, user observation buttons and exportable timestamped TX/RX diagnostics.
- Serial bytes redacted in diagnostic state/firmware frames without forging
  checksums. No tokens/MACs/names are added to ANC diagnostic events.
- Dedicated [Known-Good Android Comparison procedure](docs/R50I-R50I-NC-HARDWARE-TEST.md#r50i-nc-anc--known-good-android-comparison),
  with continuous playback, repeated transitions, observation sheet and private
  Android HCI capture/channel/sequence extraction instructions.

## Validation

| Check | Result |
|---|---|
| `npm test` | PASS locally (package/UI/model/bridge/E2E/lifecycle + ANC); rerun after final code edits recorded below |
| `npm run build` / `verify:protocol` / TypeScript | PASS locally; source/capture tests do not establish firmware correctness |
| Model profiles | PASS — 108 checks |
| Bridge | PASS — 119 checks, including correlation, stale sessions, owner, blocked channels, checksum-collision fragmentation |
| Startup E2E | PASS locally — 101 checks against emulated RFCOMM, not hardware |
| ANC packets / responses / transition / timeout tests | PASS — 13 exact synthetic vectors plus model gates, inbound parsing, dependency ordering, cancellation, privacy/read-only checks |
| Static Windows-audio safety scan | PASS — 63 application files; no host-audio API references; existing read-only audio capture harness checks retained |
| Python compile check | PASS |
| Windows build | CI run requested on this branch; result to be recorded |
| Windows smoke | CI run requested on this branch; result to be recorded |
| Real hardware / Android HCI comparison | NOT PERFORMED here; user comparison and captures required |
| Physical Windows audio-state preservation | NOT PERFORMED here; hosted endpoint limitation must remain `AUDIO_STATE_CAPTURE=UNAVAILABLE`, never fake PASS |

## Evidence ladder and remaining stop point

A. **Packet constructed:** tested.
B. **Packet transmitted:** tested with emulated sockets only; real device unknown.
C. **Device responded:** real A3959 unknown.
D. **Device reported requested mode:** real A3959 unknown.
E. **User physically felt ANC change:** **NO for the reported existing desktop
build; UNKNOWN for this candidate.** Only a user retest can promote it.

If readback matches but the physical result remains unchanged, log **DEVICE
REPORT CONFIRMED** and **NO PHYSICAL EFFECT OBSERVED** separately. That is a
command-semantics/firmware investigation, not proof that ANC works. If readback
fails, retain raw ANC frames, anonymous session/channel and firmware, compare
with Android, and stop rather than guessing another channel/command.

## Windows-audio and release safety

No Windows master/app volume, mute, default output/input, Sound settings/mixer,
spatial audio, enhancements, audio registry, host EQ, volume keys or host-audio
control APIs were added or used. The test audio is started and held constant by
the user; the diagnostics do not alter it. No acoustic effect was simulated.

Application version stays **1.0.6** in package metadata. No v1.0.7, release/tag,
publication, modification of the existing v1.0.6 release, signing bypass or
SmartScreen bypass. Windows CI uses the existing build/smoke workflows, not the
release workflow. Changes are on the session's branch only.
