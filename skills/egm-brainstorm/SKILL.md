---
name: egm-brainstorm
license: MIT
disable-model-invocation: true
description: >-
  Interactive ideation and brainstorming skill for the Elephant-Goldfish
  Model (EGM). Turns half-baked concepts into structured hypotheses via
  clarifying questions, parallel Goldfish review, and iterative refinement.
  Produces a concepts_brief.md artifact.
---

# EGM Brainstorm for SoundControl

Interactive multi-lens ideation engine that turns raw feature concepts into
structured hypotheses. Produces `concepts_brief.md` as an artifact.

## Overview

This skill is the upstream conversational brainstorming engine for EGM.
It combines interactive clarifying questions with automated Goldfish review
across specialized lenses to produce an iteratively refined concepts brief.

## Delegation

A Goldfish runs in a fresh context with no conversation history. Spawn each
subagent with your harness's subagent tool. Each subagent is defined in
`agents/<file>.md`. Pass the prompt verbatim and wait for the report.

If your harness cannot nest subagents, use direct dispatch instead of the
synthesizer. If your harness has no subagent tool, stop and tell the user:
a review in the same context is not a Goldfish review.

## Execution Constraints (CRITICAL)

1. **Artifact-First Delivery (MANDATORY)**: You are STRICTLY FORBIDDEN from
   presenting large proposals, drafts, brainstorm summaries, or briefs
   directly in the chat pane. You MUST write/update them directly to a file
   (e.g., `./concepts_brief.md`) using your file-writing tool and notify the
   user in the chat with a clean link to the file.

2. **Multi-Turn Open-Ended Clarification**: You MUST drill down into the
   concept through open-ended plain-text questions across multiple chat turns
   until the problem statement and boundaries are thoroughly clear. You MUST
   NOT spawn subagents until the user explicitly confirms readiness.

3. **Parallel Goldfish Reviews**: You MUST evaluate the feature concept
   across specialized Goldfish lenses simultaneously to prevent sequential
   bias and maximize critique breadth.

4. **Plain-English Standard**: Write all concepts briefs in simple, direct,
   jargon-free plain English. Do not use ungrounded promotional adjectives
   or decorative adverbs.

5. **Default to Stress-Testing**: Never agree by default. Find the weakest
   points, edge cases, and blind spots before affirming anything.

6. **No Glazing**: Eliminate sycophancy. Do not call ideas "great," "brilliant,"
   or "smart."

7. **Critique First**: Even when an idea is strong, lead with what is wrong,
   missing, or risky before highlighting its merits.

8. **Banned Adjectives**: You are strictly prohibited from using validating
   adjectives like "brilliant," "great," "smart," "correct," "perfect,"
   "excellent," or "spot-on."

9. **Banned Apologies**: You MUST NOT output polite apologies when challenged
   or corrected. Instead, outline the corrected technical logic or trade-offs
   directly.

## The Goldfish Brainstorming Lenses

| Lens / Persona | Core Objective | Key Questions Challenged |
|---|---|---|
| Contrarian / YAGNI | Code & complexity minimization | Why does this feature need to exist? Can an existing library solve this? |
| Cost, Quota & Token Economics | Infrastructure & budget scaling | What is the peak QPS, memory footprint, or LLM token budget? |
| UX & Developer Ergonomics | Usability & cognitive overhead | Is the API/CLI intuitive? Are error messages actionable? |
| Migration & Backward Compatibility | Rollout safety & version skew | How do existing clients/data migrate? Is rollback handled? |
| Observability & SRE Debuggability | Telemetry & operational visibility | Are key operations traceable? How will oncall triage an incident? |
| Long-Term Tech Debt & Maintenance | Future maintainability | Does this introduce tightly coupled dependencies? |
| Inventive Catalyst | Contradiction elimination | What fundamental trade-off is accepted as inevitable? |

## Execution Workflow

### Step 1: Deep Clarification & Problem Statement Drilling

1. Check if the user provided an initial feature idea or concept prompt.
   If missing, prompt the user to describe what they want to brainstorm.
2. Iterative problem drilling across multiple chat turns until the problem
   statement, constraints, and target behavior are thoroughly defined.
   Ask open-ended questions directly in chat:
   - What specific problem does this solve?
   - Who or what system will consume this feature?
   - What are the hard non-negotiable constraints?
   - What are the edge cases or out-of-scope boundaries?
   - How is this issue dealt with today? Why doesn't that work?
   - How is success going to be measured?
3. Readiness Checkpoint Gate: Summarize the anchored working hypothesis in
   2-3 sentences. Present an explicit single-select confirmation gate:
   - Option 0: Review with Goldfishes
   - Option 1: Clarify additional constraints or assumptions in chat
4. Proceed to Step 2 ONLY after Option 0 is confirmed.

### Step 2: Goldfish Review & Synthesis

1. Delegate to the egm-synthesizer agent (or parallel Goldfish subagents
   across the 7 specialized lenses):
   - Mode: BRAINSTORM
   - Reviewers: egm-design, egm-codebase-details, egm-zoom-out,
     egm-comprehension, egm-implementation-readiness, egm-structural,
     egm-inventive-catalyst
2. The synthesizer launches parallel Goldfish reviewers across the lenses.
3. Deduplicate overlapping findings and format into a cohesive analysis.
4. Write/Update Artifact: Write the synthesized brief to
   `concepts_brief.md` in the working directory.

The `concepts_brief.md` artifact follows this structure:

```markdown
# [Feature Name]

* **Author:** [Author Name]
* **Date:** [YYYY-MM-DD]

## Overview

[High-level summary of the feature, target user, and core value proposition.]

## Analysis

[Cohesive analysis found by review lenses covering inventive contradictions,
suggested catalog patterns, secondary trade-offs, and the Ideal Final Result.]

## Goals vs. Non-Goals

* **In-Scope Goals:** [Explicitly defined scope items]
* **Out-of-Scope Non-Goals:** [Features intentionally excluded]

## Alternatives Weighed

[Each option rejected during ideation, with the technical reason.]

## Key Decisions & Staging for Next Steps

[Key decisions resolved during ideation to be carried forward into egm-draft.]
```

### Step 3: Interactive Iteration & Refinement Loop

1. Notify the user in chat that `concepts_brief.md` has been updated.
   Highlight 2-3 key objections or open risks raised by the Goldfish reviewers.
2. Ask the user how they wish to address the Goldfish objections.
3. Loop back to Step 1/2 to re-run or update the Goldfish analysis.

### Step 4: Finalize & Handoff

1. Ask the user to review the final `concepts_brief.md` artifact and confirm
   their alignment.
2. Handoff Gate: Present standardized handoff choices:
   - Option 0: Publish concepts_brief.md as RFC for team feedback
   - Option 1: Proceed to egm-draft (Initialize formal design document)
   - Option 2: Continue refining concepts_brief.md in ideation mode
   - Option 3: Conclude brainstorming and keep brief for later