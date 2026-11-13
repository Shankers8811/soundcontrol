---
name: egm-bootstrap
license: MIT
disable-model-invocation: true
description: >-
  Initialize the Elephant-Goldfish Model (EGM) spec-driven development
  workflow in the SoundControl repository. Sets up skills, agents, and
  design document structure.
---

# EGM Bootstrap for SoundControl

Initializes the EGM workflow in this repository so that feature design,
review, and implementation follow the Goldfish review protocol.

## Overview

This skill sets up the EGM directory structure and verifies that all
required components are present. It should be run once when adopting EGM
in a repository, or when the structure needs to be re-established.

## Directory Structure

After bootstrapping, the repository should contain:

```
.claude-plugin/
  plugin.json          # EGM plugin manifest
  marketplace.json     # Marketplace metadata
  agents/              # Goldfish agent persona definitions
skills/
  egm-bootstrap/       # This skill
  egm-brainstorm/      # Ideation skill
  egm-draft/           # Design drafting skill
  egm-review/          # 5-stage Goldfish review skill
  egm-resolve/         # Review finding resolution skill
  egm-review-loop/     # Antagonistic review loop skill
  egm-drift-report/    # Design-to-implementation drift detection
agents/                # Top-level Goldfish agent personas
  egm-design.md
  egm-zoom-out.md
  egm-comprehension.md
  egm-structural.md
  egm-style.md
  egm-implementation-readiness.md
  egm-codebase-details.md
  egm-inventive-catalyst.md
  egm-synthesizer.md
docs/designs/          # Design document directory
  README.md            # Design index
  SITEMAP.md           # Design document sitemap
AGENTS.md              # Agent guidelines for this repository
```

## Execution

1. **Verify structure**: Check that all directories and files above exist.
2. **Create missing files**: Generate any missing skill or agent files from
   the templates in this repository.
3. **Register in AGENTS.md**: Confirm `AGENTS.md` describes the EGM workflow
   for this repository.
4. **Notify user**: Report which components were created or already existed.

## SoundControl-Specific Notes

SoundControl is a Tauri 2 desktop application with:
- Rust backend (`src-tauri/`) for Bluetooth, protocol handling, and device commands
- TypeScript/React frontend (`src/`) for the UI
- Bundled Python bridge (`soundcore_bridge.py`) for Windows RFCOMM
- SQLite database for device state persistence

When bootstrapping EGM here, keep these project constraints in mind for
all subsequent design reviews.