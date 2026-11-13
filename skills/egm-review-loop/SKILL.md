---
name: egm-review-loop
license: MIT
disable-model-invocation: true
description: >-
  Antagonistic review loop for EGM. Runs multiple Goldfish reviewer
  personas against a specific section of a design document to surface
  edge cases and contradictions before implementation.
---

# EGM Review Loop for SoundControl

Antagonistic review loop that runs multiple Goldfish reviewer personas
against a specific section of a design document. Used for critical sections
that need extra scrutiny.

## Overview

This skill invokes a focused review loop on a specific range of a design
document. It runs designated Goldfish reviewers against the target range
and consolidates their findings.

## Inputs

* **`TargetFile`**: Path to the design document.
* **`TargetRange`**: Line range to review (e.g., protocol frames section,
  implementation plan).
* **`Reviewers`**: List of Goldfish agent names to invoke (e.g.,
  `[egm-design, egm-structural, egm-style]`).
* **`Standards`** (Optional): Mapping of reviewer to target standard
  (e.g., `{"egm-design": "feature-spec-standard"}`).
* **`GoldfishContext`** (Optional): Reading list for baseline context.

## Execution Workflow

1. **Verify Inputs**: Confirm `TargetFile` and `TargetRange` are provided.
2. **Spawn Reviewers**: For each reviewer in `Reviewers`, spawn the
   corresponding agent from `agents/<name>.md` with:
   - Mode: REVIEW
   - Target: `TargetFile` lines `TargetRange`
   - Standard: from `Standards` mapping if provided
   - GoldfishContext: if provided
3. **Collect Findings**: Gather all findings from each reviewer.
4. **Deduplicate**: Merge overlapping findings across reviewers.
5. **Prioritize**: Classify by severity (🔴 Blocker, 🟡 Major, 🟢 Nit).
6. **Write Report**: Write findings to `review_loop_report.md` in the
   working directory.
7. **Notify User**: Report the review loop findings and prompt for
   resolution via `egm-resolve` if needed.

## Output Format

`review_loop_report.md`:

```markdown
# EGM Review Loop Report

* **Target File:** [path]
* **Target Range:** [lines]
* **Reviewers:** [list]
* **Date:** [YYYY-MM-DD]

## Findings

| Severity | Reviewer | Location | Finding | Recommendation |
|----------|----------|----------|---------|----------------|

## Summary

- 🔴 Blockers: [count]
- 🟡 Majors: [count]
- 🟢 Nits: [count]

## Next Steps

- Resolve Blockers and Majors via `egm-resolve`
- Address Nits at author's discretion
```

## Common SoundControl Review Loop Scenarios

Use `egm-review-loop` for:

- **Protocol frame sections**: Verify opcode assignments, payload layouts,
  checksum computation against `PROTOCOL.md`
- **Device profile sections**: Verify battery scales, ANC modes, EQ bands
  against `devices.toml` and known device captures
- **Tauri command sections**: Verify command signatures, state management,
  error handling patterns
- **Windows-specific sections**: Verify bundled Python runtime, NSIS
  installer behavior, Authenticode signing requirements