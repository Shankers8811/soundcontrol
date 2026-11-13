---
name: egm-review
license: MIT
disable-model-invocation: true
description: >-
  Orchestrates the EGM Goldfish Review Protocol for SoundControl design
  documents. Executes five review phases: Initial Zoom Out, Comprehension,
  Design Critique, Intermediate Zoom Out, and Implementation Readiness.
---

# EGM Review for SoundControl

Reviews and validates a SoundControl design document through specialized
Goldfish reviewer personas. Executes five review phases.

## Overview

This skill orchestrates the Goldfish Review Protocol. Each Goldfish runs
in a fresh context with no conversation history. The review produces
individual stage reports and optionally a consolidated report.

## Inputs

* **`TargetFile`**: Absolute or relative path to the design document.
* **`GoldfishContext`** (Optional): Reading list to establish system baseline.
* **`Step`** (Optional): Pipeline preset (`interactive`, `uninterrupted`,
  `feature_spec`, `implementation`, or individual stage `5`-`9`).

## Workflow

### Step 1: Intake & Setup

1. Verify `TargetFile` is provided. If missing, prompt the user for the path.
2. Verify `GoldfishContext` is provided. If missing, explain it is optional
   and prompt if the user wishes to provide additional context files.
3. **Linked Files**: Read `TargetFile`, resolve relative links inside the
   working directory, add them to `GoldfishContext`. Skip links outside the
   working directory or URLs unless approved.

### Step 2: Curated Pipeline Preset Selection

Present the preset selection gate:

```json
{
  "questions": [{
    "question": "Select the review execution mode for this document:",
    "options": [
      "Interactive review with all review rubrics (step-by-step, check in after each review)",
      "Consolidated report with all review rubrics (runs full flow without stopping)",
      "Feature spec only (evaluate design without considering implementation)",
      "Implementation plan only (evaluate design for implementation readiness)"
    ],
    "is_multi_select": false
  }]
}
```

### Step 3: Semantic Split Discovery

Scan `TargetFile` for the primary dividing header `## Detailed
Implementation Plan` (or synonyms: `## Implementation Plan`, `## Work
Breakdown`, `## Implementation Steps`).

* **Standard Layout**: Assign `FeatureRange = 1..(L-1)`,
  `DetailedRange = L..End`.
* **Ambiguous Boundary**: Present single-select gate with most likely split
  line as Option 0, Option 1 for custom line ranges.
* **No Implementation Plan**: Assign `FeatureRange = 1..End`,
  `DetailedRange = N/A`.

### Step 4: Staging Strategy

Dispatch the execution pipeline based on the selected preset.

## Five Review Stages

### Stage 5 — Initial Zoom Out Review

**Reviewer**: `egm-synthesizer` with `[egm-zoom-out, egm-inventive-catalyst]`
**Scope**: Full file
**Output**: `zoom_out_report.md`

Evaluate from a high-altitude Contrarian/YAGNI perspective:
- Does this feature actually need to exist right now?
- Can an existing library, API, or service solve 90% of the problem?
- Are we introducing architectural dead-ends?
- Are we getting lost in implementation-level details?

### Stage 6 — Comprehension Test

**Reviewer**: `egm-comprehension` (direct, not synthesizer)
**Scope**: `FeatureRange` & `DetailedRange`
**Output**: `comprehension_report.md`

Can a fresh reader understand the design? Paraphrase the document and
identify gaps, ambiguities, or missing context.

### Stage 7 — Design Critique

**Reviewer**: `egm-synthesizer` with `[egm-design, egm-structural, egm-style]`
**Scope**: `FeatureRange`
**Output**: `critic_report.md`

Hostile architecture review:
- Verify core questions are addressed
- Stress-test assumptions
- Identify architectural risks, failure modes, integration challenges
- Check SoundControl-specific: protocol frames, battery scales, ANC layouts

### Stage 8 — Intermediate Zoom Out Review

**Reviewer**: `egm-synthesizer` with `[egm-zoom-out]`
**Scope**: Full file
**Output**: `intermediate_zoom_out_report.md`

Re-evaluate after Critic findings. Focus on additions/mitigations from
Comprehension and Critic stages. Check for simplicity and YAGNI violations.

### Stage 9 — Implementation Readiness Test

**Reviewer**: `egm-synthesizer` with `[egm-implementation-readiness, egm-codebase-details, egm-style]`
**Scope**: `DetailedRange`
**Output**: `implementation_readiness_report.md`

Can this be implemented?
- Verify Tauri command signatures match existing patterns
- Check Bluetooth/RFCOMM protocol frame formats
- Verify Rust/TypeScript type compatibility
- Check bundled Python runtime size impact
- Verify database migrations are sound

## Report Format

Each stage report includes findings with:
1. **Severity**: [Blocker | Major | Nit]
2. **Affected Scope**: File path, line numbers, or section
3. **Finding & Recommendation**: Technical description and actionable advice

## Checkpoint Gates

After each stage, present a single-select gate:

- **Stages 5, 6, 8**: Option 0: Proceed to next stage; Option 1: Update doc
  first (pause); Option 2: Pause Review
- **Stages 7, 9**: Option 0: Proceed to next stage; Option 1: Resolve
  findings with agent; Option 2: Update doc manually (pause); Option 3:
  Pause Review

## Consolidated Report (Uninterrupted Preset)

If the `uninterrupted` preset is selected, consolidate all findings into
`consolidated_review_report.md` with:
- Actionable tasks by priority (🔴 Blocker, 🟡 Major, 🟢 Nit)
- Traceability Matrix mapping findings to action items