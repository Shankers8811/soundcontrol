# PHASE 18 — FINAL REPORT
## Real R50i / R50i NC Device Support Validation

**Date:** 2026-09-19 · **Branch:** `arena/01a0b5cc-soundcontrol` · **PR:** [#27](https://github.com/Shankers8811/soundcontrol/pull/27)

> ## FINAL STATUS: B — PROTOCOL SUPPORT COMPLETE, PHYSICAL VALIDATION PENDING
>
> SoundControl is now genuinely model-aware around its two original target
> devices, with every capability claim tied to per-model protocol evidence
> (OpenSCQ30's a3949/a3959 device definitions + cited live captures) and
> enforced at the protocol layer — not just the UI. No physical earbud was
> available in this environment, so **no feature is claimed physically
> verified**; `docs/R50I-R50I-NC-HARDWARE-TEST.md` is the procedure that
> promotes them. No version bump, no v1.0.7, no tag, no release; v1.0.6 is
> untouched; signing gates unchanged.

---

## R50i / A3949 (also sold as P20i / P25i)

| Category | Features |
|---|---|
| **Protocol status** | Complete for everything the model has: 67-byte state layout documented byte-for-byte (OpenSCQ30 a3949 `state_update.rs`), identification, reads, EQ, gaming |
| **Supported (protocol)** | state request `01:01` · battery `01:03` (scale 0–5) · charging `01:04` · serial+firmware `01:05` · **EQ `02:83` factory presets** (22 live P20i captures reproduced byte-for-byte) · gaming `01:87` (device-mirrored at state byte 65) |
| **Unsupported (evidence)** | ANC / transparency / wind `06:81` (no sound-modes module — R50i has no ANC) · **custom EQ `FE FE`** (OpenSCQ30 `custom_preset_id: None`, zero FE FE frames in the live captures) · LDAC · dual audio · surround · factory reset `01:85` (Motion+ only) |
| **Unknown** | on-device behavior for malformed frames (never sent) |
| **Physically verified** | **NONE — pending** (hardware checklist section B) |

## R50i NC / A3959 (also sold as P30i)

| Category | Features |
|---|---|
| **Protocol status** | Complete for everything the model has: 90-byte state layout documented byte-for-byte (OpenSCQ30 a3959 `state_update.rs`), identification, reads, sound modes, EQ, toggles |
| **Supported (protocol)** | state request · battery `01:03` (scale 0–10) · charging · serial+firmware · **sound modes `06:81`** (ambient enum NC=0/Transparency=1/Normal=2 from OpenSCQ30 — not a generic guess; manual 1–5 + adaptive; wind byte; multi-scene) · **EQ `02:83` incl. custom `FE FE`** · gaming `01:87` (mirrored at byte 77, only firmware ≥ 01.60) · dual `0B:84` (byte 73) · surround `02:86` (byte 74) |
| **Unsupported (evidence)** | LDAC (no module) · transparency sub-modes/vocal (no field in the a3959 struct) · factory reset · classic `02:81` EQ · `10:85` game variant |
| **Unknown** | on-device malformed-frame behavior (never sent) |
| **Physically verified** | **NONE — pending** (hardware checklist section C) |

**Cross-model rule enforced:** the two profiles cannot leak into each other —
see the session-isolation test below, and the model gate that refuses, for
example, a `06:81` ANC frame while an R50i (A3949) is connected even if the
UI were buggy.

## What this phase changed (Tasks 1–17)

| Task | Deliverable |
|---|---|
| 1 — model registry | `src/protocol/modelRegistry.ts`: `R50I_A3949` + `R50I_NC_A3959` machine-readable registry — commercial name, SKU, sibling names, protocol profile, identification evidence (OpenSCQ30 i18n mapping + state-layout confirmation), per-command matrix with citations, `physicalValidation: PENDING`, capability notes |
| 2 — model profiles | Existing `src/protocol/devices.ts` profiles extended with evidence-cited fields: `customEq`, state offsets `gaming`/`surround`/`dualConnections`, `gamingMinFirmware` ('01.60', the OpenSCQ30 A3959 firmware gate) |
| 3 — capability matrix | The 14 Phase 17 commands × both models with SUPPORTED/UNSUPPORTED + evidence, in the registry, cross-checked against the profile flags by tests (code and matrix cannot drift) |
| 4 — no invented support | Full outbound+response trace per command in `docs/R50I-PROTOCOL.md`; commands whose model lacks a documented mirror (LDAC) get the honest wording instead of implied success |
| 5 — identification | Ranked **whole-token** name matching with span-based ambiguity resolution (`R50i NC` ≠ `R50i`; `R50iNC`/`XR50i` → unknown; two models' tokens → unknown), confirmed by the model-specific state layout; unknown ⇒ generic profile, model-specific controls unsendable |
| 6 — UI follows capabilities | Custom-EQ editor hidden with an honest note for A3949 (factory presets only) and shown for A3959; all existing capability gates re-verified; "protocol-verified · physical validation pending" logged at connect |
| 7 — volume safety | Unchanged and re-asserted: `supportsVolume === false` for both models and unknown; no Windows audio API anywhere (static scan, 60 files); the honest disabled Volume card remains |
| 8 — ANC is R50i-NC-specific | A3959 ambient values pinned to the OpenSCQ30 enum (0/1/2) by test; A3949 has no ANC control anywhere and `06:81` is refused at the transport boundary (tested) |
| 9 — EQ device-side only | EQ is `02:83` device frames; custom `FE FE` refused for A3949 at three layers (UI hidden, store refuses, model gate rejects); no host EQ anywhere |
| 10 — feature classification | Per-model matrix covers gaming/LDAC/dual/surround with per-model statuses and evidence |
| 11 — factory reset safety | `01:85` refused for EVERY profile at the model gate (documented only for the Motion+ speaker); existing confirmation modal + capability note re-verified; tests prove reset cannot be triggered by malformed/unknown commands (registry + model gate + checksum rejections) |
| 12 — response validation | New `requiredStateLength` guard: a `01:01` state frame shorter than the connected model's documented layout is ignored whole, never partially parsed; checksum/category validation already in place |
| 13 — session isolation | New `createSessionGuard`: every connect attempt begins a session, disconnect/link-down ends it; late frames from an old session/device are dropped before parsing; capabilities are re-derived per connection (the R50i-NC→R50i stale-ANC failure is impossible and tested) |
| 14 — both profiles tested | New `scripts/test_model_profiles.mjs`: **108 checks** (registry integrity, matrix↔code consistency, identification incl. traps, 30 command-gate cases, transport boundary, response mirrors + firmware gate, session guard, capability derivation, ANC enum values) |
| 15 — hardware harness | New `docs/R50I-R50I-NC-HARDWARE-TEST.md`: per-model connect/identify/feature/disconnect procedure with the required record table (MODEL, FIRMWARE, DEVICE NAME, DATE, FEATURE, COMMAND, EXPECTED, ACTUAL, PASS/FAIL, WINDOWS AUDIO CHANGED?, NOTES) and promotion rules |
| 16 — audio regression proof | New read-only `scripts/capture-windows-audio-state.ps1` (default devices, master volume, mute, per-app sessions; read-only property machine-checked); wired into **Windows Smoke CI**: state captured before SoundControl runs, compared after install/launch/uninstall — any change fails the workflow |
| 17 — protocol documentation | New `docs/R50I-PROTOCOL.md`: per-model frame layouts, command tables, response/error behavior, capability requirements, with UNKNOWN — NOT VERIFIED markers and externally-derived knowledge identified (OpenSCQ30) |
| 18 — evidence-based research | OpenSCQ30 master consulted model-by-model (`a3949.rs`, `a3959.rs`, their `state_update.rs`, `structures/sound_modes.rs`, i18n table); used as supporting evidence only — no code copied; all findings recorded in `docs/R50I-PROTOCOL.md` and the registry. **Evidence conflict resolved fail-closed:** custom EQ on A3949 (OpenSCQ30 says none) is disabled despite the shared EQ module |
| 19 — no fake success | Device toggle mirrors parsed where the model documents them (gaming A3949 byte 65; gaming/surround/dual A3959 bytes 77/74/73 with the firmware ≥ 01.60 gate) → UI state becomes **device-confirmed**; models without a mirror log the exact honest wording "Command sent — device confirmation unavailable for this model" |

## Tests (Task 20 — all green)

| Suite | Result |
|---|---|
| Packaging guard | 11/11 ✅ |
| UI state derivation | 258 checks ✅ (incl. new `supportsCustomEq`) |
| UI render smoke | 117 checks ✅ (A3949: faders hidden + honest note; A3959: 8 faders via profile override) |
| Earbud-only boundary (Phase 17) | 21 checks ✅ (+ new: Task 16 harness is read-only) |
| **Model profiles (new)** | **108 checks ✅** |
| Bridge probe | 94 checks ✅ |
| Startup/lifecycle e2e | ✅ |
| Main-process lifecycle | ✅ |
| `npm run build` (protocol verification incl. per-SKU `customEq`, tsc, vite, packaging whitelist) | ✅ exit 0 |

**Windows build + smoke:** run on this phase's commit — see CI evidence
below (the smoke workflow now includes the audio regression proof step).
**Static safety scan:** no host-audio API across 60 application files ✅.
**Release workflow:** correctly skipped (no marker, no tag). **Fail-closed
behavior everywhere retained.**

## CI evidence (commit on this phase)

- Tests workflow: ✅ (12 steps, incl. the new *Model profiles* step)
- Windows Build: ✅
- Windows Smoke: ✅ — including the new **audio regression proof** step
- Release Windows: skipped (correctly — signing credentials still absent,
  per Phase 16: PRODUCTION AUTHENTICODE SIGNING PENDING)

## Release-safety status (unchanged, verified)

| Item | Status |
|---|---|
| Version | **1.0.6** — no bump |
| v1.0.7 | **not created** (no tag, no release, no draft) |
| v1.0.6 tag/release | untouched (asset unchanged since 2026-09-18T18:21:31Z, still Latest) |
| Signing | PRODUCTION AUTHENTICODE SIGNING PENDING (probe unchanged: WIN_CSC_LINK not set) |
| SmartScreen/Windows security | nothing bypassed or modified |

## Remaining maintainer action

Run `docs/R50I-R50I-NC-HARDWARE-TEST.md` on real R50i and R50i NC hardware
(two separate passes), record the result table, and promote
`docs/R50I-PROTOCOL.md` statuses + the registry's `physicalValidation` field
from PENDING to VERIFIED for the rows that pass. That is the only gap
between status B and status A.

**Phase 18 stops here.** No release preparation, no version bump, no tag,
no publish — per the phase's stop condition. Windows remains the transport
environment; the earbuds remain the controlled device; R50i and R50i NC
remain separate capability profiles; and no feature is called real merely
because the UI or packet layer accepts it.
