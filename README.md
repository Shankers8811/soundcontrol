# SoundControl — Windows & Linux Desktop Companion

<p align="center">
  <img src="public/icon-512.png" width="128" height="128" alt="SoundControl">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Windows%20%2F%20Linux%20App-Electron%20%7C%20Bluetooth-0084ff" alt="Windows and Linux app">
  <a href="https://github.com/Shankers8811/soundcontrol/releases/latest"><img src="https://img.shields.io/github/v/release/Shankers8811/soundcontrol?label=latest%20release&color=0084ff" alt="Latest release"></a>
  <a href="https://github.com/Shankers8811/soundcontrol/actions/workflows/build-windows.yml"><img src="https://github.com/Shankers8811/soundcontrol/actions/workflows/build-windows.yml/badge.svg?branch=main" alt="Windows build"></a>
</p>

---

## Windows & Linux Desktop App

**⬇️ Direct downloads (recommended) — no build required:**

### 🪟 Windows

**Windows installer (`SoundControl-Setup.exe`): not attached to the latest release.** [Check the release assets](https://github.com/Shankers8811/soundcontrol/releases/latest) for a signed Windows installer when available.

When available, the Windows download is an NSIS installer with Start-menu and desktop shortcuts. Release builds are gated on Authenticode signing; the current latest release has no Windows installer. It ships its own Bluetooth runtime; users do not need Python or Node.js.

### 🐧 Linux AppImage

[**Download the latest `SoundControl.AppImage`**](https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl.AppImage)

On a Linux desktop with a working BlueZ adapter, `bluetoothd`, and `bluetoothctl`:

```bash
chmod +x SoundControl.AppImage
./SoundControl.AppImage
```

### 📦 Debian / Ubuntu

[**Download the latest `SoundControl.deb`**](https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl.deb)

On Debian or Ubuntu, install the downloaded file with `sudo apt install ./SoundControl.deb`
(or use your package installer), then launch SoundControl from the application menu.
It bundles Electron and the Python bridge runtime; the host still supplies the BlueZ Bluetooth stack.

### 🔗 Release history

[**View all releases and release notes**](https://github.com/Shankers8811/soundcontrol/releases)

The Linux release also keeps electron-builder's version/architecture-named files attached to each release; the stable aliases above are provided for direct latest-release links. If the latest existing release predates Linux packaging, use the releases page to choose a release that contains the Linux assets.

- Release links are built into the app under **Settings → About**.
- Windows releases are required to pass Authenticode signing before publication. If no signed Windows installer is attached to the latest release yet, use the releases page for the current available assets.
- **Lifecycle is deliberately boring:** SoundControl starts only when you launch it (it never
  registers a Windows startup entry, and a startup entry left by an older version is removed at
  launch), and closing the window exits completely — the Bluetooth helper is terminated, port
  8765 is released, and nothing keeps running in the tray or background. There is no
  launch-at-login or minimize-to-tray setting by design; obsolete entries in an old
  `%AppData%\soundcontrol\settings.json` are stripped at startup so they can never re-enable
  either behaviour. The complete installed package stays far below 500 MB (measured on Windows CI).
- More docs: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) (every connect failure mode, explained from the real log messages), [ROADMAP.md](ROADMAP.md) (shipped vs open), [PROTOCOL.md](PROTOCOL.md) (verified wire spec), [PUBLISH.md](PUBLISH.md) (release checklist), [docs/WINDOWS-CODE-SIGNING.md](docs/WINDOWS-CODE-SIGNING.md) (SmartScreen & Authenticode signing).

**🔎 Connecting earbuds on Windows/Linux (important).** SoundControl talks to devices **already
paired with the host computer** through a small local Bluetooth bridge:

1. Pair the earbuds in the host's Bluetooth settings and leave them connected. Windows uses its
   paired-device/PnP view; Linux uses the BlueZ `bluetoothctl` view.
2. Launch SoundControl → **Devices**. The page automatically polls the host Bluetooth stack and
   lists detected devices without requiring a manual scan. Select a Soundcore device and press
   **Connect** to open its RFCOMM control channel. **Device Connectivity** displays the
   connection and identification status. A verified model is shown automatically by default;
   **Change device model** is a secondary troubleshooting action, not a required setup step.
   When identification is uncertain or mismatched, **Select model manually** offers only existing
   verified protocol profiles. A manual candidate is limited to the connected Bluetooth address
   and this session: it does not verify the physical device or override command gates. A later
   confirmed automatic identity takes precedence, and **Reset to automatic detection** removes
   a candidate. The **Disconnect** button closes
   the session; SoundControl also watches that exact host Bluetooth address and clears telemetry
   after a confirmed host-side disconnect. If the list stays empty, use the **Connect by
   address** field (the address appears in the host Bluetooth device details).
   The helper's start-up is logged to the app's platform-specific log folder (Windows: `%AppData%\soundcontrol\main.log`; Linux: `~/.config/soundcontrol/main.log`).
   The helper only listens on `127.0.0.1`, answers the app's own origins (never
   `Access-Control-Allow-Origin: *`), and requires a per-session token the desktop
   app mints on every launch — so an untrusted local caller can neither enumerate your
   paired devices nor write to them — see [SECURITY.md](.github/SECURITY.md).

