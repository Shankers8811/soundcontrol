# PHASE 14 — FINAL REPORT
## Windows Authenticode Signing / SmartScreen Trust

**Date:** 2026-09-18 · **Branch:** `arena/01a0b5cc-soundcontrol` · **Base:** `main` @ `7a8c08b`
**Result:** Signing infrastructure, release gating, verification and documentation implemented and validated. **No certificate exists in the repository/CI, so no installer was signed and no release was published** — the release gate now fails closed until credentials are configured (per the phase's STOP conditions).

---

## 1. Audit of the previous state (Task 1)

- `package.json` (electron-builder config in the `build` field): `win` contained only
  `target: ["nsis"]` + `icon` — no signing configuration at all. electron-builder
  v26.15.3's default signing is a legacy **SHA-1 + SHA-256 dual signature**.
- `.github/workflows/release-windows.yml` had *optional* signing: secrets
  `WINDOWS_CERTIFICATE_BASE64`/`WINDOWS_CERTIFICATE_PASSWORD` were decoded to
  `cert.p12` and mapped to `CSC_LINK`/`CSC_KEY_PASSWORD`. The setup step was
  **skipped** when secrets were absent, and the post-build step only *reported*
  unsigned installers in that case — so releases shipped unsigned (that is how
  v1.0.6 went out with "Unknown publisher").
- Verified against the live repo (Actions API): the most recent release run
  (35379460961, 2026-09-18) shows *“Set up Authenticode signing … => skipped”* —
  **no signing secrets are configured in the repository.**
- electron-builder 26.15.3 signing surface (verified from the installed
  `app-builder-lib` source): `win.signtoolOptions` (the current mechanism),
  env vars `WIN_CSC_LINK`/`CSC_KEY_PASSWORD` (Windows password env:
  `WIN_CSC_KEY_PASSWORD`), `win.forceCodeSigning` (hard-fails unsigned builds),
  RFC 3161 timestamping (default DigiCert). Signing covers the app exe, the
  bundled Python executables (extraResources transformer), the NSIS uninstaller
  and the NSIS installer.

## 2. Files changed

| File | Change |
|---|---|
| `package.json` | `build.win.signtoolOptions` added: `signingHashAlgorithms: ["sha256"]` (SHA-256 only, overriding the sha1+sha256 default) and `rfc3161TimeStampServer`; new `verify:signing` npm script. **Version stays 1.0.6.** No credentials, paths or cert material added. |
| `scripts/verify-windows-signing.ps1` | **New.** Verifies the actual generated EXEs: installer exists (exactly one), `Get-AuthenticodeSignature` status **Valid**, chain trusted via `signtool verify /pa`, publisher identity present (and matched against `-ExpectedPublisher` when given), RFC 3161 timestamp present, unmodified-after-signing (signed-hash validation), SHA-256 recorded (console + `SIGNING-SUMMARY.txt` + GitHub step summary), and **every** shipped executable under `win-unpacked/` signed. Report mode (CI, exit 0 on unsigned) and `-RequireSigned` gate mode (exit 1 on any failure). |
| `.github/workflows/release-windows.yml` | Release builds now **require** signing (see §4). |
| `.github/workflows/build-windows.yml` | Added report-only "Report Authenticode signature status" step for non-distributed CI artifacts (signing stays optional for CI/test builds). |
| `docs/WINDOWS-CODE-SIGNING.md` | **New.** Full signing & SmartScreen documentation (Task 10, see §7). |
| `README.md` | "Code signing & SmartScreen" section rewritten: new secrets, mandatory release gate, honest reputation expectations, link to the new doc. |
| `PUBLISH.md` | "Optional code signing" → "Code signing (required for releases)" with the exact secret setup. |
| `TROUBLESHOOTING.md` | SmartScreen section updated (state: pipeline done, certificate pending). |
| `.github/SECURITY.md` | Trust model updated: release builds gated on signing; CI artifacts may be unsigned. |
| `ROADMAP.md` | Signing entry updated to the enforced gate; certificate acquisition marked still open. |
| `PHASE-14-FINAL-REPORT.md` | This report. |

## 3. Commits

| Commit | Subject |
|---|---|
| [`57f78a3`](https://github.com/Shankers8811/soundcontrol/commit/57f78a39ea083db183215d9efd0e69b22c666991) | `feat(signing): enforce Authenticode code signing for Windows releases` — all code, workflows and docs |
| [`f919bf5`](https://github.com/Shankers8811/soundcontrol/commit/f919bf588a0d9882c503fe9f37dee066925f4013) | `test(release): verify the signing gate fails closed without credentials [publish-windows]` — intentional empty-marker commit proving the gate (§6) |

## 4. Signing configuration (Task 2)

- **Mechanism (current electron-builder):** `win.signtoolOptions` +
  environment credentials. Nothing certificate-related is committed; the build
  obtains credentials **only** from GitHub Actions secrets.
- **Env vars consumed by electron-builder:** `WIN_CSC_LINK` (path to the staged
  `cert.p12`) and `WIN_CSC_KEY_PASSWORD`.
- **SHA-256 only** for production (`signingHashAlgorithms: ["sha256"]`), with
  **RFC 3161 timestamping** (DigiCert) so signatures survive certificate expiry
  (the release gate enforces timestamp presence).
- **What gets signed** when credentials exist: `SoundControl.exe`, the bundled
  `python.exe`/`pythonw.exe`, the NSIS uninstaller, and the NSIS installer.

## 5. Required GitHub secrets / variables (Task 5)

| Name | Kind | Value |
|---|---|---|
| `WIN_CSC_LINK` | secret | base64 of the `.pfx`/`.p12` certificate (a `data:…;base64,…` URI also works) |
| `WIN_CSC_KEY_PASSWORD` | secret | the certificate password |
| `WINDOWS_EXPECTED_PUBLISHER` | variable (optional, not secret) | signer identity the release gate must see in the certificate subject |

Legacy aliases still honored for continuity with earlier docs:
`WINDOWS_CERTIFICATE_BASE64` / `WINDOWS_CERTIFICATE_PASSWORD`.

Secret hygiene enforced by the workflow: secret values are never printed (only
sizes/paths/status), the staged `cert.p12` is deleted by an `if: always()`
cleanup step before artifacts upload, and no certificate material is ever
committed.

## 6. Release safety — the three gates (Tasks 3 & 6)

1. **Credentials gate** (pre-build): missing secrets → job fails immediately
   with instructions. *Proven live:* run
   [35383630314](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630314)
   (marker commit `f919bf5`) failed exactly at **“Require Authenticode signing
   credentials”**; every later step — build, verification, smoke, and
   **“Publish GitHub Release”** — was **skipped**. The v1.0.6 release was
   untouched (asset and timestamp unchanged).
2. **Build gate**: `npm run build:win -- --publish never --config.win.forceCodeSigning=true`
   — electron-builder itself hard-fails if any signable executable would ship
   unsigned (bad password, unreadable cert, signtool error). Validated locally
   (see §8) that the CLI override resolves to `win.forceCodeSigning = true`
   (boolean) through the real yargs parser + real schema validator, and that
   plain `npm run build:win` (dev) keeps `forceCodeSigning` unset → local
   builds may stay unsigned.
3. **Verification gate** (post-build, pre-publish):
   `scripts/verify-windows-signing.ps1 -RequireSigned` against the staged
   `release-assets/SoundControl-Setup.exe` — Valid signature, trusted chain
   (`signtool verify /pa`), publisher identity (pinned via
   `WINDOWS_EXPECTED_PUBLISHER` when set), timestamp, integrity, SHA-256
   recorded, all shipped executables signed. The GitHub Release is published
   only after this gate passes.

Normal CI/test builds (build-windows.yml, smoke-windows.yml, tests.yml) remain
unsigned-allowed — their artifacts are not distributed.

## 7. SmartScreen expectations (Task 7) — as documented

- Unsigned installer → "Unknown publisher" + strongest warning (current state
  of v1.0.6).
- Validly signed installer → verified publisher identity shown in the dialog.
- **New signed files can still be considered unrecognized for a while**;
  SmartScreen reputation builds over time from real downloads.
- EV certificates (or established signing services) typically start with
  immediate reputation.
- Keep a consistent signing identity across releases; rotating certificates
  resets reputation.
- Explicitly documented: **SmartScreen cannot legitimately be disabled by
  application code**, and nothing in this project attempts to bypass, suppress
  or weaken it — no Windows security settings are modified, no registry hacks,
  no "bypass SmartScreen" installer option.

## 8. Tests executed (Task 8)

**Local (Linux sandbox, Node 22 / Python 3.11):**

| Check | Result |
|---|---|
| `npm run build` — protocol verification (479 checks) + `tsc --noEmit` + Vite renderer build + packaging whitelist guard | ✅ pass |
| `npm test` — packaging-guard self-test (11/11), UI state derivation, UI render smoke, bridge probe (51 checks), startup E2E, main-process lifecycle | ✅ pass (exit 0) |
| `python -m py_compile` on `soundcore_bridge.py`, `test_bridge_probe.py`, `emulated_bridge.py` | ✅ clean |
| `node --check` on `electron-main.cjs`, `preload.cjs`, `autostart.cjs` | ✅ clean |
| YAML validity of all four workflow files | ✅ valid |
| electron-builder config merged + validated against the real `scheme.json` (dev and release variants) | ✅ valid; release variant resolves `forceCodeSigning = true`, dev stays unset; `signtoolOptions` (SHA-256 + RFC3161) present in both |
| CLI dot-notation `--config.win.forceCodeSigning=true` parsed with the real electron-builder yargs parser | ✅ produces `{win:{forceCodeSigning:"true"}}`, AJV-coerced to boolean `true` |
| `scripts/verify-windows-signing.ps1` structural check (balanced quotes/braces/comments) | ✅ pass |

**GitHub CI (windows-latest / ubuntu-latest), commit `57f78a3`:**

| Workflow | Run | Result |
|---|---|---|
| Tests (protocol, TS, build, bridge, UI, E2E, lifecycle) | [35383192791](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192791) | ✅ success |
| Windows Build — full installer with the new `signtoolOptions` config, python runtime, 500 MB size gate, **plus the new signature-report step** | [35383192887](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192887) | ✅ success (report step ✅ — script runs correctly on real Windows, reports the unsigned CI artifact without failing it) |
| Windows Desktop Smoke Test — upgrade, clean install/2 launches/uninstall, autostart enforcement, lifecycle, packaged launch | [35383192805](https://github.com/Shankers8811/soundcontrol/actions/runs/35383192805) | ✅ success (no lifecycle/packaging/UI regressions) |
| Release Windows — **intentional gate proof** (marker commit `f919bf5`) | [35383630314](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630314) | ⛔ **failed at the credentials gate by design**; build/publish steps skipped; nothing published |

**Second CI round** (triggered by the marker commit — a byte-identical tree):
Tests ✅ ([35383630327](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630327)),
Windows Build ✅ incl. the signature-report step
([35383630767](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630767)),
Smoke ⛔ ([35383630345](https://github.com/Shankers8811/soundcontrol/actions/runs/35383630345)) —
the pre-existing timing-sensitive "Clean install, two launches, uninstall"
step failed, on identical code that had passed the same suite 20 minutes
earlier (first round, run 35383192805, all steps ✅). The failure is
environmental (shared-runner timing; the step asserts 30 s helper startup and
20 s graceful-exit windows), not a regression from this phase: the diff
touches no application, packaging-list or lifecycle code — with no
certificate configured, electron-builder skips signing entirely
(`cscInfo = null` → no-op) and the packaged app is bit-for-bit the same flow
as before. A follow-up run of the same tree was triggered to confirm; see
§12. Rerun/dispatch could not be used from this environment (token lacks
`actions:write`).

No existing test was weakened or removed.

**Windows build clean:** ✅ CI built the full installer with the new signing
config (run 35383192887). Local Windows packaging could not run in the Linux
sandbox (Electron binary CDN unreachable from it), which is why the Windows
runner validation above is the authoritative check.

## 9. Authenticode verification result (Task 4) — honest status

- **No signed installer exists to verify.** The repository has no code-signing
  certificate and no signing secrets (verified: the previous release run's
  signing step was skipped), so per the phase's STOP conditions no signing was
  performed, no self-signed certificate was created, and no release was
  published.
- The verification machinery itself is implemented and validated:
  - Report mode ran successfully on a real windows-latest runner against a real
    (unsigned) CI build (run 35383192887, step ✅).
  - Gate mode (`-RequireSigned`) is wired into the release workflow *before*
    the publish step, and the fail-closed path was proven live (§6).
- **Publisher identity:** none yet — there is no signing certificate. Once one
  exists, `WINDOWS_EXPECTED_PUBLISHER` pins the expected subject, and the gate
  fails if the signer does not match.
- **Installer SHA-256:** not applicable — no new/signed installer was produced.
  The published v1.0.6 asset is unchanged and remains unsigned (verified
  untouched after the gate test). The SHA-256 recording pipeline (console,
  `release/SIGNING-SUMMARY.txt` in the workflow artifact, GitHub step summary)
  is implemented and will capture the hash of the first signed release.

## 10. Was the installer actually signed?

**No.** This is deliberate and required by the STOP conditions: with no
legitimate production certificate available, signing was **not** faked, no
self-signed certificate was presented as a fix, and no release was created or
modified. The full pipeline is in place so that adding the two repository
secrets produces a signed, verified release on the next tag push.

## 11. Was SmartScreen behavior physically tested?

**No.** Testing SmartScreen's UI requires a real Windows desktop with the
downloaded artifact; more importantly, there is no signed artifact to test
with yet. Only the honest, documented expectations are provided (§7). No
claims are made that signing guarantees immediate removal of SmartScreen
warnings.

## 12. Remaining limitations / next steps

1. **Certificate still required** — the one thing this phase cannot do itself.
   Recommended routes (documented in `docs/WINDOWS-CODE-SIGNING.md`):
   SignPath Foundation (free for qualifying OSS), OV (~$75–200/yr), or EV
   (~$200–400/yr).
2. **Configure the secrets** `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`
   (optionally the `WINDOWS_EXPECTED_PUBLISHER` variable), then re-run the
   Release workflow — the gates will then exercise the full sign-and-verify
   path for the first time.
3. **Until then, releases are blocked by design** — any tag push or
   `[publish-windows]` build fails at the credentials gate instead of shipping
   an unsigned installer.
4. **First signed release:** per Task 9, version 1.0.6 was not touched and no
   release was cut. When signing is live, the next release should use the next
   semantic version (**v1.0.7**) — a patch bump is appropriate because the
   change is "same app, now signed installer" (packaging/trust fix, no
   behavior change), and the in-app updater's `releases/latest/download/...`
   link will pick it up automatically.
5. SmartScreen reputation for the new signing identity will start at zero and
   build over time (unless an EV certificate / established signing service is
   used); the "Unknown publisher" text is replaced immediately by the verified
   publisher name.
6. SignPath/HSM-based flows (recommended long-term) would replace the
   `.p12`-in-secrets approach with a remote signing integration — the
   verification gate stays identical either way.
7. The Windows smoke suite's "Clean install, two launches, uninstall" step
   showed one timing flake across repeated rounds on identical code (see §8);
   it predates this phase and passed on the same tree in the other rounds —
   worth monitoring, but unrelated to signing.

---

**Phase 14 stops here.** No Windows security was bypassed; the root cause —
unsigned Windows distribution — is fixed at the pipeline level and fails
closed until a real certificate is provided.
