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

## Optional code signing

Without a certificate the installer ships unsigned and SmartScreen shows
"Unknown publisher" — only an Authenticode certificate removes that. Routes:

1. **Free:** [SignPath Foundation](https://signpath.org/) signs qualifying
   open-source projects at no cost.
2. **OV cert (~$75–200/yr):** publisher name shows in the dialog; reputation
   builds over days/weeks.
3. **EV cert (~$200–400/yr):** SmartScreen reputation is instant.

To use a `.p12`/`.pfx` you already own:

```bash
openssl base64 -in cert.p12 -out cert.b64 -A
# repository → Settings → Secrets and variables → Actions:
#   WINDOWS_CERTIFICATE_BASE64   = contents of cert.b64
#   WINDOWS_CERTIFICATE_PASSWORD = p12 password
```

The release workflow then sets `CSC_LINK`/`CSC_KEY_PASSWORD`, electron-builder
signs app + installer, the **"Report Authenticode signature status"** step
prints the signer and fails the release if the signature is not Valid, and the
cleanup step deletes `cert.p12` before artifacts are uploaded. Verify locally
with `Get-AuthenticodeSignature .\SoundControl-Setup.exe`.

## Verify a release

- Confirm the release contains only `SoundControl-Setup.exe`.
- Install it on a clean Windows machine.
- Pair a Soundcore device in **Settings → Bluetooth & devices**.
- Confirm **Add Windows device → Refresh paired devices** lists it.
- Confirm the helper log is written to `%AppData%\soundcontrol\main.log` and
  contains `bridge started via …`.
- Confirm **Diagnostics** decodes a pasted Base64 capture and shows Σ/XOR validity.
