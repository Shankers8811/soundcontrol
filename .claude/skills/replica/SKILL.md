---
name: replica
description: >-
  Clone any app end to end: reverse-engineer it into a recon map, plan the stack
  and schema, rebuild the design system, build it screen by screen, wire the
  backend, test it for bugs, measure feature parity against the original, mine
  real user reviews for what to fix, rebrand it as your own, write the launch,
  and deploy it. One skill, eleven phases, run in order or jump straight to the
  phase you need. Use when the user says "clone this app", "replica", "reverse
  engineer X", "build my own version of X", "what stack should I use", "rebuild
  the design", "build the clone", "add login or payments", "test my clone",
  "how close is my clone", "what do people hate about X", "rebrand it", "landing
  page and pricing", "deploy it", or pastes an app URL or App Store link and
  wants their own version of it.
---

# replica

A clone factory in one skill. Eleven phases, each a full playbook in `references/`.
**Read only the phase you are executing** — that is the whole point of splitting them.

## Invocation

- `/replica <phase> [target]` — run one phase, e.g. `/replica recon https://linear.app`
- `/replica <anything else>` — infer the phase from the request and say which one you picked
- `/replica` with no argument, or after a `recon`/`features.csv` exists — propose the next phase in the pipeline and wait for confirmation before starting

Phases are addressed by **short name** (`recon`, `design`, `build`, …), not by the old
`/replica-recon` form. Those separate commands are gone — everything lives under `/replica`.

## Router

Match the user's intent to a phase, then read `references/<phase>/PHASE.md` and follow it exactly.

| Phase | Read | Fires when the user wants to… |
|---|---|---|
| `recon` | `references/recon/PHASE.md` | clone/reverse-engineer an app, map its screens and flows — **always first** |
| `architect` | `references/architect/PHASE.md` | pick a stack, design the schema, plan the API |
| `design` | `references/design/PHASE.md` | rebuild the design system, colours, type, components, tokens |
| `build` | `references/build/PHASE.md` | build screens, implement a flow, tick off the feature matrix |
| `backend` | `references/backend/PHASE.md` | auth, database, payments/Stripe, email, jobs, integrations |
| `test` | `references/test/PHASE.md` | QA, find bugs, write e2e tests, click through every flow |
| `diff` | `references/diff/PHASE.md` | measure parity, compare against the original, list what's missing |
| `entrepreneur` | `references/entrepreneur/PHASE.md` | mine real user reviews, rank complaints, find the gap, position it |
| `brand` | `references/brand/PHASE.md` | name it, rebrand it, new palette, find leftovers of the original |
| `launch` | `references/launch/PHASE.md` | landing page, pricing, App Store/Play listing |
| `deploy` | `references/deploy/PHASE.md` | ship it live, domain, DNS, Stripe live mode, TestFlight |

## Pipeline

```
recon → architect → design → build → backend → test → diff → entrepreneur → brand → launch → deploy
```

`entrepreneur` can run any time after `recon` — it feeds `brand` and `launch`.
`diff` and `test` loop: fix → retest → re-diff until parity is met.

Hard dependency: **nothing after `recon` runs without `recon-map.md` and `features.csv`.**
If the user asks for a later phase cold, run `recon` first or ask for the app URL.

## Files this pack produces

Each phase writes artifacts the next phase reads. Do not invent substitutes.

| Phase | Writes |
|---|---|
| recon | `recon-map.md`, `features.csv` |
| architect | `architecture.md` |
| design | `tokens.json`, `components.md` |
| build | `build-log.md` (ticks `features.csv`) |
| backend | `backend.md` |
| test | `test-plan.md`, `bug-report.md` |
| diff | `parity.md` |
| entrepreneur | `reviews.csv`, `feedback.md`, `fixes.md` |
| brand | `brand.json`, `brand.md` |
| launch | `pricing.md`, `landing.md`, `listing.json`, `launch-plan.md` |
| deploy | `deploy.md` |

## Bundled tools

Scripts sit next to their phase playbook in `references/<phase>/`. They are Python 3,
standard library only. Run them from that folder, or pass full paths:

```bash
python references/brand/sweep.py --help          # find leftover original brand strings
python references/design/contrast.py --help      # WCAG contrast checker
python references/diff/parity.py --help          # weighted feature-parity score
python references/diff/imgdiff.py --help         # screenshot layout diff (colour-blind)
python references/entrepreneur/reviews.py --help # review scraping + ranking
python references/launch/listing.py --help       # App Store / Play listing lint
```

Data files they read are in the same folders: `features.csv`, `tokens.json`,
`themes.json`, `listing.example.json`.

## Rules that apply to every phase

- **Never copy the original's code, assets, copy or trademarks.** Clean-room rebuild from
  observed behaviour only. This is what keeps a clone legal — it is not negotiable, and
  `brand` + `deploy.preflight.md` gate on it.
- **Cite what you observed.** Screens, flows and reviews come from public pages, store
  listings, help docs and the user's own account — with a link.
- **One phase per turn.** Don't run ahead; each phase ends by naming the next one.
- **State the assumption when you infer.** The recon map is inference, not ground truth.
