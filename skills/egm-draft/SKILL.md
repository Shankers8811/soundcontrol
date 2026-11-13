---
name: egm-draft
license: MIT
disable-model-invocation: true
description: >-
  Draft a formal SoundControl design document from an EGM concepts brief.
  Produces docs/designs/<feature>.md with full specification including
  goals, non-goals, alternatives, architecture, protocol frames, and
  implementation plan.
---

# EGM Draft for SoundControl

Drafts a formal design document from an EGM concepts brief. The output is
a design document in `docs/designs/<feature>.md` suitable for Goldfish review.

## Overview

This skill takes a finalized `concepts_brief.md` (produced by `egm-brainstorm`)
and expands it into a complete design document with all sections needed
for the 5-stage Goldfish review pipeline.

## Inputs

* **`SourceFile`**: Path to the `concepts_brief.md` file (required).
* **`TargetFile`**: Output path for the design document (default:
  `docs/designs/<feature_name>.md`).

## Design Document Structure

Every SoundControl design document produced by `egm-draft` must include:

```markdown
# [Feature Name] Design Document

* **Author:** [Author Name]
* **Date:** [YYYY-MM-DD]
* **Status:** Draft / In Review / Approved / Implemented
* **Related Issue:** #<issue_number>

## 1. Overview

High-level summary of the feature, target user, and core value proposition.
Written in plain English, no buzzwords.

## 2. Goals vs. Non-Goals

### In-Scope Goals
- [Explicitly defined scope items]

### Out-of-Scope Non-Goals
- [Features intentionally excluded with reasons]

## 3. Background & Problem Statement

Why this feature is needed, what problem it solves, and how it is handled
today (and why that doesn't work).

## 4. Alternatives Considered

Each option rejected during ideation, with the technical reason for
rejection. Do not attribute a rejection to a maintainer without linking
their issue, discussion, or PR.

## 5. Detailed Design

### 5.1 Architecture
High-level component diagram and data flow description.

### 5.2 Protocol Frames (SoundControl-specific)
For any Bluetooth/RFCOMM feature:
- Command opcodes (hex)
- Payload layout
- Checksum/CRC computation
- Expected responses

### 5.3 Device Profile
- Supported models
- Battery scale (scale-5 vs scale-10)
- ANC modes and layouts
- EQ bands and presets
- RFCOMM channel

### 5.4 API Surface
New Tauri commands, frontend types, and IPC channels.

### 5.5 Database Schema
New tables or migrations in `migrations.sql`.

### 5.6 Security Considerations
Token auth, origin allowlist, loopback binding, handle lifecycle.

### 5.7 Observability
Logging, frame logging, battery history, diagnostics.

## 6. Implementation Plan

### 6.1 File Changes
List of files to create, modify, or delete.

### 6.2 Build Impact
Changes to `Cargo.toml`, `package.json`, `tauri.conf.json`, CI workflows.

### 6.3 Testing Plan
Unit tests, protocol verification checks, e2e scenarios.

### 6.4 Rollback Plan
How to roll back if the feature causes issues.

## 7. Open Questions & Risks

Unresolved decisions and known risks with mitigation strategies.
```

## Execution Workflow

1. **Verify SourceFile**: Confirm `concepts_brief.md` exists and is finalized.
2. **Read SourceFile**: Extract goals, non-goals, analysis, alternatives, and
   key decisions.
3. **Draft Design Document**: Write the complete design document to
   `TargetFile` using the structure above.
4. **SoundControl-Specific Checks**:
   - For Bluetooth features: verify protocol frame formats match `PROTOCOL.md`
   - For device profiles: verify battery scale and ANC layout against
     existing device definitions in `devices.toml`
   - For Tauri commands: verify command signatures match existing patterns
     in `src-tauri/src/commands/`
   - For Windows builds: consider bundled Python runtime size impact
5. **Register Design**: Add the design document to `docs/designs/README.md`
   and `docs/designs/SITEMAP.md`.
6. **Notify User**: Report the design document path and prompt for
   `egm-review` invocation.