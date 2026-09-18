# Publish SoundControl for Windows

SoundControl is published only as a Windows desktop installer. GitHub Pages is not part of the release process; disable any existing Pages site in repository Settings.

## Prerequisites

- A GitHub repository with Actions enabled
- Node.js 22 for local builds
- Windows build runners enabled for the repository

## Create a Windows release

1. Update the version in `package.json`.
2. Commit the version change on `main`.
3. Tag that commit and push the tag:

```bash
git tag vX.Y.Z main
git push origin vX.Y.Z
```

The workflow `.github/workflows/release-windows.yml` will:

- build the Electron renderer and Windows NSIS installer;
- include the bundled Python runtime used by the RFCOMM helper;
- publish one stable asset, `SoundControl-Setup.exe`;
- attach the full build folder as a workflow artifact for maintainers.

The installer link is:

`https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl-Setup.exe`

## Code signing (required for releases)

Releases must be Authenticode-signed — the release workflow fails without
signing credentials and verifies the real generated EXE before publishing, so
an unsigned installer can never be released. Routes to a certificate:

1. **Free:** [SignPath Foundation](https://signpath.org/) signs qualifying
   open-source projects at no cost.
2. **OV cert (~$75–200/yr):** publisher name shows in the dialog; reputation
   builds over days/weeks.
3. **EV cert (~$200–400/yr):** SmartScreen reputation is effectively instant.

To use a `.p12`/`.pfx` you already own:

```bash
openssl base64 -in cert.p12 -out cert.b64 -A
# repository → Settings → Secrets and variables → Actions:
#   WIN_CSC_LINK          = contents of cert.b64
#   WIN_CSC_KEY_PASSWORD  = p12 password
```

The release workflow decodes the certificate into `cert.p12`, hands it to
electron-builder via `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` (SHA-256 +
RFC 3161 timestamping, `forceCodeSigning` enabled), and
`scripts/verify-windows-signing.ps1 -RequireSigned` then verifies the actual
installer — Valid signature, trusted chain (`signtool verify /pa`), publisher
identity (pinned by the `WINDOWS_EXPECTED_PUBLISHER` variable when set),
SHA-256 recorded — before the GitHub Release is published. The cleanup step
deletes `cert.p12` before artifacts are uploaded. Local `npm run build:win`
stays unsigned (development builds are not distributed). Full details:
[docs/WINDOWS-CODE-SIGNING.md](docs/WINDOWS-CODE-SIGNING.md).

Until the `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` secrets exist, every release
attempt fails at the credentials gate — do not cut a release before
configuring them.

## Verify a release

- Confirm the release contains only `SoundControl-Setup.exe`.
- Install it on a clean Windows machine.
- Pair a Soundcore device in **Settings → Bluetooth & devices**.
- Confirm **Add Windows device → Refresh paired devices** lists it.
- Confirm the helper log is written to `%AppData%\soundcontrol\main.log` and
  contains `bridge started via …`.
- Confirm **Diagnostics** decodes a pasted Base64 capture and shows Σ/XOR validity.
