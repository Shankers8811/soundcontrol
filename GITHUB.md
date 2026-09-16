# Put SoundControl on GitHub (Windows desktop only)

This repository publishes one supported product: the SoundControl Windows desktop
installer. The browser application and GitHub Pages deployment have been removed.

## Create or update the repository

1. Create a public GitHub repository named `soundcontrol`.
2. Push the source, including `.github/workflows/`, `package.json`, `src/`, and `public/`.
3. Keep GitHub Pages disabled; there is no public web deployment for this project.
4. Open **Actions** and allow the Windows build workflow if GitHub asks for approval.

## Build locally on Windows

Install Node.js 22 and Python 3.9+ only if you are building the helper from source. Then:

```cmd
npm install
npm run build:win
```

The NSIS installer is written to `release/`. The packaged installer includes its own
Python runtime, so people installing the release do not need Python.

## Publish

Tag the commit on `main` and push the tag:

```bash
git tag vX.Y.Z main
git push origin vX.Y.Z
```

The **Release Windows** workflow builds on `windows-latest` and publishes exactly one
installer asset named `SoundControl-Setup.exe`.

## What the Windows app does

SoundControl uses the bundled local helper to enumerate Bluetooth devices already paired
with Windows, connect through Classic Bluetooth RFCOMM, and expose Soundcore controls.
GitHub hosts the source and release files; it is not used to host or run the app.
