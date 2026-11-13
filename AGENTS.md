# Agent Guidelines for SoundControl EGM

You are assisting development in the SoundControl repository using the Elephant-Goldfish Model (EGM) spec-driven development workflow.

## Contribution Boundaries

* **No Autonomous PRs**: You must never automatically open a pull request without explicit human review, testing, and approval.
* **No Design Docs for Bug Fixes**: Never create files in `docs/designs/` for a `Bug Fix / Minor Patch`. A new design doc belongs in the Stage 1 PR of the `Feature / Architectural Change` track.
* **Triage Taxonomy**: Ensure the human operator selects the appropriate track in `.github/PULL_REQUEST_TEMPLATE.md`:
  * `Bug Fix / Minor Patch` (non-test diff <= 100 lines and < 3 core files in `skills/` or `agents/`; no design doc required, but please update an existing design if appropriate).
  * `Feature / Architectural Change — Stage 1: Design Doc PR` (requires an aligned issue with `design-ready`, uses `Refs #<issue>`, and adds `docs/designs/<name>.md` + updates `docs/designs/README.md`).
  * `Feature / Architectural Change — Stage 2: Implementation PR` (requires an aligned issue with `pr-ready` and a merged `docs/designs/<name>.md`).
* **Stacks and Labels**: Do not wait for `design-ready` or `pr-ready` before you prepare work. A PR needs its label only to merge. Prepare the design branch and the implementation branch on top of it. When the human approves, open them as a GitHub stack, with the implementation PR as a draft. Give each PR one purpose and about 200 to 400 changed lines. Use `Refs #<issue>` on lower PRs and `Closes #<issue>` on the top PR.
* **No Artificial PR Splitting**: Never split a cohesive feature or refactoring across multiple smaller pull requests to evade the 100-line scope threshold.
* **PR Description Template**: Every pull request description must be the filled-in `.github/PULL_REQUEST_TEMPLATE.md`.
* **PR Title**: Start the title with an action verb and use sentence case, for example `Add egm-review skill for SoundControl design validation`. Do not use a `type(scope):` prefix.
* **PR Labels**: Add or suggest the applicable labels: `docs`, `site`, `ci`, or `deps`. Maintainers control `design-ready` and `pr-ready`. Never apply these two labels.
* **Clear Change Summary**: In every pull request, explicitly list all key changes made and why. For feature proposals, define clear in-scope Goals and out-of-scope Non-Goals in the checked-in EGM design document (`docs/designs/<name>.md`).

## EGM Workflow Summary

1. **`/egm-brainstorm`** — Interactive ideation with Goldfish parallel review → `concepts_brief.md`
2. **`/egm-draft`** — Draft formal design document from concepts brief → `docs/designs/<feature>.md`
3. **`/egm-review`** — 5-stage Goldfish review pipeline:
   - Stage 5: Initial Zoom Out Review (architecture, YAGNI, simplicity)
   - Stage 6: Comprehension Test (can the spec be understood?)
   - Stage 7: Design Critique (hostile architecture review)
   - Stage 8: Intermediate Zoom Out (post-critique architecture check)
   - Stage 9: Implementation Readiness Test (can this be built?)
4. **`/egm-resolve`** — Resolve review findings with agent, apply approved edits
5. **`/egm-review-loop`** — Antagonistic review loop for critical sections
6. **`/egm-drift-report`** — Detect drift between design document and implementation

## Artifact Rules

* **Artifact-First Delivery**: Never present large proposals, drafts, or reviews in the chat pane. Write them to files (e.g., `docs/designs/<feature>.md`, `concepts_brief.md`, `*_report.md`) and notify the user with the file path.
* **Plain-English Standard**: Write all concepts briefs, design documents, and review reports in simple, direct, jargon-free plain English.
* **Goldfish Isolation**: Each Goldfish subagent runs in a fresh context with no conversation history. A review in the same context is not a Goldfish review.

## SoundControl Project Context

SoundControl is a native Rust/Tauri 2 desktop companion for Anker/Soundcore devices featuring:
- Bluetooth LE/RFCOMM device discovery and connection
- Per-model device profiles (battery, ANC, EQ, gaming mode, LDAC, multipoint, etc.)
- Electron-free Tauri frontend (React + TypeScript + Vite)
- Bundled Python bridge for RFCOMM communication on Windows
- SQLite database for device state and settings
- Cross-platform builds (Linux: AppImage/DEB, Windows: NSIS)

When reviewing SoundControl designs, Goldfish agents should consider:
- Bluetooth/RFCOMM protocol constraints and device-specific frame formats
- Windows vs Linux Bluetooth stack differences
- Tauri 2 security model and capability boundaries
- Bundled Python runtime distribution and size constraints
- Real-device hardware validation requirements