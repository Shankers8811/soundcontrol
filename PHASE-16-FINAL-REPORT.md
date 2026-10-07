# PHASE 16 — FINAL REPORT
## Production Signing Readiness / v1.0.7 Release Preparation

**Date:** 2026-09-19 · **Branch:** `arena/01a0b5cc-soundcontrol` · **Pull request:** [#27](https://github.com/Shankers8811/soundcontrol/pull/27)

> ## PRODUCTION AUTHENTICODE SIGNING PENDING
>
> **OUTCOME A** of this phase's stop conditions applies: the live credential
> probe (run
> [35420618832](https://github.com/Shankers8811/soundcontrol/actions/runs/35420618832),
> this phase's commit) again reports **`SIGNING_CREDENTIALS not configured —
> WIN_CSC_LINK secret is not set`**. No version bump, no `v1.0.7` tag, no
> release, no gate changes, no fake results. What this phase delivered: full
> infrastructure re-verification, a **shared certificate-validation script**,
> a **CI signing-validation path that validates without publishing**, and the
> **maintainer setup guide** — everything a maintainer needs to go from
> "obtain a certificate" to "published signed v1.0.7" with no further code
> changes.

| Item | Value |
|---|---|
| **Current commit (branch)** | `7ba6789` (*feat(signing): Phase 16 — shared certificate-validation script, CI signing validation, maintainer setup guide*) + the report commit |
| **`main`** | `7a8c08b` (Phase 14/15/16 infrastructure not yet merged — PR #27 open, mergeable, 11+ commits) |
| **Current version** | `1.0.6` — **unchanged** (bump is gated on valid credentials, which are absent) |
| **v1.0.7 status** | **Not created** — no tag, no release, no draft (correctly blocked) |
| **v1.0.6 preservation** | **Verified untouched** — see §6 |
| **Credential availability** | **Not configured** (verified live, §2) |

---

## 1. Task 1 — Repository verification (all confirmed)

| Check | Result |
|---|---|
| `main` commit | `7a8c08b` (*Merge pull request #26*) — unchanged since Phase 14 |
| PR #27 | OPEN, MERGEABLE, head `arena/01a0b5cc-soundcontrol` |
| `package.json` version | `1.0.6` |
| `v1.0.6` tag | present — annotated tag `2b0bd1f` → commit `3cd1397`, tagged 2026-09-18T18:17:16Z (historical, untouched) |
| `v1.0.6` GitHub Release | present — asset `SoundControl-Setup.exe` (122,503,948 bytes), published 2026-09-18T18:21:27Z, asset unchanged since 2026-09-18T18:21:31Z |
| Signing workflow | `.github/workflows/release-windows.yml` — 16 steps: Test → credentials gate → cert staging → certificate validation → `forceCodeSigning` build → runtime check → asset staging → Authenticode gate → smoke → cleanup → tag → publish |
| Verification script | `scripts/verify-windows-signing.ps1` (Valid status, `signtool /pa`, publisher, expiry, SHA-256, all shipped executables) |
| Signing documentation | `docs/WINDOWS-CODE-SIGNING.md` (now incl. the maintainer setup guide) |
| Phase 14 report | `PHASE-14-FINAL-REPORT.md` — present |
| Phase 15 report | `PHASE-15-FINAL-REPORT.md` — present |
| No `v1.0.7` tag/release | confirmed (tags: v1.0.2–v1.0.6 only) |

## 2. Task 5 — Credential availability: NOT CONFIGURED (live probe)

The Phase 15 probe remains in place as the first step of `build-windows.yml`
and reports only **configured = true/false** for the secret names — never
values, passwords, certificate contents or base64 data. Its run on this
phase's commit:

- Run [35420618832](https://github.com/Shankers8811/soundcontrol/actions/runs/35420618832)
  → annotation: **`SIGNING_CREDENTIALS not configured — WIN_CSC_LINK secret
  is not set. Release builds remain blocked at the credentials gate.`**
- The new conditional "Validate the signing certificate (when configured)"
  step **skipped** (as designed when credentials are absent), and the staged
  -material cleanup ran.

Historical confirmation: every credential-gate execution to date
([35383630314](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630314),
[35419113088](https://github.com/Shankers8811/soundcontrol/actions/runs/35419113088))
has failed closed. Per this phase's rule, the result is
**PRODUCTION AUTHENTICODE SIGNING PENDING**, and v1.0.7 is not created.

## 3. Task 2 — Signing gates: unchanged and unweakened

No gate was modified, weakened, or given a bypass/emergency/allow-unsigned
option. The only changes are *additive*:

- The release workflow's inline certificate-validation step now calls the
  shared `scripts/validate-signing-certificate.ps1` — **identical checks**
  (private key, Code Signing EKU, Digital Signature KU, validity window,
  trusted code-signing chain with online revocation, publisher identity and
  `-ExpectedPublisher` match), factored for reuse. Its position in the flow
  (after staging, before the build) and its fail-hard behavior are unchanged.
- A new **CI-only** validation path (below) that cannot publish anything.

The fail-closed matrix remains exactly as required:

| Condition | Release result |
|---|---|
| Missing credentials | blocked (credentials gate) |
| Invalid/unloadable certificate | blocked (validation step) |
| Expired / not-yet-valid certificate | blocked (validation step **and** verification gate) |
| Untrusted chain / self-signed | blocked (validation step **and** `signtool /pa` gate) |
| Wrong publisher | blocked (validation step **and** verification gate) |
| Unsigned installer | blocked (`forceCodeSigning` **and** verification gate) |
| Invalid Authenticode signature | blocked (verification gate) |

## 4. This phase's deliverables

| File | Change |
|---|---|
| `scripts/validate-signing-certificate.ps1` | **New.** Shared pre-build certificate validation (full check list in §3). Password is read from the `WIN_CSC_KEY_PASSWORD` env var — never a command-line parameter, never printed. Only public certificate metadata is output. |
| `.github/workflows/release-windows.yml` | The validation step calls the shared script (behavior identical). |
| `.github/workflows/build-windows.yml` | New **"Validate the signing certificate (when configured)"** step: when the secrets exist, a plain CI run stages the certificate, runs the full validation, and removes the staged material (`if: always()`). This is the "signing validation" a maintainer runs — it proves the certificate **without signing or publishing anything**, so v1.0.7 is only prepared after validation is green. Skips harmlessly while credentials are unconfigured. |
| `docs/WINDOWS-CODE-SIGNING.md` | **"Maintainer setup — from zero to a signed v1.0.7"** (Task 4): obtain certificate → export base64 `.p12` → configure `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` → optionally pin `WINDOWS_EXPECTED_PUBLISHER` → never commit keys → never expose the password → verify Actions access via the probe annotation → run the signing validation → only then prepare v1.0.7. No real secret values anywhere. |
| `PHASE-16-FINAL-REPORT.md` | This report. |

## 5. Tasks 6–12 — Signed release path: NOT ENTERED (no credentials)

Per the phase's gating, Tasks 6–12 (certificate use, version bump to 1.0.7,
signed build, installer verification, Windows test, release-safety
checklist) begin **only if legitimate credentials are actually available**.
They are not (§2), so none were performed and no results are claimed. The
complete release path is implemented and waiting; it executes unchanged the
moment credentials are configured (§8).

## 6. v1.0.6 preservation verification (re-verified this phase)

- Tag `v1.0.6` → annotated tag object `2b0bd1f` → commit `3cd1397`
  (unchanged; no force-updates — no `v1.0.7` or moved tags exist).
- Release `v1.0.6`: asset `SoundControl-Setup.exe`, 122,503,948 bytes,
  published 2026-09-18T18:21:27Z, **asset not modified since
  2026-09-18T18:21:31Z** (before this phase began).
- No release, tag, asset upload or edit operations were issued against
  v1.0.6 in Phases 14–16.

## 7. Tests performed (nothing weakened or skipped)

**Local:** `npm test` (packaging guard 11/11, UI state + render 113 checks,
bridge probe 51 checks, E2E, lifecycle) ✅ exit 0 · `npm run build` path
covered by CI · `python -m py_compile` ✅ · `node --check` ✅ · YAML
validation of both modified workflows (11 + 16 steps) ✅ · structural check
of both PowerShell scripts ✅.

**CI on `7ba6789`:**

| Workflow | Result |
|---|---|
| Tests (ubuntu) | ✅ |
| Windows Build — probe step ✅ (annotation: not configured), conditional validation correctly **skipped**, installer + bundled runtime + 500 MB gate + signature report | ✅ |
| Windows Desktop Smoke Test (install, upgrade, launch ×2, helper/port lifecycle, uninstall, autostart cleanup) | ✅ |
| Release Windows | correctly skipped (no marker, no tag) |

## 8. Exact remaining maintainer action (the only blocker)

1. **Obtain a legitimate production code-signing certificate** (SignPath
   Foundation free for qualifying OSS · OV · EV · or another trusted
   provider). Not self-signed, not a development certificate.
2. **Configure the secrets** `WIN_CSC_LINK` (base64 of the `.p12`) and
   `WIN_CSC_KEY_PASSWORD`; optionally set the `WINDOWS_EXPECTED_PUBLISHER`
   variable. Full procedure, including how to verify each step:
   `docs/WINDOWS-CODE-SIGNING.md` → *Maintainer setup*.
3. **Watch the next Windows Build run** — the probe annotation flips to
   `SIGNING_CREDENTIALS=configured` and the new validation step runs the
   full certificate check (no publish). If it fails, fix the certificate or
   secrets before proceeding.
4. **Merge PR #27**, bump `package.json` to `1.0.7` on `main`, tag `v1.0.7`,
   push the tag — the Release workflow signs (SHA-256 + RFC 3161), verifies
   (Authenticode Valid, `signtool /pa`, publisher, expiry, SHA-256 recorded,
   all shipped executables), smoke-tests, and publishes the signed
   `SoundControl-Setup.exe` only if every gate passes.

---

**Phase 16 stops here (OUTCOME A).** Signing infrastructure is complete and
re-verified; production signing remains pending solely on a real
certificate; unsigned production releases remain impossible; v1.0.6 is
untouched; no Windows security was modified or bypassed; no fake results
are reported.
