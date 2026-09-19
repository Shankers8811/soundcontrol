# Windows code signing & SmartScreen — SoundControl

This document explains why the SoundControl installer can trigger the
Microsoft Defender SmartScreen prompt ("Windows protected your PC … Publisher:
Unknown publisher"), how the project's Authenticode signing pipeline works,
which credentials it needs, and what signing honestly does and does not
change.

> **SoundControl does not bypass Microsoft Defender SmartScreen.** Nothing in
> SoundControl, its installer, or its build scripts weakens, patches,
> suppresses, or works around Microsoft Defender SmartScreen or any other
> Windows security feature — no settings changes, no registry edits, no
> Group Policy changes, no Mark-of-the-Web manipulation, and no instructions
> for users to disable security warnings. The only legitimate fix for
> "Unknown publisher" is to distribute a properly signed installer from a
> consistent publisher identity — which is what this pipeline implements.
> Any prompt that remains after that is Microsoft's reputation system working
> as designed (see [SmartScreen reputation expectations](#smartscreen-reputation-expectations)).

## Why SmartScreen appears

When Windows downloads an executable installer, SmartScreen checks two things
before letting it run normally:

1. **Is the file Authenticode-signed, and does the signature chain to a
   certificate authority Windows trusts?**
2. **Does the file (or its signing identity) have established download
   reputation?**

The current released installer (v1.0.6) is **unsigned**. An unsigned file
downloaded from the internet carries no cryptographic publisher identity, so
Windows cannot tell who produced it and marks it "unrecognized". The result is
the full warning dialog with **"Publisher: Unknown publisher"**. That is not a
virus detection — it is the absence of proof of origin. Nothing about the app's
behavior causes it.

## Why unsigned installers show "Unknown publisher"

The "Publisher" line in the SmartScreen dialog is read directly from the
file's Authenticode signature. No signature → no publisher → "Unknown
publisher" plus the strongest form of the prompt. Signing the exact same bytes
with a trusted certificate changes that line to the certificate's subject
(e.g. "CN=Example Publisher, O=Example Ltd, C=US"), which is also what users
see in the UAC dialog and in the file's Properties → Digital Signatures tab.

## How SoundControl signing works

Signing is implemented with **electron-builder's current Windows signing
mechanism** (`win.signtoolOptions` in `package.json` plus the `WIN_CSC_LINK` /
`WIN_CSC_KEY_PASSWORD` environment variables). No certificate or password is
ever committed to the repository — credentials exist only as GitHub Actions
secrets and are consumed at build time.

```json
"win": {
  "signtoolOptions": {
    "signingHashAlgorithms": ["sha256"],
    "rfc3161TimeStampServer": "http://timestamp.digicert.com"
  }
}
```

* **SHA-256 only.** electron-builder's default is a legacy SHA-1 + SHA-256
  dual signature; SoundControl pins `signingHashAlgorithms` to `["sha256"]`
  for production.
* **RFC 3161 timestamping.** Each signature is timestamped by an independent
  timestamp authority, so it remains valid after the certificate itself
  expires. The release gate enforces that the timestamp is present.
* **What gets signed.** With credentials present, electron-builder signs:
  the main `SoundControl.exe`, the bundled Python runtime executables
  (`python.exe`, `pythonw.exe` in `resources/python`), the NSIS
  **uninstaller** embedded in the installer, and the **NSIS installer**
  itself.

### The release pipeline (`.github/workflows/release-windows.yml`)

A production Windows release can never silently fall back to an unsigned
installer. Three gates enforce that:

1. **Credentials gate (before the build).** If `WIN_CSC_LINK` or
   `WIN_CSC_KEY_PASSWORD` secrets are missing, the job fails immediately with
   instructions — it does not build an unsigned installer.
2. **Build gate (inside electron-builder).** The release build passes
   `--config.win.forceCodeSigning=true`, so electron-builder itself fails the
   build if any signable executable would end up unsigned (wrong password,
   unreadable certificate, signtool failure).
3. **Verification gate (after the build, before publishing).**
   `scripts/verify-windows-signing.ps1 -RequireSigned` verifies the **actual
   generated EXE** — never a certificate file:
   * the installer exists (`release-assets/SoundControl-Setup.exe`);
   * `Get-AuthenticodeSignature` reports **Valid**;
   * `signtool verify /pa` trusts the full certificate chain;
   * the signer subject (publisher identity) is present and, when the
     repository variable `WINDOWS_EXPECTED_PUBLISHER` is set, matches it;
   * an RFC 3161 timestamp is present;
   * the file matches its signed hash (not modified after signing);
   * the installer's SHA-256 is recorded (console,
     `release/SIGNING-SUMMARY.txt` in the workflow artifact, and the GitHub
     Actions step summary);
   * every executable in `release/win-unpacked/` is signed and Valid.

   The GitHub Release is published **only after this gate passes**.

### Required GitHub secrets

Settings → Secrets and variables → Actions:

| Secret | Value | Notes |
|---|---|---|
| `WIN_CSC_LINK` | base64 of the `.pfx`/`.p12` certificate file | the documented form; a `data:…;base64,…` URI also works |
| `WIN_CSC_KEY_PASSWORD` | the certificate's password | |

Legacy names from earlier phases (`WINDOWS_CERTIFICATE_BASE64`,
`WINDOWS_CERTIFICATE_PASSWORD`) are still honored as aliases, but
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` are the canonical names.

Optional repository **variable** (not a secret — it is not sensitive):

| Variable | Value |
|---|---|
| `WINDOWS_EXPECTED_PUBLISHER` | text that must appear in the signing certificate's subject (e.g. your publisher name). When set, the release gate fails if the signer identity does not match. |

**Secret hygiene** (enforced by the workflow):

* Secret values are never printed into CI logs; only sizes, paths and status
  lines are logged.
* The decoded `cert.p12` is written to the runner's workspace only, and a
  cleanup step (`if: always()`) deletes it before artifacts are uploaded.
* Never commit `.pfx`/`.p12` files, private keys, passwords, or base64 of any
  of them to this repository. CI reads them exclusively from GitHub Actions
  secrets.

### Certificate requirements

The certificate must be a **code signing certificate issued by a CA whose
root is in the Microsoft trusted root program** (Sectigo, DigiCert, GlobalSign,
SSL.com, …). Three realistic routes, cheapest first:

1. **Free — [SignPath Foundation](https://signpath.org/)** for qualifying
   open-source projects (certificate stays in their HSM; the workflow would be
   adapted to SignPath's signing action instead of a `.p12` secret).
2. **OV (Organization Validation) certificate**, roughly $75–200/yr — the
   publisher name shows in the SmartScreen dialog; reputation builds over
   days to weeks of downloads.
3. **EV (Extended Validation) certificate**, roughly $200–400/yr — hardware
   token or cloud HSM; SmartScreen reputation is effectively immediate.

Self-signed certificates are **not** a solution: they produce a signature
Windows does not trust ("Unknown publisher" with an untrusted-chain warning on
top). This project will not ship a self-signed release.

**Keep the same identity across releases.** SmartScreen reputation accrues to
the signing certificate/publisher identity. Rotating certificates discards
accumulated reputation, so renew with the same publisher (and ideally the same
CA) rather than switching.

## Local development behavior

`npm run build:win` on a developer machine is a **development build**: no
credentials are required and the result may be unsigned. That is fine — dev
builds are not distributed. The `win.signtoolOptions` block in `package.json`
only takes effect when a certificate is available; without one, electron-builder
skips signing for local builds exactly as before.

To produce a **signed** build locally (Windows, with a `.pfx`/`.p12` on disk):

```powershell
$env:WIN_CSC_LINK = "C:\path\to\cert.p12"          # or the base64 / data: URI form
$env:WIN_CSC_KEY_PASSWORD = "the certificate password"
npm run build:win -- --publish never --config.win.forceCodeSigning=true
```

`--config.win.forceCodeSigning=true` is what the release workflow uses to make
"would be unsigned" a hard failure; omit it for a plain unsigned dev build.

## Release behavior

* Tag pushes (`git tag vX.Y.Z main && git push origin vX.Y.Z`) and
  `[publish-windows]` marker builds run the release workflow with **signing
  required**. Without valid signing secrets the job fails before building.
* Normal CI builds (`.github/workflows/build-windows.yml`) and Windows smoke
  tests keep working unsigned — their artifacts are not distributed. They run
  the same verifier in report mode, which records the signature status in the
  run log without failing.
* **A release is only published after the verification gate passes.** No
  step in the release workflow can publish an unsigned or tampered installer.

## Verification commands

After any build (or on a downloaded `SoundControl-Setup.exe`), verify the real
file on Windows:

```powershell
# Full automated verification used by CI (report mode)
./scripts/verify-windows-signing.ps1
# (same thing via npm)
npm run verify:signing

# ...as a hard gate, exactly like the release workflow
./scripts/verify-windows-signing.ps1 -InstallerPath .\SoundControl-Setup.exe -RequireSigned

# Manual checks
Get-AuthenticodeSignature .\SoundControl-Setup.exe | Format-List Status, StatusMessage, `
  @{l='Publisher';e={$_.SignerCertificate.Subject}}, TimeStamperCertificate
Get-FileHash .\SoundControl-Setup.exe -Algorithm SHA256

# Chain trust against the default Authenticode policy (Windows SDK)
signtool verify /pa SoundControl-Setup.exe
```

Expect `Status : Valid`, a non-empty signer subject, a **currently valid
certificate** (the gate also fails on an expired or not-yet-valid signer), a
present `TimeStamperCertificate`, and — when
`WINDOWS_EXPECTED_PUBLISHER` is configured — a signer subject matching it.
`signtool verify /pa` must exit 0. If any of those fail, the artifact must
not be released.

## When signing credentials are unavailable

This is the current state of the repository: **no code-signing certificate is
configured yet**, so:

* **No release can be published.** The release workflow's credentials gate
  fails every tag build and `[publish-windows]` build before anything is
  compiled or published. That is deliberate — an unsigned "Unknown publisher"
  release is exactly the problem this pipeline exists to prevent.
* **Normal development is unaffected.** Local `npm run build:win` and CI
  builds/tests/smoke runs keep working unsigned; their artifacts are not
  distributed.
* To enable signed releases: obtain a certificate (routes above), then set the
  `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` repository secrets (and ideally
  the `WINDOWS_EXPECTED_PUBLISHER` variable), then tag the next release. The
  gates then exercise the full sign-and-verify path for the first time.
* Do **not** work around the block by removing the gates, faking a
  verification result, or shipping a self-signed certificate: a self-signed
  signature is untrusted and still shows "Unknown publisher", now with an
  extra untrusted-publisher warning. The block is the system working.

## Rotating / renewing the certificate safely

* **Renew with the same publisher identity.** SmartScreen reputation accrues
  to the signing identity; a different subject (or a different legal entity
  name) starts reputation from zero. Renew the existing certificate with the
  same CA-validated organization/common name.
* **Renew before expiry.** The release gate fails on an expired signer
  certificate. RFC 3161 timestamping keeps *already-released* installers
  valid after expiry, but new builds need a current certificate.
* **Update the secrets, nothing else.** Replace the `WIN_CSC_LINK` secret
  value with the new certificate's base64 (and the password secret if it
  changed). No workflow or source changes are needed. If the new certificate
  carries a different subject, update `WINDOWS_EXPECTED_PUBLISHER` to match —
  the gate will otherwise (correctly) refuse to publish.
* **Revoke and reissue on suspected compromise** — do not simply rotate. If
  the private key or password may have leaked, revoke the certificate with
  the CA immediately, then reissue and update the secrets. Anyone with the
  `.p12` + password can sign malware as this project's publisher.
* **Prefer non-exportable keys** when the renewal offers them (token, HSM, or
  a cloud signing service): then there is no `.p12` blob to leak, and this
  workflow's file-based staging gets replaced by the provider's integration
  while the verification gate stays identical.
* Never commit the old/new certificate, key or password anywhere — including
  tickets, forks or the final report of a phase.

## SmartScreen reputation expectations

Signing fixes the **identity** problem, not instantly the **reputation**
problem. Honest expectations:

* **Unsigned installer** → "Unknown publisher" and the strongest warning.
* **Validly signed installer** → verified publisher identity is shown; the
  dialog (if any) names the publisher.
* **New signed files can still be considered "unrecognized"** for a while —
  SmartScreen reputation builds over time from downloads by real users.
* An **EV certificate** (or a signing service with established reputation,
  e.g. SignPath) typically starts with immediate reputation.
* **Consistent signing identity across releases** lets reputation accumulate;
  switching certificates resets it.

So: after signing is configured, the first signed release may still show a
reputation prompt — but with the verified publisher name instead of "Unknown
publisher", and it fades as downloads accrue. Nobody can promise an instant
SmartScreen bypass, and any claim otherwise should be treated with suspicion.

## Security precautions for private keys

* The private key lives **only** in GitHub Actions secrets (as an encrypted
  `.p12`) or, better, in an HSM/token-backed service (SignPath, Azure Trusted
  Signing, a CA's cloud signing) — never in the repository, never on a
  shared machine, never in chat, issues or logs.
* Restrict who can change repository secrets and workflows (maintainers only);
  a leaked `WIN_CSC_LINK` + password pair lets anyone sign malware as this
  project's publisher.
* If the certificate or its password may have been exposed: revoke the
  certificate with the CA immediately and reissue.
* Prefer certificates on hardware tokens or in cloud HSMs where the CA
  offers them; exportable `.p12` files are a compromise for CI convenience.
* The workflow deletes the staged certificate (`cert.p12`) with
  `if: always()` and never uploads it as an artifact.
