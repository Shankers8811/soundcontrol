# SoundControl Design Documents

This directory contains EGM (Elephant-Goldfish Model) design documents for SoundControl features.

Each design document follows the EGM spec-driven development workflow:

1. **`/egm-brainstorm`** — Produces `concepts_brief.md` (ideation with Goldfish review)
2. **`/egm-draft`** — Expands concepts brief into a formal design document
3. **`/egm-review`** — 5-stage Goldfish review pipeline
4. **`/egm-resolve`** — Resolves review findings
5. **`/egm-drift-report`** — Detects design-to-implementation drift

## Design Documents

| Document | Feature | Status | Related Issue | PR |
|----------|---------|--------|---------------|-----|
| *(none yet)* | — | — | — | — |

## How to Add a New Design

1. Run `/egm-brainstorm` to create a `concepts_brief.md`
2. Run `/egm-draft` to expand it into `docs/designs/<feature_name>.md`
3. Add an entry to this README and to `SITEMAP.md`
4. Run `/egm-review` to validate the design through the 5-stage Goldfish pipeline
5. Run `/egm-resolve` to address any Blocker or Major findings
6. Implement the feature per the approved design
7. Run `/egm-drift-report` to verify implementation matches design

## EGM Principles

- **Goldfish Isolation**: Each reviewer runs in a fresh context with no conversation history
- **Artifact-First**: All proposals, drafts, and reviews are written to files, not chat
- **Plain English**: No jargon, buzzwords, or flattery
- **Critique First**: Lead with what is wrong, missing, or risky
- **Stress-Test Everything**: Never agree by default