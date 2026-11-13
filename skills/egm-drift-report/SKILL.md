---
name: egm-drift-report
license: MIT
disable-model-invocation: true
description: >-
  Detects drift between EGM design documents and implementation in
  SoundControl. Compares documented architecture, protocol frames, and
  API surface against actual code.
---

# EGM Drift Report for SoundControl

Detects drift between EGM design documents and the actual implementation.
Compares documented architecture, protocol frames, API surface, and
behavior against the codebase.

## Overview

This skill compares a design document in `docs/designs/` against the
implemented code to identify drift — where the implementation has diverged
from the approved design.

## Inputs

* **`DesignDoc`**: Path to the design document in `docs/designs/`.
* **`CodePaths`** (Optional): List of code paths to check against the design.
  If omitted, infer from the design document's file change list.

## Execution Workflow

1. **Read Design Document**: Extract the implementation plan, file changes,
   API surface, protocol frames, and database schema from the design doc.
2. **Inspect Codebase**: Check the actual files referenced in the design:
   - Do the documented files exist?
   - Do Tauri command signatures match?
   - Do protocol frame opcodes and layouts match?
   - Do database tables and migrations exist?
   - Is the frontend TypeScript consistent with documented types?
3. **Compare Protocol Frames**: For Bluetooth/RFCOMM features, verify that
   the implemented frame encoding/decoding matches the documented opcodes,
   payload lengths, and CRC computation.
4. **Compare Device Profiles**: Verify that device profiles in the
   implementation match the documented battery scales, ANC modes, and
   EQ bands.
5. **Identify Drift**: Classify each discrepancy:
   - **Added**: Implementation has features not in the design
   - **Removed**: Design features not implemented
   - **Modified**: Implementation differs from documented spec
   - **Missing**: Design references files/code that don't exist
6. **Write Report**: Write `drift_report.md` with all findings.
7. **Notify User**: Report drift findings and recommend next steps
   (update design, update code, or accept drift as intentional evolution).

## Output Format

`drift_report.md`:

```markdown
# EGM Drift Report

* **Design Document:** [path]
* **Date:** [YYYY-MM-DD]

## Drift Summary

| Type | Location | Design Says | Implementation Has | Severity |
|------|----------|-------------|-------------------|----------|

## Detailed Findings

### Drift N: [Title]
- **Type:** [Added | Removed | Modified | Missing]
- **Location:** [file:lines]
- **Design:** [what the design document specifies]
- **Implementation:** [what the code actually does]
- **Impact:** [user-visible or system impact]
- **Recommendation:** [update design / update code / accept as intentional]

## SoundControl-Specific Drift Checks

- Protocol frame opcodes and payload layouts vs `src-tauri/src/protocol/mod.rs`
- Device battery scales vs `devices.toml` and `src-tauri/src/protocol/models.rs`
- Tauri command signatures vs `src-tauri/src/commands/`
- Frontend types vs `src/types.ts` and `src/components/`
- Database schema vs `migrations.sql`
- CI workflow changes vs `.github/workflows/`