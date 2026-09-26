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

## The asset name is a contract — keep it exact

That link only resolves if the release carries an asset named **exactly**
`SoundControl-Setup.exe`. The name is hard-coded in three places:

| Consumer | Location |
|---|---|
| In-app download button | `src/lib/downloads.ts` → `WINDOWS_DOWNLOAD_URL` |
| README download badge/link | `README.md` |
| This document | `PUBLISH.md` |

Any other name — electron-builder's default `SoundControl Setup 1.0.7.exe`, a
dot-separated `SoundControl.Setup.1.0.7.exe`, or anything hand-uploaded —
makes the URL return **404** and silently breaks the download button for every
installed client, while the release page itself still looks fine.

The release workflow therefore ends with a **"Verify the canonical installer
asset name"** step that fails the run if the published release does not expose
`SoundControl-Setup.exe`.

### Repairing a release whose asset has the wrong name

Run the **Repair release installer asset name** workflow
(`.github/workflows/repair-release-asset-name.yml`) — Actions → that workflow →
*Run workflow*:

| Input | Meaning |
|---|---|
| `tag` | the release to fix, e.g. `v1.0.7` |
| `dry_run` | report what would change, upload nothing |
| `remove_mismatched_exe` | also delete the other `.exe` assets, leaving only the canonical one |

It copies the already-published installer to the canonical name and verifies
the stable link resolves. It **never modifies the bytes** — it validates that
the asset really is a Windows PE/NSIS installer, records its SHA-256, and
reports its Authenticode status honestly. It builds nothing and cannot publish
a *new* installer: only `release-windows.yml`, with its signing gates, does
that. If a release has several candidate installers it refuses to guess and
fails instead.

Equivalent by hand, if you prefer:

```bash
gh release download v1.0.7 --pattern '*.exe' --dir /tmp/sc
mv "/tmp/sc/SoundControl.Setup.1.0.7.exe" /tmp/sc/SoundControl-Setup.exe
gh release upload v1.0.7 /tmp/sc/SoundControl-Setup.exe --clobber
# confirm the stable link now resolves:
curl -sS -o /dev/null -w '%{http_code}\n' -L -r 0-0 \
  https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl-Setup.exe
```

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
- Confirm the stable download link resolves (must be `200`/`206`, not `404`):

  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' -L -r 0-0 \
    https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl-Setup.exe
  ```

  A `404` here means the asset is mis-named — run the repair workflow above.
- Install it on a clean Windows machine.
- Pair a Soundcore device in **Settings → Bluetooth & devices**.
- Confirm **Add Windows device → Refresh paired devices** lists it.
- Confirm the helper log is written to `%AppData%\soundcontrol\main.log` and
  contains `bridge started via …`.
- Confirm **Diagnostics** decodes a pasted Base64 capture and shows Σ/XOR validity.
