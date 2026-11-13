---
name: egm-resolve
license: MIT
disable-model-invocation: true
description: >-
  Resolve EGM Goldfish review findings. Classifies each finding as PROPOSE
  FIX or CONTEST, writes a review report, and applies approved edits to the
  target design document.
---

# EGM Resolve for SoundControl

Resolves Goldfish review findings on SoundControl design documents.
Classifies findings, proposes fixes, and applies approved edits.

## Overview

This skill is invoked after Stage 7 (Design Critique) or Stage 9
(Implementation Readiness) when the user selects "Resolve findings with
agent." It processes the review report and applies changes to the target
document.

## Inputs

* **`TargetFile`**: Path to the design document being reviewed.
* **`ReviewReport`**: Path to the review report file
  (`critic_report.md` or `implementation_readiness_report.md`).
* **`TargetRange`**: Line range in the document where findings apply
  (`FeatureRange` or `DetailedRange`).

## Execution Workflow

1. **Read Review Report**: Parse all findings from the review report.
2. **Classify Each Finding**: For each finding, decide:
   - **PROPOSE FIX**: The finding is valid and should be addressed.
     Propose a specific edit to the document.
   - **CONTEST**: The finding is incorrect or the trade-off is intentional.
     Provide reasoning for why no change is needed.
3. **Write Review Resolution Report**: Write `goldfish_review_report.md`
   with all classifications and proposed fixes.
4. **Apply Approved Fixes**: For PROPOSE FIX findings that the user
   approves, apply the edits directly to `TargetFile` using file editing
   tools.
5. **Re-read TargetFile**: After applying fixes, re-read to recalculate
   line bounds.
6. **Convergence**: Either advance to the next stage or re-run the current
   stage audit (max 1 re-audit limit).

## Output Format

`goldfish_review_report.md`:

```markdown
# Goldfish Review Resolution

* **Target File:** [path]
* **Review Report:** [path]
* **Date:** [YYYY-MM-DD]

## Findings Summary

| # | Severity | Classification | Section | Summary |
|---|----------|---------------|---------|---------|

## PROPOSE FIX Findings

### Finding N: [Title]
- **Severity:** [Blocker | Major | Nit]
- **Location:** [file:lines]
- **Issue:** [description]
- **Proposed Fix:** [specific edit]
- **Status:** [Pending | Applied | Rejected by user]

## CONTEST Findings

### Finding N: [Title]
- **Severity:** [Blocker | Major | Nit]
- **Location:** [file:lines]
- **Reason for Contesting:** [why no change is needed]
```

## SoundControl-Specific Considerations

When resolving findings on SoundControl designs:

- **Protocol frames**: If a finding questions an opcode or payload layout,
  verify against `PROTOCOL.md` and existing device captures before contesting.
- **Battery scales**: Scale-5 vs scale-10 distinctions are model-specific;
  ensure any finding about battery math considers the correct device profile.
- **Tauri commands**: New commands must follow the existing pattern in
  `src-tauri/src/commands/` with proper `State<'_, AppState>` usage.
- **Windows compatibility**: Any finding about Windows-specific behavior
  should consider the bundled Python bridge and NSIS installer constraints.