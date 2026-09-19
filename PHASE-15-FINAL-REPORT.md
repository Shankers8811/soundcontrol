# PHASE 15 — FINAL REPORT
## Production Code-Signing Activation + Signed v1.0.7 Release

**Date:** 2026-09-19 · **Branch:** `arena/01a0b5cc-soundcontrol` · **Pull request:** [#27](https://github.com/Shankers8811/soundcontrol/pull/27)

> ## STATUS: PRODUCTION AUTHENTICODE SIGNING PENDING
> ## v1.0.7 NOT CREATED — CORRECTLY BLOCKED (NO SIGNING CREDENTIALS)
> ## PHYSICAL WINDOWS SMARTSCREEN VALIDATION NOT PERFORMED
>
> The live credential probe (this phase, run
> [35419814833](https://github.com/Shankers8811/soundcontrol/actions/runs/35419814833))
> proves that **no production signing credentials are configured** in the
> GitHub Actions environment (`WIN_CSC_LINK` is not set). Phase 15's own rule
> — *"Only proceed to publishing v1.0.7 if a legitimate production signing
> certificate and credentials are actually available"* — therefore stops the
> release path. Nothing was faked, no self-signed certificate was created,
> no gate was weakened, and v1.0.6 remains untouched. What Phase 15 **did**
> deliver: verified Phase 14 state (Task 1), a **current** credential
> availability check (Task 2), and **pre-build certificate validation**
> infrastructure (Tasks 3+4) so the first credential-bearing run is validated
> and fails fast on any unsuitable certificate.

| Item | Value |
|---|---|
| **Starting state** | PR #27 open (8 commits, tip `5488d37`), `main` at `7a8c08b`, version `1.0.6`, electron-builder `26.15.3` |
| **Ending state** | Phase 15 commits on the same branch/PR; version **still 1.0.6** (deliberately — see §4) |
| **v1.0.6 release** | **Untouched** — tag, release and `SoundControl-Setup.exe` asset byte-for-byte unchanged (verified 2026-09-19) |
| **New tags/releases** | **None** — no `v1.0.7` tag, no release, no asset uploads |

---

## 1. Task 1 — Phase 14 state inspection (all verified present)

- **PR #27:** OPEN, MERGEABLE, head `arena/01a0b5cc-soundcontrol`, 8 commits, tip `5488d37` (matches the phase brief).
- **`main`:** still at `7a8c08b` (Phase 14 not yet merged).
- **`package.json`:** version `1.0.6`; `build.win.signtoolOptions` = SHA-256-only + RFC 3161 (DigiCert) — present.
- **electron-builder:** `26.15.3` (from the committed lockfile).
- **Release workflow:** all Phase 14 gates present — Test step, credentials
  gate, certificate staging, `forceCodeSigning` build, Authenticode
  verification gate, smoke, publish-after-gates (now 16 steps with this
  phase's addition).
- **Verification script:** `scripts/verify-windows-signing.ps1` (Valid status,
  `signtool /pa` chain, publisher identity, expiry check, SHA-256 recording,
  all shipped executables).
- **Docs/report:** `docs/WINDOWS-CODE-SIGNING.md`, `PHASE-14-FINAL-REPORT.md`
  present and consistent.
- **Live release history:** v1.0.6 = Latest, asset `SoundControl-Setup.exe`,
  created 2026-09-18T18:17:16Z — unmodified.

Nothing was recreated; Phase 15 work builds strictly on top.

## 2. Task 2 — Signing credential availability: NOT CONFIGURED (verified live)

Checked without ever reading, printing or storing secret values:

1. **History:** the last release-workflow execution before this phase
   (run [35419113088](https://github.com/Shankers8811/soundcontrol/actions/runs/35419113088),
   2026-09-19T03:38Z) failed at the credentials gate — no credentials at
   that point.
2. **Current (decisive):** a new, non-destructive **credential probe** was
   added as the first step of `build-windows.yml` (secret *names* and
   booleans only, never values; result emitted as a CI annotation). Its run
   on this phase's commit
   ([35419814833](https://github.com/Shankers8811/soundcontrol/actions/runs/35419814833),
   completed successfully) produced the annotation:

   > `warning | SIGNING_CREDENTIALS not configured — WIN_CSC_LINK secret is
   > not set. Release builds remain blocked at the credentials gate.`

   The probe is deliberately conservative: a configured secret *name* is not
   assumed to be a working credential — only an actual certificate
   validation + signing + verification sequence in the release workflow can
   prove that (§3). Since even the names are unset, no signing attempt is
   possible.

**Consequence:** the Phase 14 fail-closed behavior remains in force — every
production release attempt stops at the credentials gate.

## 3. Tasks 3 + 4 — Certificate validation infrastructure (implemented; no certificate to validate yet)

A **"Validate the signing certificate"** step was inserted into
`release-windows.yml` between certificate staging and the signed build. When
credentials exist it:

- loads the staged `.p12` with the secret password (wrong password ⇒
  constructor throws ⇒ FAIL; the password is never printed);
- requires a **private key** (`HasPrivateKey`) — a public-cert-only `.p12`
  cannot sign ⇒ FAIL;
- requires the **Code Signing EKU** (`1.3.6.1.5.5.7.3.3` in the Enhanced Key
  Usage extension) and Digital Signature key usage ⇒ FAIL if not a
  code-signing certificate;
- requires the **current validity window** (`NotBefore ≤ now ≤ NotAfter`) ⇒
  FAIL on expired or not-yet-valid certificates;
- builds the **certificate chain under the code-signing application policy
  with online revocation** ⇒ FAIL on untrusted chains — a self-signed
  certificate cannot pass this step;
- prints the **publisher identity** (certificate subject + thumbprint), and
  when `WINDOWS_EXPECTED_PUBLISHER` is configured requires the subject to
  match it ⇒ FAIL on mismatch. The expected value is **never modified** to
  make a check pass.

This runs *before* any build time is spent, so an unsuitable certificate
fails the release in seconds instead of after a full Windows build. The
post-build Phase 14 gates (signature Valid, `signtool verify /pa`, publisher,
expiry, SHA-256, all shipped executables) remain unchanged and unweakened —
they still verify the **actual generated `SoundControl-Setup.exe`**.

**Actual certificate status:** none exists to validate —
no certificate was staged, loaded, or tested in this phase, and no
certificate-related results are claimed.

## 4. Task 5 — v1.0.7 preparation: NOT PERFORMED (by design)

The phase's gating rule states the version bump happens *only after* signing
credentials are confirmed valid. They are not (§2), therefore:

- `package.json` version remains **1.0.6** — no version bump, no commit
  pretending readiness, no `v1.0.7` tag, no release, no draft.
- v1.0.6's tag, release, notes and `SoundControl-Setup.exe` asset are
  byte-for-byte unchanged; no historical artifact was modified.
- The moment credentials are configured, the v1.0.7 path is:
  1. merge this PR (or its successor) so `main` carries the signing pipeline,
  2. bump `package.json` to `1.0.7`, commit on `main`,
  3. `git tag v1.0.7 <commit> && git push origin v1.0.7` —
     the release workflow then runs: Test → credentials gate → certificate
     staging → **certificate validation (new)** → signed build
     (`forceCodeSigning`, SHA-256, RFC 3161) → bundled-runtime check →
     asset staging → Authenticode verification gate → Windows upgrade smoke →
     publish `SoundControl-Setup.exe` to the v1.0.7 GitHub Release.

## 5. Task 6 — Complete test suite (all passing, nothing weakened)

**Local (Linux sandbox, Node 22.22 / Python 3.11):**

| Check | Result |
|---|---|
| `npm test` — packaging-guard self-test (11/11), UI state derivation, UI render smoke (113 checks), bridge probe (51 checks), startup E2E, main-process lifecycle | ✅ exit 0 |
| `npm run build` — protocol verification (479 checks) + `tsc --noEmit` + Vite renderer build + packaging whitelist | ✅ |
| `python -m py_compile` (bridge + test helpers) | ✅ |
| `node --check` (`electron-main.cjs`, `preload.cjs`, `autostart.cjs`) | ✅ |
| Workflow YAML validation (both modified workflows, 9 + 16 steps) | ✅ |

**GitHub CI on this phase's commit `10a556e`:**

| Workflow | Result |
|---|---|
| Tests (ubuntu: protocol/TS/build/bridge/UI/E2E/lifecycle) | ✅ |
| Windows Build (windows-latest: probe step ✅ + installer + python runtime + size gate + signature report) | ✅ |
| Windows Desktop Smoke Test (install, upgrade, launch ×2, helper/port lifecycle, uninstall, autostart cleanup) | ✅ |
| Release Windows | correctly **skipped** (no marker, no tag — no release attempt) |

## 6. Tasks 7–9 — Signed build / verification / Windows install test: NOT PERFORMED

There is no certificate, so no signed artifact was built, no Authenticode
verification of a signed `SoundControl-Setup.exe` was performed, and no
Windows installation of a signed installer was tested. No placeholder,
self-signed or partial result is reported in their place. The Phase 14
verification pipeline — which will perform these checks on the real release
artifact — is unchanged and was re-validated in report mode on the Windows
runner this round (signature-report step ✅ in the Windows Build run).

> **PHYSICAL WINDOWS SMARTSCREEN VALIDATION NOT PERFORMED** — no signed
> installer exists to test with, and SmartScreen's interactive dialog cannot
> be meaningfully exercised on headless CI runners. No claim is made about
> what Windows will display beyond the documented, honest expectations in
> `docs/WINDOWS-CODE-SIGNING.md`.

## 7. Security review (this phase's diff)

- `git status` / full diff reviewed: only `.github/workflows/build-windows.yml`
  (probe step), `.github/workflows/release-windows.yml` (certificate
  validation step) and `docs/WINDOWS-CODE-SIGNING.md` (documentation) changed
  — plus this report.
- No secrets, private keys, `.pfx`/`.p12` material, password literals or
  base64 blobs were introduced. The probe prints secret *names* and
  true/false only; the certificate validation step prints only public
  certificate metadata (subject, thumbprint, EKU OIDs, validity dates).
- No Phase 14 gate was weakened: the release path only gained an *additional*
  validation step before the build. The credentials gate, `forceCodeSigning`,
  and the post-build verification gate are byte-identical in behavior.
- SmartScreen, Windows security settings, registry and Mark-of-the-Web
  behavior remain untouched.

## 8. Files changed this phase

| File | Change |
|---|---|
| `.github/workflows/build-windows.yml` | Credential-availability probe step (annotations; names/booleans only) |
| `.github/workflows/release-windows.yml` | "Validate the signing certificate" step (private key, Code Signing EKU, validity window, trusted chain, publisher identity/match) |
| `docs/WINDOWS-CODE-SIGNING.md` | Documents the validation step (gate 2 of 4) |
| `PHASE-15-FINAL-REPORT.md` | This report |

Commits: `10a556e` (*feat(signing): Phase 15 credential probe + pre-build
certificate validation*) and the report annotation commit on top.

## 9. Exactly what is still required before a signed v1.0.7

1. **Obtain a legitimate Authenticode code-signing certificate** from a CA
   trusted by Windows (SignPath Foundation free for qualifying OSS · OV
   ~$75–200/yr · EV ~$200–400/yr — trade-offs in
   `docs/WINDOWS-CODE-SIGNING.md`).
2. **Configure the secrets** (Settings → Secrets and variables → Actions):
   `WIN_CSC_LINK` = base64 of the `.pfx`/`.p12`; `WIN_CSC_KEY_PASSWORD` =
   its password. Optionally set the `WINDOWS_EXPECTED_PUBLISHER` variable to
   the certificate's subject so the gate pins the publisher identity.
3. **Merge PR #27** so `main` carries the full pipeline.
4. **Bump to 1.0.7 on main and tag `v1.0.7`** — the workflow then proves the
   credential works end to end (certificate validation → signing →
   Authenticode verification) and publishes the signed release only if every
   gate passes.
5. After release: record the printed installer SHA-256, verify on a physical
   Windows machine (`Get-AuthenticodeSignature` → `Valid`, publisher shown),
   and let SmartScreen reputation build — expecting honestly that early
   downloads may still see a reputation prompt (with the verified publisher
   name) until reputation accrues.

---

**Phase 15 stops here.** Signing infrastructure is activated-ready with
pre-build certificate validation; production signing remains pending on a
real certificate; unsigned production releases remain impossible; v1.0.6 is
untouched; no Windows security was modified or bypassed.
