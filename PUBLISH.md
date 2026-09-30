# Publish SoundControl for Windows and Linux

SoundControl is distributed as a Windows NSIS installer and Linux desktop
packages. GitHub Pages is not part of the release process; disable any existing
Pages site in repository Settings.

The Windows and Linux release workflows publish assets to the same GitHub
Release for a version tag. The Linux workflow is the authoritative producer of
the AppImage and Debian package: do not announce or link to Linux artifacts as
available until that workflow has completed its build, verification, and upload
steps.

## Prerequisites

- A GitHub repository with Actions enabled and `contents: write` available to
  the release workflows.
- Node.js 22 for local checks and versioning.
- A configured Windows Authenticode certificate for a Windows release; see
  [Code signing (required for releases)](#code-signing-required-for-releases).
- No Python or Node.js installation is required on an end user's machine. The
  packaged applications carry Electron and the bridge's Python runtime.

## Create a versioned release

1. Update the version in both `package.json` and `package-lock.json` (for
   example, `npm version X.Y.Z --no-git-tag-version`).
2. Run the required checks locally when the platform permits them:

   ```bash
   npm test
   npm run verify:protocol
   npm run build
   npm run stage:linux-python
   git diff --check
   ```

   A local Linux AppImage/DEB build additionally needs the Electron Builder
   downloads and packaging dependencies. If the local environment cannot reach
   those downloads, leave Linux artifact production to GitHub Actions; do not
   claim that a Linux package was generated locally.
3. Commit the version change on the release branch, merge it through the
   repository's normal review process, and tag that commit:

   ```bash
   git tag vX.Y.Z main
   git push origin vX.Y.Z
   ```

The tag starts both release workflows. They may create the GitHub Release in
either order and then attach their platform assets to it. To rebuild an
existing tag, use **Actions → Release Windows** or **Actions → Release Linux**
with the tag and, when needed, an explicit source ref.

## Windows release

The workflow `.github/workflows/release-windows.yml` runs on
`windows-latest` and:

- installs dependencies with `npm ci`;
- runs the Windows-safe renderer and packaging tests;
- builds the signed NSIS installer with the bundled Python runtime;
- verifies the real generated installer and its Authenticode signatures; and
- stages and uploads exactly one stable installer asset:
  `SoundControl-Setup.exe`.

The stable Windows download URL is:

`https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl-Setup.exe`

The workflow also retains the complete build directory as a workflow artifact
for maintainers. The installer is only published after all signing and upgrade
smoke-test gates pass.

## Linux release

The workflow `.github/workflows/release-linux.yml` runs on the network-capable
`ubuntu-22.04` GitHub-hosted runner. It:

1. uses the supported Python 3 runtime supplied by Ubuntu and installs Node.js 22, then runs `npm ci`;
2. runs the full `npm test` suite;
3. stages the relocated Python interpreter and standard library with
   `npm run stage:linux-python`;
4. runs `npm run build:linux -- --publish never`, which builds both the
   Electron Builder `AppImage` and `deb` targets and retains the Linux Python
   runtime inside the app;
5. fails unless a non-empty `.AppImage` and a non-empty `.deb` are present and
   the packaged Python Bluetooth probe succeeds; and
6. uploads both stable aliases and the original electron-builder output names
   to the GitHub Release.

The stable Linux assets are:

- `SoundControl.AppImage` — direct download for Linux desktops;
- `SoundControl.deb` — direct download for Debian and Ubuntu.

The original version/architecture-named files are uploaded as well, so the
architecture information emitted by Electron Builder is not discarded. The
current Ubuntu runner produces the x64 AppImage and amd64 Debian package.

Stable URLs used by the project page:

- `https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl.AppImage`
- `https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl.deb`

Linux packages use the host's BlueZ stack. A Linux user still needs a working
Bluetooth adapter, `bluetoothd`, and `bluetoothctl`; Python and Node.js are
bundled and do not need to be installed separately.

## Code signing (required for releases)

Releases must be Authenticode-signed — the release workflow fails without
signing credentials and verifies the real generated EXE before publishing, so
an unsigned installer cannot be released. Routes to a certificate:

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
installer — valid signature, trusted chain (`signtool verify /pa`), publisher
identity (pinned by the `WINDOWS_EXPECTED_PUBLISHER` variable when set), and
recorded SHA-256 — before the GitHub Release is published. The cleanup step
deletes `cert.p12` before artifacts are uploaded. Local `npm run build:win`
stays unsigned; development builds are not distributed. Full details:
[docs/WINDOWS-CODE-SIGNING.md](docs/WINDOWS-CODE-SIGNING.md).

Until the `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` secrets exist, every Windows
release attempt fails at the credentials gate. Do not cut a Windows release
before configuring them.

## Verify a release

After both workflows complete, open the GitHub Release and confirm that it has
at least these direct-download assets:

- `SoundControl-Setup.exe`;
- `SoundControl.AppImage`; and
- `SoundControl.deb`.

The Linux release should also show the version/architecture-named AppImage and
Debian files. Confirm the **[Releases page](https://github.com/Shankers8811/soundcontrol/releases)**
contains the release notes and all expected assets before sharing the README
links. Then, where hardware is available:

- install the Windows installer on a clean Windows machine and confirm the
  bundled Python helper starts;
- install or run the Linux package on a host with BlueZ and confirm the bridge
  starts; and
- pair a Soundcore device in the host Bluetooth settings, then confirm
  **Devices → Refresh paired devices** lists it.

CI package checks are not physical Soundcore hardware validation. If no
hardware or suitable Linux host is available, report that limitation rather
than claiming a hardware test passed.