The very first launch after installing can take a few extra seconds while the desktop runtime
initializes — it is not hung. Windows installers must be Authenticode-signed before distribution (see [Code signing & SmartScreen](#-code-signing--smartscreen)).

**Or build/run it yourself from source.** Run directly on Windows or Linux with hardware Bluetooth support:
  ```bash
  git clone https://github.com/Shankers8811/soundcontrol.git
  cd soundcontrol
  npm install
  npm run electron
  ```
- **Quick One-Click Launch**: Double-click **`start-windows.bat`**.
- **Build Windows Executable (.exe)**: Double-click **`build-windows-exe.bat`** or run:
  ```cmd
  npm run build:win
  ```
  The packaged NSIS setup installer `.exe` will be generated in the **`release/`** directory.
- **Build Linux packages**:
  ```bash
  npm run build:linux
  ```
  AppImage and Debian packages are generated in **`release/`**. Linux packages bundle the Python bridge runtime; the host still needs a working BlueZ adapter, `bluetoothd`, and `bluetoothctl`.

---

## Model support

SoundControl keeps a separate profile for each verified SKU instead of
assuming that a shared marketing name implies a shared packet layout. The
current table includes R50i/P20i/A20i, C30i, AeroClip, V20i, Sport X20,
C50i, P31i/R60i NC, Sleep A30, Liberty 4 NC, Liberty 3 Pro, Space A40,
Liberty 4 Pro, P40i, Liberty 5, Q20i, Space One, Space Q45, Life Q35, Life
Q30, Life Tune, Space One Pro and Q11i, plus the read-only Space 2 profile and catalog-only Life U2, Life U2i/R500 and Life NC neckband identities. Profiles carry their aliases, battery scale/offset, state offsets,
`06:81` layout, EQ command and toggle capabilities together; the transport
gate refuses a command that does not belong to the connected profile.

Space 2 (D1402) is identified as a **read-only** profile. Its published
channel-30 transport, unlock handshake and 53-byte `03:87` HearID template
are documented in `PROTOCOL.md`, but the current desktop bridge does not
attempt that transport or send those writes yet. Unknown and unverified model
names remain read-only universal telemetry rather than borrowing a sibling's
protocol.

The layouts and evidence matrix are pinned by `npm run verify:protocol`,
`npm run test:models`, `npm run test:simulator`, and `npm run test:ui`; see the
state-offset table in [PROTOCOL.md](PROTOCOL.md) for the exact offsets and
source projects. The current-market inventory, regional aliases, catalog-only
rows, simulator/unit-test status, and physical-validation status are tracked
in [`docs/MARKET-COMPATIBILITY.md`](docs/MARKET-COMPATIBILITY.md). Catalog-only
models are identified exactly but do not get guessed device controls.

## 🎧 Windows & Linux desktop feature coverage

This is a Windows/Linux app, not an Android build. Every ✅ below is a command verified in [PROTOCOL.md](PROTOCOL.md); every ⚠️/❌ is a control the
UI shows **disabled with the protocol reason** — SoundControl never renders a fake switch.

| Feature | Official mobile app (comparison only) | SoundControl for Windows & Linux |
|---|:---:|:---:|
| **Ambient Sound (ANC)** | ✅ 5-Level Manual, Adaptive, Multi-Scene | ✅ Real `06:81` frames with per-model layouts: classic four-byte modes, Space/Q45 six-byte modes, and model-specific TWS six-/seven-byte modes; only profiles whose evidence exposes scenes, vocal transparency, adaptive, or wind controls render them |
| **Transparency Mode** | ✅ Fully Transparent & Talk Mode | ✅ Fully Transparent & Talk Mode (vocal byte where the model documents one) |
| **Equalizer Presets** | ✅ 22 Soundcore Curated Presets | ✅ All 22 presets on EQ-capable models (`02:81` / `02:83` / D1202 `03:87` disabled-HearID form); other HearID models get a disabled page with the reason — never a guessed frame |
| **Custom Graphic EQ** | ✅ 8-Band Slider Curve (-6 to +6 dB) | ✅ 8-band −6…+6 dB curve sent as the real `FE FE` custom preset (same model gating) |
| **Per-earbud connection state** | ✅ Live per-side status | ✅ Compact Dashboard battery summary derived from the device’s own battery bytes (`0xFF` = that side is not connected); unknown side status stays distinct from control-link disconnection |
| **BassUp™ Technology** | ✅ Dynamic Low-End Boost | ⚠️ No `02:82` command exists in any public capture — bass curves live in the preset table (Bass Booster / Reducer) |
| **HearID Sound** | ✅ Dual-Ear Frequency Test & Audiogram | ⚠️ No HearID test/custom-curve command in any public capture — no fake audiogram UI; personalised `03:87` profiles remain untouched (D1202 factory presets use the disabled-HearID form) |
| **Superior Sleep** | ✅ Ambient White Noise Mixer | ❌ Not implemented — the earlier claim was UI-only and was removed; the protocol has no sleep command |
| **Touch Remapping** | ✅ 1-Tap, 2-Tap, 3-Tap, Hold per ear | ⚠️ No gesture-write command is publicly documented — the Noise Control page says so explicitly instead of offering remaps that cannot reach the device |
| **Game Mode** | ✅ 80ms Low Latency | ✅ Real `01:87` toggle (`10:85` on Liberty 4 NC / Liberty 5) |
| **LDAC High-Res** | ✅ Sony 990 kbps Codec Flip | ✅ Real `01:7F` query + `01:FF` enable/disable |
| **Dual Connection** | ✅ Multipoint PC + Phone | ✅ Real `0B:84` toggle |
| **3D Surround** | ✅ Spatial audio toggle | ✅ Real `02:86` toggle on models that document it |
| **Device Volume** | ✅ In-app slider | ⚠️ No volume command exists in any published capture — the volume card renders disabled with that explanation instead of faking a headset change |
| **Safe Volume** | ✅ Decibel Limiter & Warnings | ❌ Not implemented — would require the volume command that does not exist |
| **Factory reset** | ✅ | ⚠️ `01:85` is documented only for the Motion+ (A3116) speaker; capability-gated per model, never sent speculatively |
| **Find My Device** | ✅ Acoustic Locator Chirps | ⚠️ No RFCOMM command in any public capture — never faked; see PROTOCOL.md |
| **Capability gating** | — | ✅ Every page adapts per model: unsupported controls show a disabled state with the protocol reason |
| **Diagnostics / Console**| ❌ Hidden / Unavailable | ✅ Live Hex Frame Inspector & TX/RX Logger |
| **Battery telemetry** | ✅ Live L/R/Case Levels | ✅ Live L/R Levels (case never shown — many models don't report it; over-ears have none) + 30 s refresh + host-reported % fallback; a side reported absent (`0xFF`) loses its level immediately — a stale % can never survive new telemetry |
| **Capture decoding** | ❌ Hidden / Unavailable | ✅ Base64→Hex + BLE→RFCOMM Map in Diagnostics |

---

## 🔬 Protocol Reverse Engineering & Technical Architecture

The Windows/Linux desktop app communicates with Soundcore Bluetooth hardware over:

1. **Bluetooth Classic RFCOMM (SPP)**: the DSP channel is model-dependent (4 on most earbuds, 10 on the P20i family, 12/15 on several over-ears, 30 on Space 2). The helper probes each candidate with the `01:01` handshake and keeps the first channel that answers with a valid `09 FF` frame — accepting a socket alone is not proof (see PROTOCOL.md).
2. **Local Electron-to-helper IPC**: The packaged renderer talks to the Python helper over an authenticated loopback HTTP/WebSocket connection; the helper performs the RFCOMM work. Liveness uses the fast `/health` endpoint; `/scan` enumerates Windows PnP devices or Linux BlueZ devices (slow on cold adapters, cached 3 s) and is polled automatically while the Devices page is open.

### Packet Framing & Checksum Calculation

Every packet transmitted between the host application and the hardware device follows the standard Anker frame format:

```text
[Header: 2 bytes] [Prefix: 3 bytes] [Category: 1 byte] [Command: 1 byte] [Length: 2 bytes] [Payload: N bytes] [Checksum: 1 byte]
```

- **Host Transmission (TX)** starts with magic header `0x08 0xEE`.
- **Device Reception (RX)** starts with magic header `0x09 0xFF`.
- **Additive Checksum**: Sum of all preceding bytes in the frame modulo 256:
  $$\text{Checksum} = \left(\sum_{i=0}^{L-1} \text{byte}[i]\right) \pmod{256}$$

### Decompiled Command Categories

- **Category `0x01` (System / Device Management)**:
  - `0x01`: Handshake / full state query (also the channel-probe frame).
  - `0x03` / `0x04`: live battery levels / charging flags.
  - `0x05`: serial + firmware (ASCII).
  - `0x7F` / `0xFF`: LDAC High-Resolution audio query and enable/disable.
  - `0x87`: Low-latency Game Mode toggle (`10:85` on Liberty 4 NC / Liberty 5).
  - `0x85`: Factory reset — documented only for the Motion+ A3116 speaker, so the UI capability-gates it per model and never sends it speculatively.
- **Category `0x02` (Audio DSP & Equalizer)**:
  - `0x81`: 8-Band Graphic EQ (classic over-ears). Target bands: 100 Hz, 200 Hz, 400 Hz, 800 Hz, 1.6 kHz, 3.2 kHz, 6.4 kHz, 12.8 kHz.
  - `0x83`: 10-band EQ + DRC compensation channel (P20i/P30i family) — byte-identical to 22 live captures.
  - `0x86`: 3D Surround Sound toggle.
  - ~~`0x82` BassUp~~ and any "find my device" opcode: **no public capture in any surveyed project contains them; SoundControl does not invent frames.**
- **Category `0x03`**: `0x87` is the model-specific HearID EQ used by Liberty 4 NC, Space One, Space Q45, Space A40, Liberty 4 Pro, P40i, Liberty 5, Space One Pro and Space 2. Layout differs per model and risks overwriting measured hearing profiles, so SoundControl disables those writes instead of guessing.
- **Category `0x06` (Ambient Sound & ANC)**:
  - `0x81`: sound-mode selector with per-model layouts. Classic Q20i/Q30/Q35/Life Tune models use the four-byte body; Space One/Space Q45, Space One Pro, Space A40, Liberty 4 Pro, P40i and Liberty 5 use their documented six- or seven-byte bodies (manual level, adaptive, wind and model-specific scene fields). Inbound mirror is `06:01`.
- **Category `0x08` (Touch & Button Controls)**:
  - **No write command is publicly documented.** Button mappings appear in some *inbound* state
    parses only; no capture shows how to send new mappings. SoundControl therefore displays
    "Gesture customization is not supported by this protocol" instead of remap UI that could
    never reach the device.
- **Category `0x0B` (Connectivity)**:
  - `0x84`: Dual Connection (Multipoint pairing) toggle.

### Android BLE captures (decode-only)

The desktop app does **not** use Web Bluetooth — Electron has no reliable BLE stack in this renderer, and the local helper reaches hardware over RFCOMM. Android BLE captures are still documented in [PROTOCOL.md](PROTOCOL.md#appendix-a--android-ble-captures-decode-only-reference) so they can be decoded in **Diagnostics → Base64 capture → hex** and mapped to the RFCOMM frames above:

| BLE capture | RFCOMM equivalent |
|---|---|
| `0x61` telemetry request | `01 01` handshake + `01 03` battery query |
| `0x06` ANC toggle | `06 81` ambient frame |
| `0x01` EQ gain array | `02 81` 8-band EQ frame |

BLE frames use an XOR checksum; RFCOMM frames use the additive Σ checksum. The diagnostics console shows both, and `src/protocol/ble.ts` holds the GATT UUIDs (`ab00` service, `ab01` TX, `ab02` RX) plus the parsers.

### Troubleshooting connections

- **"Bluetooth helper: not responding"** means the renderer could not reach `/health`. Restart SoundControl and check the platform log folder for `bridge started via …` or a Python startup error. The status no longer depends on the slow PnP/BlueZ scan, so a slow adapter will not false-positive.
- **Empty paired-device list** with the helper running means the host has no paired RFCOMM device to enumerate. Pair in the computer’s Bluetooth settings, keep the device connected, then use **Scan devices** on the Devices page (which forces a fresh `?fresh=1` scan).
- **Battery stuck?** The app re-queries `01 03` every 30 s while connected to real hardware and falls back to the host Bluetooth percentage when protocol telemetry is unavailable.

---

## 🛠️ Development & Building

### Prerequisites
- **Node.js 20.19+ or 22.12+** (Node 22 recommended) — Vite 8 refuses older runtimes
- **Python 3.9+** — needed only for source runs. Windows release installers fetch a bundled runtime
  automatically during `npm run build:win`; Linux packages stage a relocated runtime automatically
  during `npm run build:linux`. Linux users still need BlueZ (`bluetoothd` and `bluetoothctl`).

### Development
```bash
npm install
npm run dev
```

This starts the local Vite renderer used while developing the Windows/Linux Electron app.
Use `npm run electron` with the renderer available when testing the desktop shell.

### Tests
```bash
npm test            # everything below in sequence
npm run test:ui     # pure UI state derivation (capabilities, earbud presence, battery math, scan machine) + a server-side render smoke of every page
npm run test:bridge # Python bridge unit tests (channel probe, token/origin auth, WS protocol)
npm run test:simulator # documented profiles exercise fixtures; catalog-only profiles are rejected
npm run test:e2e    # startup/lifecycle e2e: real helper server + real renderer transport against an emulated RFCOMM device (incl. per-side earbud telemetry)
npm run test:lifecycle # main-process exit/restart races: window close kills the real helper, port 8765 frees, no post-shutdown restart (Electron stubbed; Windows CI repeats this against the packaged app)
```
None of these need Windows, Bluetooth hardware, or an Electron binary; the
emulated helper (`scripts/emulated_bridge.py`) is test data only and is never
packaged into the installer.

Physical Soundcore hardware has **not** been validated in the development
sandbox — [`HARDWARE-VALIDATION.md`](HARDWARE-VALIDATION.md) is the step-by-step
checklist (pairing → discovery → connection → battery → ANC → EQ → disconnect →
reconnect → multi-device → shutdown) for verifying the app against real devices
on a Windows or Linux machine, with the evidence to record at each step.

### App icon (SC monogram)
Every shipped icon raster — window, taskbar, desktop shortcut, installer and
browser-tab favicon — is rendered from one vector source,
`assets/icon/sc-monogram.svg`:

```bash
npm i --no-save @resvg/resvg-js   # generation-time tool only
node scripts/generate-icons.mjs   # rewrites public/icon-*.png + favicon-64.png
```

The generated PNGs are committed, so builds, CI and packaging never need the
rasterizer; it is deliberately not a `package.json` dependency. Regenerate
only when the vector source changes and commit all sizes together so the
icon set stays pixel-consistent.

### Build the renderer
```bash
npm run build
```
Generates the renderer assets in `dist/` for packaging into the desktop app.

### Package Windows Desktop App
```bash
npm run build:win
```
Generates the NSIS Windows installer (`SoundControl Setup <version>.exe`) in `release/`.

### Package Linux Desktop App
```bash
npm run build:linux
```
Generates AppImage and Debian (`.deb`) packages in `release/`. Linux packages carry the Python
bridge runtime and use the host's BlueZ stack; install `bluetoothd` and `bluetoothctl` before
launching the app.

#### Upgrading an existing installation

The installer is configured as an assisted NSIS installer with the permanent
application ID `com.soundcontrol.desktop`. Running a newer
`SoundControl-Setup.exe` detects an existing per-user or per-machine SoundControl
installation, closes the running app when needed, reuses its installation
location, and replaces the old application files instead of installing a
side-by-side copy. App data is preserved during this upgrade. Do not change the
application ID in `package.json`, because it is the Windows upgrade identity.

The Windows CI smoke test installs the package, marks that installation as an
older version, and runs the same installer again without an install-directory
override to verify the in-place upgrade path.

### Publish a new Windows Release
Tagged commits are built and published automatically by the **Release Windows**
workflow (`.github/workflows/release-windows.yml`). It builds the NSIS installer
on `windows-latest`, creates a GitHub Release with one stable installer asset:
`SoundControl-Setup.exe`. The in-app downloader checks the latest release assets and only offers a link when that installer is actually attached:

```bash
# Bump "version" in package.json first so the release metadata stays accurate.
git tag vX.Y.Z main
git push origin vX.Y.Z
```

The in-app downloader queries the latest release and shows only assets that exist. Linux stable aliases are attached by the Linux release workflow.

### 🔏 Code signing & SmartScreen
The Windows signing pipeline is fully implemented and enforced: **release builds are gated on signing** — the release workflow refuses to build without credentials, electron-builder runs with `forceCodeSigning`, and the generated EXE is verified (`Get-AuthenticodeSignature` + `signtool verify /pa`, publisher identity, SHA-256 recorded, every shipped executable signed) before the GitHub Release is published. All details: **[docs/WINDOWS-CODE-SIGNING.md](docs/WINDOWS-CODE-SIGNING.md)**.

The latest published release has no Windows installer. A signed Windows release requires a valid code-signing certificate and the repository secrets below; the CI certificate-validation step is skipped when they are not configured. To enable signing, set two repository secrets (Settings → Secrets and
variables → Actions):

| Secret | Value |
|---|---|
| `WIN_CSC_LINK` | base64 text of the `.p12`/`.pfx` file (e.g. `openssl base64 -in cert.p12 -out cert.b64 -A`) |
| `WIN_CSC_KEY_PASSWORD` | the certificate password |

(Optionally also set the repository variable `WINDOWS_EXPECTED_PUBLISHER` so
the release gate can pin the expected signer identity.) electron-builder signs
the app, the bundled Python executables, the uninstaller and the installer
with SHA-256 + RFC 3161 timestamping, and the cleanup step deletes the staged
certificate after the build. Until those secrets exist, every attempt to cut a
release fails loudly instead of shipping another unsigned installer.

**Getting a certificate — three routes, cheapest first:**

1. **Free — [SignPath Foundation](https://signpath.org/).** Qualifying
   open-source projects get signing at no cost: apply on the Foundation site,
   and once approved point the workflow at SignPath instead of a local `.p12`
   (the certificate never leaves their HSM, which is also what the CAs now
   require for OV/EV keys).
2. **OV certificate (~$75–200/yr)** from any CA (Sectigo, DigiCert, ssl.com,
   GlobalSign…). Clears the publisher name into the SmartScreen dialog; the
   "Unknown publisher" block fades as the certificate builds download
   reputation over days to weeks.
3. **EV certificate (~$200–400/yr)** — hardware-token or cloud-HSM key.
   SmartScreen reputation is effectively instant; this is the route that makes
   the prompt disappear on the very first download.

**Wiring an existing `.p12`/`.pfx` into this repo:**

```bash
# 1. export/keep your certificate as PKCS#12
openssl pkcs12 -export -out soundcontrol.p12 -inkey key.pem -in cert.pem

# 2. base64 it (single line is fine)
openssl base64 -in soundcontrol.p12 -out soundcontrol.b64 -A

# 3. store the two secrets, then re-run the Release workflow
#    Settings → Secrets and variables → Actions → New repository secret
#      WIN_CSC_LINK          = <contents of soundcontrol.b64>
#      WIN_CSC_KEY_PASSWORD  = <p12 password>
```

Honest expectation: signing makes the publisher verifiable, but a brand-new
signed file can still be considered unrecognized until SmartScreen reputation
builds up from real downloads (EV certificates are the exception with
near-immediate reputation). See
[SmartScreen reputation expectations](docs/WINDOWS-CODE-SIGNING.md#smartscreen-reputation-expectations).

Verify afterwards on any Windows box: right-click the installer → Properties
(the digital signature tab appears), or in PowerShell
`Get-AuthenticodeSignature .\SoundControl-Setup.exe` → `Status : Valid`.

---

## 📜 Legal & Disclaimer

SoundControl is an independent, open-source project and is **not** affiliated with, endorsed by, or sponsored by Anker Innovations Limited or Soundcore. All product names, trademarks, and registered trademarks (such as "soundcore", "Liberty", "Space One", "BassUp") are property of their respective owners. Reverse-engineered protocol specifications are documented for interoperability and accessibility purposes under standard fair use guidelines.
