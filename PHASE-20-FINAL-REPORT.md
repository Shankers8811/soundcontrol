# PHASE 20 — R50i NC (A3959) real ANC failure investigation

**Date:** 2026-09-20 · **Branch:** `arena/01a0b886-soundcontrol`

## ANC STATUS: NOT WORKING — CANDIDATE FIX BUILT, DEVICE ACKNOWLEDGEMENT NOT YET OBSERVED

The user's physical result stands unchanged: Android Soundcore changes ANC on
those earbuds, SoundControl does not, including during playback. Nothing in this
phase was measured on earbuds by me — **no physical test was run, no device
answered, and no acoustic effect was observed**. Phase 18 status B is retained.

**Why not the requested marker yet.** `DEVICE ACKNOWLEDGED BUT PHYSICAL EFFECT
UNVERIFIED` requires a real `06:81` reply / matching `01:01` readback from the
user's A3959 in the logs. That has not happened: the build that will collect it
is the one in this phase, and it has only been exercised against a recorded
state payload and fakes. The app now computes exactly that verdict by itself —
it prints `DEVICE REPORT CONFIRMED` only when the device's own read-back matches
the request — so the marker can be adopted the moment the user's log shows it,
and `PHYSICALLY VERIFIED WORKING` only after in-ear confirmation.

## 1. The decisive finding: the suggested nibble patch is inverted

Task 12/Task 20 direct the low nibble to carry manual strength and the high
nibble to carry an adaptive flag (`payload[1] = isAdaptive ? 0x10 : (manualLevel & 0x0F)`).
The pinned evidence says the **opposite**, so adopting it would have broken a
currently-correct byte:

* OpenSCQ30 `common/structures/manual_adaptive_noise_canceling.rs` (revision
  `c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa`):
  * `pub fn manual_adaptive_noise_canceling_byte(...) -> u8 { (manual.byte() << 4) | adaptive.byte() }`
  * `take_manual_adaptive_noise_canceling` → `ManualT::from_byte((b & 0xF0) >> 4)`, `AdaptiveT::from_byte(b & 0x0F)`
* The recorded real A3959 state (below) reports byte 65 = **`0x55`**, i.e.
  manual 5 / adaptive 5 under that decode. The suggested reversed packing would
  encode the same logical state as `0x55` → `0x15`, changing the *manual* level
  on the device from 5 to 1 as a side effect of any nibble-written command.
* Task 20's own `parseSoundModes` is likewise reversed
  (`manualLevel: payload[1] & 0x0F`, `isAdaptive: (payload[1] & 0x10) !== 0`) and
  would report manual 5 / adaptive 5 as "manual 5, not adaptive".

**No inspected independent implementation documents the A3959 TWS nibble at all**
— SoundcoreDesktop (`SoundcoreAPI.py`: `08ee00000006810e000…`) and
Noiseclapper-GNOME (`src/common.ts`: `noiseCancellingSignalList`) carry only the
classic 4-byte over-ear layout with no manual/adaptive level concept, and neither
repository matches A3959/P30i/R50i. So nothing contradicts the recorded byte, and
nothing overrides it either. Per the phase's own rule ("do not change it merely because
another model uses the same pattern" — and, by symmetry, do not invert a byte
because a task text asserts the reverse), the encoding was left as
`(manual << 4) | adaptive`, now pinned by tests against the recorded byte.

Also rejected from the suggested patch, with reasons (all of these would have
been invented behaviour): fixed `50 ms` sleeps before/after the command, a
synthetic `01:05` frame labelled "initialization", an `01:01` "commit" frame
sent after every `06:81`, and treating a `500 ms` read timeout as success.
Adopted from its *structure*: a dedicated, testable sequencer module with the
required log lines (see §5).

## 2. New recorded-hardware evidence (and two real bugs it exposed)

OpenSCQ30 ships a device-faker recording per model, and
`tools/soundcore-device-faker/devices/a3959.toml` is a **recorded real A3959
`01:01` response** with per-byte labels. It is now committed as
`tests/fixtures/a3959-recorded-state.json` (serial bytes 16–31 replaced with
`0x58`; offsets, length and every other byte untouched). What it proves:

