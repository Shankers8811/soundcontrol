# Parity: SoundControl vs Soundcore mobile app

Date: 2026-10-12. Source of truth: `features.csv` (this is a feature-level diff from public sources, not a screen-by-screen pixel diff).

## Score

- Weighted feature score: **60.4%** (must = 3, should = 2, could = 1, partial = half; skip rows and extras excluded).
- Must-haves fully done: **6 of 9**.
- Verdict: **not shippable as "same as the Android app"**. Three must-haves are open. Several of the rest cannot be closed from software alone.

## Open must-haves

1. **Save multiple named custom EQ presets** (missing). Software only, no new protocol. Build first.
2. **Device discovery / pairing flow** (partial). The app uses host-paired devices; an in-app pairing flow is not safe to promise on both OSes.
3. **Support for all current models** (partial). Needs real captures per model. No guessing opcodes.

> **Update 2026-10-22:** item 1 (named custom EQ preset library) is now implemented —
> `src/lib/eqPresets.ts`, surfaced as "My presets" on the Equalizer page, with
> `npm run test:eqpresets`. The 60.4% score above is deliberately unchanged: it is the
> 2026-10-12 audit, and the other two must-haves are still open.

## Build order

| # | Item | Size | Why |
|---|---|---|---|
| 1 | Named custom EQ preset library (local storage, per model) | S | Named in the original's listing; no protocol risk |
| 2 | Feature-conflict rules (Custom EQ vs Spatial Audio vs Gaming vs LDAC) with the reason shown | S | Matches the original's documented behaviour; UI only |
| 3 | Firmware-version gating from `01:05` | M | Already on the roadmap; prevents wrong layouts |
| 4 | Per-model capture intake template and verifier checks | M | The only honest way to widen model coverage |
| 5 | HearID test workflow | L | Blocked until a labelled `03:87` capture exists per model |

## Things that stay out, on purpose

- Find my earbud: no opcode appears in any surveyed capture. The roadmap rules out inventing one.
- Anka, Insight, Discover, Community, account sync: cloud services and owned content.
- Speakers, PowerConf, VR, smart glasses: different product classes, no evidence here.

## What I did not verify

- Nothing was tested against real earbuds. The repo's own docs say the same about its current state.
- I did not run the test suite or build in this session.
- Screens of the Android app were not inspected, only its public listings and help pages.

## Delivery

These three files live under `replica/` on the branch `replicator-parity-recon`, pushed to GitHub for review.
