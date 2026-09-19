# R50i / R50i NC hardware validation procedure

**Status: PHYSICAL VALIDATION PENDING — this checklist has not been executed
yet.** Every "SUPPORTED" in `docs/R50I-PROTOCOL.md` means *supported by
protocol evidence* (OpenSCQ30 device definitions + cited captures). Nothing
is physically verified until this procedure runs on real hardware and the
results are recorded below. A simulated/emulated pass is **not** physical
verification.

Repeat this whole procedure **once per model** — R50i (A3949) and R50i NC
(A3959) are different hardware and must be validated separately. Do not copy
results between them.

## What you need

- A Windows 10/11 PC with Bluetooth.
- The earbuds, **paired in Windows** (Settings → Bluetooth & devices) and
  connected — not in pairing mode.
- The Soundcore mobile app closed on any nearby phone (it holds the one
  control slot).
- A SoundControl build installed from the CI artifact (or `npm run build:win`
  locally).
- Evidence capture: `%AppData%\soundcontrol\main.log`, the in-app Hex Console
  (TX/RX frames), and screenshots.

## Windows-audio regression harness (run it around EVERY section)

SoundControl must never touch Windows audio. The read-only harness proves it:

```powershell
# before connecting / before each feature section:
./scripts/capture-windows-audio-state.ps1 -OutFile audio-before.txt
# after the section:
./scripts/capture-windows-audio-state.ps1 -Baseline audio-before.txt
```

Exit `0` + "UNCHANGED" = pass. Exit `1` (state changed: default device,
master volume, mute, per-app sessions) = **REGRESSION — stop and record
FAIL**. The harness only reads (its read-only property is itself
machine-checked in CI); it never changes audio state. Note: Windows itself
or other apps may legitimately change volume while you test — if a
comparison fails, check what else was running, re-run the comparison after a
quiet minute, and record the observation honestly.

## A. Connect + identify (both models)

| # | Step | Expected |
|---|---|---|
| A1 | Capture audio state (harness) | UNCHANGED baseline recorded |
| A2 | Devices page → Scan devices | Device listed with its Windows name + MAC |
| A3 | Click Connect | Console: channel probe, then `DSP answered on channel N`; log `Linked via … · profile …` |
| A4 | **Identification** | R50i → profile line `P20i / P25i / R50i · A3949`; R50i NC → `P30i / R50i NC · A3959` — plus `protocol-verified · physical validation pending`. If the model shows as **Unknown model**, record it: do NOT force a profile |
| A5 | Telemetry | Console shows `01:01` state, `01:05` serial+firmware, `01:03` battery TX and the device's RX replies; firmware + serial appear in the UI; battery matches the Soundcore app (R50i scale 0–5, R50i NC scale 0–10) |
| A6 | Audio harness compare | UNCHANGED |

## B. R50i (A3949) feature tests

| # | Feature | Expected |
|---|---|---|
| B1 | ANC / Transparency controls | **Must not appear at all** — the Noise Control page shows "not available on this model". Record if any ANC control is visible (FAIL) |
| B2 | EQ factory preset (e.g. Bass Booster) | Frame `02:83` TX in the console; preset id `02 00` on the wire; the device's state mirror updates the UI |
| B3 | EQ custom curve | **Must be refused**: "Custom curves are not supported by … — factory presets only". No `FE FE` frame in the console |
| B4 | Gaming mode toggle | Frame `01:87` TX; state mirror byte 65 confirms on/off in the next `01:01` reply |
| B5 | Attempted unsupported features | Surround / dual / LDAC toggles **not shown** (Controls page explains why); injecting a `06:81` or `0B:84` frame in the Hex Console is refused with a model-gate message |
| B6 | Audio harness compare after B2–B5 | UNCHANGED |

## C. R50i NC (A3959) feature tests

| # | Feature | Expected |
|---|---|---|
| C1 | ANC on (level 3) | Frame `06:81` TX, byte0 `00`, manual nibble `0x31`; device mirrors sound modes (`06:01`/state) and the UI shows the confirmed mode |
| C2 | Transparency | byte0 `01`; no vocal sub-mode control is offered (not supported on this model) |
| C3 | Normal | byte0 `02` |
| C4 | Wind-noise toggle | byte4 bit0 follows the toggle in the `06:81` payload |
| C5 | EQ factory preset + **custom curve** | `02:83` factory preset; custom drag commits a `FE FE` frame (this model supports custom presets per OpenSCQ30 — VERIFY on hardware) |
| C6 | Gaming mode | `01:87`; state byte 77 confirms — **only when both buds report firmware ≥ 01.60** (record the firmware shown; below 01.60 the app correctly says confirmation unavailable) |
| C7 | Dual connection | `0B:84`; state byte 73 confirms |
| C8 | 3D Surround | `02:86`; state byte 74 confirms |
| C9 | LDAC / factory reset | LDAC toggle **not shown** (no LDAC on this model); Factory reset shows the honest "not offered" note |
| C10 | Audio harness compare after C1–C9 | UNCHANGED |

## D. Disconnect / reconnect / session isolation (both models)

| # | Step | Expected |
|---|---|---|
| D1 | Disconnect | State clears (no stale battery/mode); "Disconnected" badge |
| D2 | Connect the OTHER model (or any device) | Profile re-derived from the new device; **no capability from the previous session survives** (e.g. after R50i NC → R50i, ANC controls must be gone) |
| D3 | Rapid disconnect→reconnect | No error; telemetry belongs to the new session only |
| D4 | Audio harness compare | UNCHANGED |

## E. Record results — one row per test above

Copy this table per model and fill it in. A feature is promoted to
**PHYSICALLY VERIFIED** only with a completed row and the evidence attached.

| MODEL | FIRMWARE | DEVICE NAME | DATE | FEATURE | COMMAND | EXPECTED RESULT | ACTUAL RESULT | PASS/FAIL | WINDOWS AUDIO CHANGED? | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| A3949 | | | | | | | | | YES/NO | |
| A3949 | | | | | | | | | YES/NO | |
| A3959 | | | | | | | | | YES/NO | |
| A3959 | | | | | | | | | YES/NO | |

## Promotion rules

- "PASS" rows with attached evidence (log + console frames + screenshot)
  promote the corresponding `SUPPORTED` in `docs/R50I-PROTOCOL.md` to
  **PHYSICALLY VERIFIED** — update that document and the model registry's
  `physicalValidation` field (`src/protocol/modelRegistry.ts`).
- Any FAIL on a safety row (B1, B3, B5, C9, D2, any audio comparison) is a
  release blocker: record it and file it — do not adjust the test to pass.
- "WINDOWS AUDIO CHANGED = YES" is always a blocker, whatever the cause;
  diagnose before continuing.