| Observation | Consequence |
|---|---|
| Payload is **91 bytes**, not 90 | `low_battery_prompt` is 77 and `gaming_mode` is **78** (Phase 18 had 76/77): `auto_power_off` is two bytes (enabled + duration), which shifted everything after it by one |
| Sound-mode block at 64–70 = `00 55 00 00 01 FF 01` | Ambient NC, manual 5, adaptive 5, manual automation, wind suppression **on**, scene outdoor |
| **Byte 69 = `0xFF`** (read-only adaptive sensitivity) | This family's unknown/unset marker, outside the documented `0..10` range |
| Firmware `01.64` on both buds | Consistent with the ≥ 01.60 gaming gate (not an ANC gate — no ANC firmware rule is documented anywhere) |

**Bug 1 (mine, Phase 19) — the app could refuse to command a real device.**
The Phase 19 validator required sensitivity ≤ 10, so on a unit reporting `0xFF`
the `01:01` state was rejected as invalid and the A3959 path refused to send
**anything**. That is a complete, self-inflicted "ANC does nothing" failure mode
for the Phase 19 build, and it is exactly the class of bug this phase exists to
kill: a field we never write must not make the earbuds uncommandable. Fixed:
the byte is passed through verbatim, reported as a diagnostic when out of range,
and never used to decide a mode. (This does **not** explain the user's original
Phase 18/19 report — the Phase 18 code had no such validator — so it is a second,
independent defect, not the proven root cause.)

**Bug 2 — the A3959 state map was one byte early** from `auto_power_off` onward,
so the gaming mirror read byte 77 (really `low_battery_prompt`) and a correct
78-byte payload was rejected as too short. Fixed to gaming 78 / 91-byte layout,
with `requiredStateLength(A3959) = 79`, and the whole map is now asserted against
the recording's own labels in `scripts/test_anc.mjs`.

The recording also settles Task 10's remaining doubt about the read-back: the
A3959 mirrors sound modes **inside the `01:01` state at payload 64** — a path the
store previously never parsed — while `06:01` is the command-matched report the
upstream packet handler registers.

## 3. Packet format, and the exact frames for every action

Format (unchanged, re-audited byte by byte in `docs/PHASE-19-ANC-AUDIT.md` §3 and
confirmed again here):

```
08 EE 00 00 00 | 06 | 81 | 11 00 (len = 17) | 7-byte payload | Σ (sum mod 256)
payload[0] ambient (0 NC · 1 Transparency · 2 Normal, repeated in [2])
payload[1] (manual << 4) | adaptive      — adaptive is READ-ONLY, preserved
payload[3] automation (0 Manual · 1 Adaptive · 2 MultiScene)
payload[4] bit0 wind suppression (bit1 = detected, never written)
payload[5] adaptive sensitivity — independent, preserved (0xFF stays 0xFF)
payload[6] scene (0 Transport · 1 Outdoor · 2 Indoor)
```

Given the recorded baseline above, these are the exact frames the app now sends
(`npm run anc:frames`; scenes walk the documented dependency one field at a
time — automation first, then the scene):

```
Normal       08 EE 00 00 00 06 81 11 00 02 55 02 00 01 FF 01 E8
Transparency 08 EE 00 00 00 06 81 11 00 01 55 01 00 01 FF 01 E6
Manual 1     08 EE 00 00 00 06 81 11 00 00 15 00 00 01 FF 01 A4
Manual 2     08 EE 00 00 00 06 81 11 00 00 25 00 00 01 FF 01 B4
Manual 3     08 EE 00 00 00 06 81 11 00 00 35 00 00 01 FF 01 C4
Manual 4     08 EE 00 00 00 06 81 11 00 00 45 00 00 01 FF 01 D4
Manual 5     08 EE 00 00 00 06 81 11 00 00 55 00 00 01 FF 01 E4
Adaptive     08 EE 00 00 00 06 81 11 00 00 55 00 01 01 FF 01 E5
Scene indoor step 1  08 EE 00 00 00 06 81 11 00 00 55 00 02 01 FF 01 E6
Scene indoor step 2  08 EE 00 00 00 06 81 11 00 00 55 00 02 01 FF 02 E7
Wind on      08 EE 00 00 00 06 81 11 00 00 55 00 00 01 FF 01 E4
Wind off     08 EE 00 00 00 06 81 11 00 00 55 00 00 00 FF 01 E3
```

