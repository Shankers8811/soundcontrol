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

Add these repository secrets before tagging a release:

- `WINDOWS_CERTIFICATE_BASE64` — base64 contents of a `.p12` or `.pfx` certificate
- `WINDOWS_CERTIFICATE_PASSWORD` — certificate password

Without them, Windows SmartScreen may show an unknown-publisher warning. The workflow
never stores the certificate in the release artifact.

## Verify a release

- Confirm the release contains only `SoundControl-Setup.exe`.
- Install it on a clean Windows machine.
- Pair a Soundcore device in **Settings → Bluetooth & devices**.
- Confirm **Add Windows device → Refresh paired devices** lists it.
- Confirm the helper log is written to `%AppData%\soundcontrol\main.log` and
  contains `bridge started via …`.
- Confirm **Diagnostics** decodes a pasted Base64 capture and shows Σ/XOR validity.
