# Put SoundControl on GitHub (Windows/Linux desktop)

This repository publishes the SoundControl Windows and Linux desktop application.
The browser application and GitHub Pages deployment have been removed.

## Create or update the repository

1. Create a public GitHub repository named `soundcontrol`.
2. Push the source, including `.github/workflows/`, `package.json`, `src/`, and `public/`.
3. Keep GitHub Pages disabled; there is no public web deployment for this project.
4. Open **Actions** and allow the desktop build workflows if GitHub asks for approval.

## Build locally on Windows or Linux

Install Node.js 22. Build hosts need Python 3 to stage the bridge runtime; downloaded Windows and
Linux packages bundle that runtime, so end users do not install Python or Node. Linux still needs
BlueZ (`bluetoothd` and `bluetoothctl`). Then:

```bash
npm install
# Windows:
npm run build:win
# Linux:
npm run build:linux
```

Windows writes an NSIS installer to `release/`; Linux writes AppImage and Debian packages.
Both packaged Windows and Linux builds include their own Python bridge runtime; Linux uses the
host's BlueZ Bluetooth stack.

## Publish

Tag the commit on `main` and push the tag:

```bash
git tag vX.Y.Z main
git push origin vX.Y.Z
```

The **Release Windows** workflow builds on `windows-latest` and publishes the Windows
installer asset named `SoundControl-Setup.exe`. The **Release Linux** workflow builds on
`ubuntu-22.04` and publishes the AppImage and `.deb` assets from the same GitHub Release.
Both workflows verify that their packaged Python bridge runtime is present before publishing.

## What the desktop app does

SoundControl uses a local helper to enumerate Bluetooth devices already paired with the host
(Windows PnP or Linux BlueZ), connect through Classic Bluetooth RFCOMM, and expose Soundcore
controls. Liveness uses `/health`; `/scan` is the slower cached host enumeration. Android BLE
captures are decode-only references (`src/protocol/ble.ts`, PROTOCOL.md appendix) — the app
never uses Web Bluetooth.
GitHub hosts the source and release files; it is not used to host or run the app.