CAT `06`, TYPE `81`, payload as listed, checksum = last byte; the exact frame
depends on what the earbuds report, which is why they are printed for a stated
baseline rather than hardcoded.

| Evidence | Status |
|---|---|
| Actual TX frames from the user's unit | **UNAVAILABLE** — the maintainer's log supplies them |
| Actual RX frames (`06:81` reply, `01:01` read-back) | **UNAVAILABLE** |
| RFCOMM channel actually used (user's unit) | **UNKNOWN** (logged per action once run) |
| Android's control channel | **UNKNOWN** — no A3959 SDP/HCI trace exists in any inspected repository |
| Firmware, user's unit | **UNAVAILABLE** → **FIRMWARE COMPATIBILITY UNKNOWN**; no ANC firmware rule is documented |
| Firmware, recorded third-party unit | `01.64` |

## 4. What the fix does differently (and why each step has evidence)

1. reads **fresh** `01:01` state and refuses to build a frame without it;
2. preserves the read-only adaptive strength, sensitivity and every untouched
   field (the exact opposite of deriving them from the manual slider);
3. sends **one-field transitions** in the A3959 dependency order
   (automation under NC · manual under Manual · scene under MultiScene · wind
   under NC/Transparency) and waits for that command's own reply before the next
   write, because upstream A3959 explicitly opts into migration — "Some devices
   don't like when you make sound mode state transitions that the Soundcore app
   doesn't do";
4. reads state again and compares it with the request; only a matching device
   report is called `DEVICE REPORT CONFIRMED`, and a mismatch always wins over
   the UI;
5. **never** retries an ANC command automatically and never reports a write
   result — or a CI/protocol test — as an acoustic result.

Everything runs on the RFCOMM/WebSocket path only. The write path still reports
`TX_ACCEPTED` → `TX_SENT` (OS socket completion) before a reply is even awaited,
and every ANC action logs `MODEL/PROFILE/MODE/LEVEL/SCENE/WIND/FRAME/
RFCOMM_CHANNEL/SESSION` plus `RX_FRAME`/`RX_SOUND_MODE_MIRROR`/
`DEVICE_STATE_CHANGED`, with serial bytes redacted and no MAC/token leakage.

## 5. Application icon and asset packaging

`package.json` (this repository keeps electron-builder config there — see
`PUBLISH.md`; there is no separate `electron-builder.json`) now sets:

```json
"win":   { "icon": "build/icon.ico" },
"nsis":  { "installerIcon": "build/icon.ico",
           "uninstallerIcon": "build/icon.ico",
           "installerHeaderIcon": "build/icon.ico" }
```

* `build/icon.ico` is a real multi-size icon — **16, 32, 48, 64, 128, 256**, all
  32-bit DIB entries — built from the committed monogram PNGs by
  `scripts/generate-ico.mjs` using only `node:zlib` (`scripts/lib/ico.mjs`);
  no rasterizer, native module or ImageMagick is needed on any runner.
* `prebuild:win` rebuilds it before every Windows build (`npm run icons`), and
  `npm run icons:svg` regenerates the PNGs *and* the `.ico` from the vector
  source when branding changes.
* `npm run test:icons` (part of `npm test`) proves: the committed `.ico` is
  byte-identical to the pipeline output for the committed PNGs (a stale or
  hand-edited icon fails), the required sizes exactly, every entry pixel-identical
  to `public/icon-<size>.png`, no blank/transparent placeholder (including a
  non-empty 16×16), and the wiring above.
* `scripts/verify-exe-icon.mjs` + a new `smoke-windows.yml` step extract the icon
  **resource from the packaged `SoundControl.exe` and from the NSIS installer**
  on the Windows runner and compare it with the monogram (dominant background
  colour + accent-glyph share), so "the installed binary, its shortcuts and the
  taskbar show the product icon, not default Electron artwork" is checked against
  the artifact users receive. This step is green on the final commit (see §7) for
  **both** artifacts; GitHub's raw log download was unavailable for those runs
  (upstream EOF), so the evidence recorded here is the step's passing conclusion
  plus the code path that throws (`$ErrorActionPreference='Stop'` + `throw`) on any
  mismatch, missing resource or non-zero Node exit. Image-generation dependency rule intact: the icon
  source is the committed SVG/PNGs; nothing is fetched at build time.
* Window/taskbar (`electron-main.cjs`, `public/icon-512.png`) and the About
  window (`IconLogo`, shared monogram component) already point at the same
  artwork and are asserted by the same tests.

## 6. Windows audio safety

No Windows master volume, per-app volume, mute, default output/input, Sound
settings, mixer, spatial audio, enhancements, audio registry, system-wide EQ,
simulated volume keys, `nircmd`, `pycaw`, CoreAudio/WASAPI volume API or
`SendInput` path was added or touched — the static host-audio scan passes across
63 application files, and this phase's test-signal procedure still requires the
maintainer's own playback. Nothing in the ANC path can make ANC audible by
changing host audio; there is no fallback of that kind in the code.

## 7. Validation

| Check | Result |
|---|---|
| `npm run build` (protocol + tsc + Vite + packaging whitelist) | PASS locally (495 protocol checks) |
| `npm test` (package, UI state, UI render, targets, models, bridge, E2E, lifecycle, ANC, icons) | PASS locally — UI 258 + 131, targets 21, models 108, bridge 119, E2E 101, ANC suite, icons 21 |
| A3959 ANC suite | PASS — 13 synthetic vectors + recorded-hardware payload (offsets, 91-byte layout, `0x55` nibble, `0xFF` passthrough), model gates, transition dependencies, sequencer ordering/abort semantics, privacy |
| Icon suite | PASS — 21 checks incl. ICO authenticity and packaging wiring |
| Windows Build CI (`35509451558`, `07bd066`) | **PASS** — installer with bundled Python runtime, size gate, unsigned-CI report |
| Windows Desktop Smoke CI (`35509451522`, `07bd066`) | **PASS** — every step green, including **`Verify the packaged exe + installer carry the authentic icon`**: `ExtractAssociatedIcon` on the built `SoundControl.exe` *and* on the NSIS installer, compared with the monogram by `scripts/verify-exe-icon.mjs` (dominant background colour + accent-glyph share). Both passed; the step throws on any mismatch, so this is evidence from the shipped PE resource, not from the source file |
| Tests CI (`35509454023`, `07bd066`) | **PASS** — includes the icon-packaging step |
| Release Windows CI | skipped by design (no release workflow trigger) |
| Windows-audio regression comparison on CI | **NOT PERFORMED** — the runner has no audio endpoints (`AUDIO_STATE_CAPTURE=UNAVAILABLE`), recorded honestly rather than as a pass |
| Real A3959 retest / Android HCI comparison | **NOT PERFORMED** — requires the maintainer |

## 8. Evidence ladder

A. **Packet constructed** — tested (deterministic fixtures).
B. **Packet transmitted** — tested against emulated RFCOMM only; real device unknown.
C. **Device responded** — real A3959: **unknown** (no real RX captured here).
D. **Device reported requested mode** — real A3959: **unknown**; the app will say
   `DEVICE REPORT CONFIRMED` when the read-back matches, and the mismatch path wins.
E. **User physically felt ANC change** — **NO** for the reported build;
   **untested** for this one. Only the user can promote it.

## 9. Still unknown / next steps

1. Run the diagnostics on the earbuds with audio playing
   (`docs/R50I-R50I-NC-HARDWARE-TEST.md` → *R50i NC ANC — Known-Good Android
   Comparison*): Read state → Normal → read → Transparency → read → Manual 1–5 →
   read, three cycles, then Adaptive, wind and each scene.
2. Capture the `ANC_ACTION` / `TX_SENT` / `RX_FRAME` / `RX_SOUND_MODE_MIRROR`
   lines plus firmware (`01:05`) and the physical observation per transition.
   A matching read-back promotes D; a mismatch means the firmware rejects the
   requested state and the raw frames + Android HCI capture decide the next step.
3. If Android still works and SoundControl does not, capture Android's own HCI
   log privately (procedure in the hardware doc) and compare bytes, ordering,
   channel and timing — not just CAT:TYPE. If that shows a channel or sequence
   difference, it will be fixed from that evidence rather than guessed.

No release was published, no tag or version was created (still `1.0.6`), no
signing or SmartScreen path was bypassed, and Windows audio was never touched.
