# PHASE 14 — FINAL REPORT
## Windows Authenticode Signing + SmartScreen Trust

**Date:** 2026-09-19 · **Branch:** `arena/01a0b5cc-soundcontrol` · **Pull request:** [#27](https://github.com/Shankers8811/soundcontrol/pull/27)

> ## STATUS: PRODUCTION AUTHENTICODE SIGNING PENDING
>
> Signing infrastructure, the mandatory release-signing gate, verification,
> and documentation are **implemented and validated**. No legitimate
> production code-signing certificate/credential exists in the repository or
> CI environment (verified against the live Actions state — see §1), so
> **no installer was signed, no release was published, and no SmartScreen
> claim is made**. Per the phase STOP conditions, production releases are now
> *blocked by design* until the credentials in §5 are configured.

| Item | Value |
|---|---|
| **Starting commit** | `7a8c08b1746565646207d3f1e1b5456f34f67113` (merge of PR #26, `main`) |
| **Ending commit** | [`f356cdc`](https://github.com/Shankers8811/soundcontrol/commit/f356cdc) — final substantive Phase 14 commit (see §3; the only commit after it is this one-line hash annotation) |
| **electron-builder** | `26.15.3` (verified in `package-lock.json` / `node_modules`; signing mechanism chosen from its actual source, not deprecated options) |
| **Application version** | `1.0.6` — **unchanged** |
| **Release touched?** | **No.** v1.0.6 was not rebuilt, re-tagged, modified or deleted; its asset is byte-for-byte the same unsigned `SoundControl-Setup.exe` |

---

## 1. Audit of the live repository before changes (Task 1)

- `package.json` electron-builder config: `win` had only `target: ["nsis"]` + `icon` — **no signing configuration at all**; electron-builder's default is a legacy SHA-1+SHA-256 dual signature.
- `.github/workflows/release-windows.yml`: signing was *optional* — secrets `WINDOWS_CERTIFICATE_BASE64`/`WINDOWS_CERTIFICATE_PASSWORD` were decoded to `cert.p12` → `CSC_LINK`/`CSC_KEY_PASSWORD`, but the setup step **skipped silently** when they were absent, and the post-build step only *reported* an unsigned installer. That is how v1.0.6 shipped unsigned.
- **Live credential check:** the most recent release run before this phase (run 35379460961, 2026-09-18) shows *“Set up Authenticode signing (skipped without certificate secrets) => skipped”* — **no signing secrets exist in the repository**. Re-confirmed after this phase: the gate-proof run (§6) failed exactly at the credentials check, proving both secret names (and their legacy aliases) are unset.
- `package-lock.json`: electron-builder pinned at 26.15.3; signing surface verified from the installed `app-builder-lib` source: `win.signtoolOptions` (current mechanism), env `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` (Windows password env) with `CSC_LINK`/`CSC_KEY_PASSWORD` fallbacks, `win.forceCodeSigning` hard-fail, RFC 3161 timestamping.
- Packaging validation (`scripts/check-package-files.mjs`), build scripts, installer config (NSIS), smoke scripts, CI workflows and documentation reviewed; signing belongs in exactly three places: the electron-builder `win.signtoolOptions` + env credentials, the release workflow, and a post-build verifier.

## 2. Files changed (11 + this report)

| File | Change |
|---|---|
| `package.json` | `build.win.signtoolOptions`: `signingHashAlgorithms: ["sha256"]` (**SHA-256 only**, overriding the sha1+sha256 default) + `rfc3161TimeStampServer` (DigiCert). New `verify:signing` script. **No credentials, no cert paths, version untouched.** |
| `scripts/verify-windows-signing.ps1` | **New.** Verifies the actual generated EXEs (see §7). Report mode (CI) and `-RequireSigned` release-gate mode. |
| `.github/workflows/release-windows.yml` | Release builds require signing: test step + credentials gate + cert staging + `forceCodeSigning` build + verification gate before publish (see §6). |
| `.github/workflows/build-windows.yml` | Report-only signature-status step for non-distributed CI artifacts. |
| `docs/WINDOWS-CODE-SIGNING.md` | **New.** Full signing/SmartScreen documentation incl. credential-unavailable and certificate-rotation sections. |
| `README.md` | "Code signing & SmartScreen" rewritten for the enforced gate + new secrets. |
| `PUBLISH.md` | Signing is now a required release step, not optional. |
| `TROUBLESHOOTING.md` | SmartScreen section updated. |
| `.github/SECURITY.md` | Trust model: release builds gated on signing; CI artifacts may be unsigned. |
| `ROADMAP.md` | Signing entry updated; certificate acquisition marked open. |
| `PHASE-14-FINAL-REPORT.md` | This report. |

## 3. Commits

| Commit | Subject |
|---|---|
| [`57f78a3`](https://github.com/Shankers8811/soundcontrol/commit/57f78a39ea083db183215d9efd0e69b22c666991) | `feat(signing): enforce Authenticode code signing for Windows releases` |
| [`f919bf5`](https://github.com/Shankers8811/soundcontrol/commit/f919bf588a0d9882c503fe9f37dee066925f4013) | `test(release): verify the signing gate fails closed without credentials [publish-windows]` — intentional empty marker commit proving the gate |
| [`7f5ffbc`](https://github.com/Shankers8811/soundcontrol/commit/7f5ffbc) | `docs: add Phase 14 final report and complete signing docs` |
| [`1e6c0f6`](https://github.com/Shankers8811/soundcontrol/commit/1e6c0f656c27f0bd904353e69ce7573f05fda618) | `docs(report): record the third CI round — smoke flake did not reproduce` |
| [`f356cdc`](https://github.com/Shankers8811/soundcontrol/commit/f356cdc) | `feat(signing): certificate-expiry gate, release-flow test step, expanded docs & report` — final substantive Phase 14 commit |

## 4. Signing configuration (Task 2)

- **Mechanism (electron-builder 26.15.3, current — not deprecated options):**
  `win.signtoolOptions` + environment credentials. `certificateFile`/`certificatePassword` config fields are intentionally **not** used (electron-builder's own docs direct env vars for CI).
- **Env vars:** `WIN_CSC_LINK` (staged `cert.p12` path) + `WIN_CSC_KEY_PASSWORD`, consumed by electron-builder directly.
- **SHA-256 only** + **RFC 3161 timestamping** (signature remains valid after certificate expiry; the gate enforces the timestamp's presence).
- **Artifacts signed** when credentials exist (verified from electron-builder source): `SoundControl.exe` (app exe), bundled Python executables (`python.exe`, `pythonw.exe` in `resources/python`), the NSIS **uninstaller**, and the **NSIS installer** itself. Nothing else is signed — no arbitrary file signing; PE executables only.
- **Local/dev builds** (`npm run build:win` without the release flags) stay unsigned-allowed — development behavior is explicitly separated from release behavior.

## 5. Required GitHub secrets / variable (Task 6)

| Name | Kind | Value |
|---|---|---|
| `WIN_CSC_LINK` | **secret** | base64 of the `.pfx`/`.p12` (a `data:…;base64,…` URI also accepted) |
| `WIN_CSC_KEY_PASSWORD` | **secret** | certificate password |
| `WINDOWS_EXPECTED_PUBLISHER` | variable (optional; not secret) | expected signer identity; the gate fails on mismatch when set |

Legacy aliases still honored: `WINDOWS_CERTIFICATE_BASE64` / `WINDOWS_CERTIFICATE_PASSWORD`.

Credential handling guarantees (verified in review): secrets appear **only** as `${{ secrets.* }}` references in workflow `env:` blocks; no secret values, certificate contents, or private keys are ever printed; the staged `cert.p12` is deleted by an `if: always()` cleanup step before artifacts upload; nothing credential-shaped exists in `package.json`, source code, or workflow source.

## 6. Release workflow — the enforced flow (Tasks 3 & 8)

```
checkout → npm ci
  → Test (UI state/render + packaging guard; protocol 479 checks + tsc + vite
    + whitelist run inside the build step; full unit suite on ubuntu via tests.yml)
  → [GATE 1] Require Authenticode signing credentials   … missing ⇒ FAIL
  → Stage certificate from secrets (never printed)
  → [GATE 2] Build + Package + Sign (electron-builder, forceCodeSigning,
    SHA-256, RFC 3161)                                   … unsigned ⇒ FAIL
  → Verify bundled Python runtime
  → Stage the single installer asset
  → [GATE 3] Verify Authenticode signatures (-RequireSigned):
        installer exists · signature exists · status Valid · chain trusted
        (signtool verify /pa) · publisher identity present (+ match when
        WINDOWS_EXPECTED_PUBLISHER set) · certificate not expired ·
        unmodified after signing · SHA-256 recorded · every shipped
        executable signed                                 … any failure ⇒ FAIL
  → Windows upgrade smoke test
  → Remove certificate material (always)
  → Publish GitHub Release   ← unreachable unless every gate above passed
```

**Live proof that unsigned production releases are now impossible:** marker
commit `f919bf5` triggered a real release run
([35383630314](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630314))
which failed **exactly** at *“Require Authenticode signing credentials”*;
build, staging, verification, smoke and **publish** steps were all skipped,
and the v1.0.6 release was left untouched (asset name/timestamp unchanged).
Normal CI/test builds (build-windows, smoke-windows, tests) remain
unsigned-allowed because their artifacts are not distributed.

## 7. Authenticode verification (Task 5) — implemented checks

`scripts/verify-windows-signing.ps1` inspects the **final distributed
artifact** (the staged `release-assets/SoundControl-Setup.exe` byte-for-byte),
never a certificate file:

1. Installer exists (exactly one root-level `*.exe`).
2. Authenticode signature exists (`Get-AuthenticodeSignature`).
3. Signature status is **Valid**.
4. Certificate chain is trusted (`signtool verify /pa`, Windows SDK).
5. Publisher identity (signer subject) is present — fail if empty.
6. Expected publisher identity is displayed and, when
   `WINDOWS_EXPECTED_PUBLISHER` is configured, must match (fail on mismatch).
7. Certificate is **not expired** (explicit NotBefore/NotAfter window check;
   fails on expired or not-yet-valid signer).
8. Installer not modified after signing (Valid status + `/pa` re-validation
   of the signed hash).
9. SHA-256 recorded — console, `release/SIGNING-SUMMARY.txt` (travels with
   the workflow artifact) and the GitHub Actions step summary.
10. Required executable artifacts signed — every `*.exe` under
    `win-unpacked/` (app exe + bundled Python runtime) must be Valid.

Same verification is available locally: `npm run verify:signing` /
`./scripts/verify-windows-signing.ps1 -InstallerPath .\SoundControl-Setup.exe -RequireSigned`.

## 8. Tests executed (Task 10)

**Local (Linux sandbox, Node 22.22 / Python 3.11):**

| Check | Result |
|---|---|
| `npm run build` — protocol verification (479 checks) + `tsc --noEmit` + Vite renderer build + packaging whitelist | ✅ |
| `npm test` — packaging-guard self-test (11/11), UI state derivation, UI render smoke (113 checks), bridge probe (51 checks), startup E2E, main-process lifecycle | ✅ exit 0 |
| `npm run test:ui` + `npm run test:package` (the new release-flow test step) | ✅ |
| `python -m py_compile` (bridge + both test helpers) | ✅ |
| `node --check` (`electron-main.cjs`, `preload.cjs`, `autostart.cjs`) | ✅ |
| YAML validity of all four workflows; PowerShell structural check of the verifier | ✅ |
| electron-builder config merged + validated against the real `scheme.json` — release variant resolves `win.forceCodeSigning = true` (boolean, AJV-coerced), dev variant stays unset; `signtoolOptions` present in both | ✅ |
| CLI `--config.win.forceCodeSigning=true` parsed with the real electron-builder yargs parser | ✅ |

**GitHub CI (real `windows-latest` runners):**

| Suite (Task 10 item) | Where | Result |
|---|---|---|
| TypeScript, Python, Node syntax, UI state/render, bridge, protocol, E2E, lifecycle, packaging whitelist | `tests.yml` (ubuntu) — runs [35383192791](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192791), [35383630327](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630327), [35384134345](https://github.com/Shankers8811/soundcontrol/actions/runs/35384134345) | ✅ all rounds |
| Windows build (with the new `signtoolOptions` config) + signature report step | `build-windows.yml` — [35383192887](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192887), [35383630767](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630767), [35384134393](https://github.com/Shankers8811/soundcontrol/actions/runs/35384134393) | ✅ all rounds |
| Windows smoke: **install**, **upgrade**, **launch**, **run twice**, **helper lifecycle**, **port lifecycle**, **uninstall**, **autostart cleanup** | `smoke-windows.yml` — [35383192805](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192805), [35384134327](https://github.com/Shankers8811/soundcontrol/actions/runs/35384134327) | ✅ (one 2nd-round timing flake of the pre-existing clean-install step did not reproduce on identical code — environmental, unrelated to signing) |
| Release gate (fail-closed proof) | `release-windows.yml` — [35383630314](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630314) | ⛔ failed at the credentials gate **by design**; publish skipped |

No existing test was weakened, deleted or modified. Bluetooth/RFCOMM/bridge,
lifecycle, helper/port handling, UI, protocol, security/auth, packaging,
install/upgrade/uninstall, autostart and tray behavior are untouched by the
diff (only `win.signtoolOptions` was added to the electron-builder config — a
no-op without credentials, confirmed by the green Windows smoke runs).

## 9. Signing results — honest status

| Item | Value |
|---|---|
| **Installer filename** | `SoundControl-Setup.exe` (published v1.0.6 asset — unchanged) |
| **Signed/unsigned status** | **UNSIGNED** — v1.0.6 remains the previously-released unsigned build; no new installer was built or signed |
| **Installer size** | N/A — no new installer produced in this phase (v1.0.6 asset untouched) |
| **Installer SHA-256** | N/A — no new artifact; the recording pipeline (console + `SIGNING-SUMMARY.txt` + step summary) is implemented and will capture the first signed release's hash |
| **Authenticode verification result** | Not performed on a signed artifact — **none exists**. Report mode validated on a real Windows runner (✅ steps in §8); gate mode proven to fail closed |
| **Certificate type** | None configured. Required: an Authenticode **code signing** certificate from a CA in the Microsoft trusted root program — OV (~$75–200/yr), EV (~$200–400/yr), or free via [SignPath Foundation](https://signpath.org/) |
| **Publisher identity** | None yet (no certificate). Once obtained, the certificate subject becomes the displayed publisher and can be pinned with `WINDOWS_EXPECTED_PUBLISHER` |
| **Certificate validity status** | N/A — no certificate configured |
| **Executable signing results** | None signed (no credentials). When credentials exist, electron-builder signs: app exe, bundled `python.exe`/`pythonw.exe`, NSIS uninstaller, NSIS installer — and gate 3 verifies the installer + every shipped `*.exe` |

## 10. Windows physical validation (Task 11)

Real Windows runners (`windows-latest`, Windows Server 2022/2025 images) ran
the full smoke suite against the CI build of this phase's code: clean
**install**, silent **install/upgrade**, two **launches** with graceful
close, **helper** start/stop, **port 8765** lifecycle, complete **uninstall**
(no directories/registry/processes/listeners left), and **autostart**
enforcement — all ✅ (§8). The installer used for those runs is an unsigned
CI build, because no signing credentials exist.

> ## PHYSICAL WINDOWS SMARTSCREEN VALIDATION NOT PERFORMED
>
> SmartScreen behavior was **not** physically observed: there is no signed
> installer to test with, and SmartScreen's interactive dialog cannot be
> meaningfully exercised on headless CI runners. No claim is made about
> the warning's behavior beyond the documented expectations in
> `docs/WINDOWS-CODE-SIGNING.md` (§11).

## 11. SmartScreen expectations (Task 9) — as documented, without overclaiming

- An unsigned application shows **"Unknown publisher"** — the current v1.0.6 state.
- Authenticode signing **establishes a publisher identity**; a trusted
  certificate is required for meaningful public trust.
- **Signing does not guarantee immediate SmartScreen approval.** A newly
  signed application can still be considered unfamiliar; reputation develops
  over time from real downloads (EV certificates / established signing
  services typically start with immediate reputation).
- Keeping the **same legitimate publisher/signing identity** across releases
  builds continuity; rotating identities resets reputation.
- Users are **never instructed to disable SmartScreen** anywhere in this
  project's code, installer, or documentation.
- **SoundControl does not bypass Microsoft Defender SmartScreen** — stated
  explicitly in `docs/WINDOWS-CODE-SIGNING.md`.

## 12. Security review (Task 15)

- `git status`: clean (only the intended tracked changes).
- `git diff 7a8c08b..HEAD` scanned for private keys, `.pfx`/`.p12` content,
  password literals, certificate blobs, `WIN_CSC_KEY_PASSWORD` values and
  long base64 payloads: **no secret material found**. The only pattern match
  is the documentation example `$env:WIN_CSC_KEY_PASSWORD = "the certificate
  password"` — a placeholder in the local-development guide, not a secret.
- Per-commit scan of every phase commit (`57f78a3`, `f919bf5`, `7f5ffbc`,
  `1e6c0f6`): no secrets introduced and later removed — history is clean.
- Workflow source contains only `${{ secrets.* }}` references; no literal
  credentials in `package.json`, source, or workflow files. No values are
  exposed in this report.

## 13. What is required before a signed release can be published

1. Obtain an Authenticode code-signing certificate (SignPath Foundation free
   for qualifying OSS · OV · EV — routes and trade-offs in
   `docs/WINDOWS-CODE-SIGNING.md`).
2. Repository → Settings → Secrets and variables → Actions:
   set **`WIN_CSC_LINK`** (base64 of the `.pfx`/`.p12`) and
   **`WIN_CSC_KEY_PASSWORD`**; optionally set the
   **`WINDOWS_EXPECTED_PUBLISHER`** variable to the certificate's subject.
3. Tag the next release — **v1.0.7** is the appropriate next semantic version
   (patch: same application, now with a legitimately signed installer; the
   in-app updater's `releases/latest/download/...` link picks it up
   automatically). The three gates then exercise the full sign-and-verify
   path for the first time, and the release publishes only if every check in
   §7 passes.
4. After publishing: record the installer SHA-256 (printed by the gate),
   optionally verify on a physical Windows machine
   (`Get-AuthenticodeSignature` → `Valid`, publisher shown), and let
   SmartScreen reputation build — expecting, honestly, that early downloads
   may still see a reputation prompt (now with the verified publisher name)
   until reputation accrues.

## 14. Remaining limitations

- No certificate ⇒ no signed artifact ⇒ SmartScreen's real-world behavior
  for a signed SoundControl is untested (§10).
- Until the secrets exist, **every release attempt fails at gate 1** —
  intentional, but it means v1.0.7 cannot ship until a maintainer acts (§13).
- The full unit suite (bridge/E2E/lifecycle) is Linux-only by design
  (`tests.yml`); the release flow therefore runs the Windows-safe suites
  (UI, packaging guard, protocol/TS/whitelist inside the build) plus the
  Windows upgrade smoke — the Linux suites run on the same commit via CI.
- One observed environmental flake of the pre-existing clean-install smoke
  step (passed on identical code in the other rounds) — monitored, unrelated
  to signing.
- Long-term: prefer an HSM/token-backed signing service (SignPath, Azure
  Trusted Signing) over an exportable `.p12` in secrets; the verification
  gate stays identical either way (`docs/WINDOWS-CODE-SIGNING.md` § rotation).

---

**Phase 14 stops here.** No Windows security was bypassed, no SmartScreen
behavior was modified, no fake trust was created; the root cause — unsigned
Windows distribution — is fixed at the pipeline level and **fails closed**
until a real, trusted code-signing certificate is provided.
