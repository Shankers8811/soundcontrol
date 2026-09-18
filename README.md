# SoundControl — Windows Desktop Companion

<p align="center">
  <img src="public/icon-512.png" width="128" height="128" alt="SoundControl">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Windows%20App-Electron%20%7C%20EXE-0084ff" alt="Windows app">
  <a href="https://github.com/Shankers8811/soundcontrol/releases/latest"><img src="https://img.shields.io/github/v/release/Shankers8811/soundcontrol?label=latest%20release&color=0084ff" alt="Latest release"></a>
  <a href="https://github.com/Shankers8811/soundcontrol/actions/workflows/build-windows.yml"><img src="https://github.com/Shankers8811/soundcontrol/actions/workflows/build-windows.yml/badge.svg?branch=main" alt="Windows build"></a>
</p>

---

## Windows Desktop App

**⬇️ Direct download (recommended) — no build required:**

| Download | File | Notes |
|---|---|---|
| 🪟 **Windows app (installer)** | [**Download the latest `SoundControl-Setup.exe`**](https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl-Setup.exe) | NSIS setup, Start-menu & desktop shortcuts. Ships its own built-in Bluetooth runtime — no Python needed |

- All builds and release notes live on the **[Releases page](https://github.com/Shankers8811/soundcontrol/releases/latest)**.
- The same download is built into the app under **Settings → About** (**Download .exe** → latest release).
- Windows SmartScreen may show an unsigned-publisher prompt on first run (the app is free and not code-signed); choose **More info → Run anyway** — see [Code signing & SmartScreen](#-code-signing--smartscreen) for how to make that warning disappear.
- **Lifecycle is deliberately boring:** SoundControl starts only when you launch it (it never
  registers a Windows startup entry, and a startup entry left by an older version is removed at
  launch), and closing the window exits completely — the Bluetooth helper is terminated, port
  8765 is released, and nothing keeps running in the tray or background. There is no
  launch-at-login or minimize-to-tray setting by design; obsolete entries in an old
  `%AppData%\soundcontrol\settings.json` are stripped at startup so they can never re-enable
  either behaviour. The complete installed package stays far below 500 MB (measured on Windows CI).
- More docs: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) (every connect failure mode, explained from the real log messages), [ROADMAP.md](ROADMAP.md) (shipped vs open), [PROTOCOL.md](PROTOCOL.md) (verified wire spec), [PUBLISH.md](PUBLISH.md) (release checklist).

**🔎 Connecting earbuds on Windows (important).** SoundControl talks to devices **already paired
with Windows** through a small local bridge that runs on a Python runtime **bundled inside the
installer** — no Python to install, nothing to configure:

1. Pair the earbuds in **Settings → Bluetooth & devices** and leave them connected.
2. Launch SoundControl → **Devices** page → **Scan devices**. Your paired buds are listed
   automatically (even while playing audio) — select one and press **Connect**. If the list stays
   empty, use the **Connect by address** field (the address appears in Settings → device →
   Device properties).
   The helper's start-up is logged to `%AppData%\soundcontrol\main.log`.
   The helper only listens on `127.0.0.1`, answers the app's own origins (never
   `Access-Control-Allow-Origin: *`), and requires a per-session token the desktop
   app mints on every launch — so an untrusted local caller can neither enumerate your
   paired devices nor write to them — see [SECURITY.md](.github/SECURITY.md).

The very first launch after installing can take a few extra seconds while Windows inspects a
freshly downloaded app — it is not hung. If SmartScreen appears, choose **More info → Run anyway**
(see [Code signing & SmartScreen](#-code-signing--smartscreen)).

**Or build/run it yourself from source.** Run directly on Windows with hardware Bluetooth support:
  ```cmd
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

---

## 🎧 Windows desktop feature coverage

Every ✅ below is a command verified in [PROTOCOL.md](PROTOCOL.md); every ⚠️/❌ is a control the
UI shows **disabled with the protocol reason** — SoundControl never renders a fake switch.

| Feature | Official Android App | SoundControl for Windows |
|---|:---:|:---:|
| **Ambient Sound (ANC)** | ✅ 5-Level Manual, Adaptive, Multi-Scene | ✅ Real `06:81` frames with per-model layouts: scenes + transparency sub-modes on classic over-ears; manual level, adaptive and wind-noise bytes on TWS |
| **Transparency Mode** | ✅ Fully Transparent & Talk Mode | ✅ Fully Transparent & Talk Mode (vocal byte where the model documents one) |
| **Equalizer Presets** | ✅ 22 Soundcore Curated Presets | ✅ All 22 presets on EQ-capable models (`02:81` / `02:83`); HearID models (`03:87`) get a disabled page with the reason — never a guessed frame |
| **Custom Graphic EQ** | ✅ 8-Band Slider Curve (-6 to +6 dB) | ✅ 8-band −6…+6 dB curve sent as the real `FE FE` custom preset (same model gating) |
| **Per-earbud connection state** | ✅ Live per-side status | ✅ Derived from the device's own battery bytes (`0xFF` = that side is not connected); "Status unavailable" stays distinct from "Not connected" |
| **BassUp™ Technology** | ✅ Dynamic Low-End Boost | ⚠️ No `02:82` command exists in any public capture — bass curves live in the preset table (Bass Booster / Reducer) |
| **HearID Sound** | ✅ Dual-Ear Frequency Test & Audiogram | ⚠️ No HearID test/write command in any public capture — no fake audiogram UI; the `03:87` EQ is left untouched to protect measured profiles |
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
| **Battery telemetry** | ✅ Live L/R/Case Levels | ✅ Live L/R Levels (case never shown — many models don't report it; over-ears have none) + 30 s refresh + Windows % fallback; a side reported absent (`0xFF`) loses its level immediately — a stale % can never survive new telemetry |
| **Capture decoding** | ❌ Hidden / Unavailable | ✅ Base64→Hex + BLE→RFCOMM Map in Diagnostics |

---

## 🔬 Protocol Reverse Engineering & Technical Architecture

The Windows desktop app communicates with Soundcore Bluetooth hardware over:

1. **Bluetooth Classic RFCOMM (SPP)**: the DSP channel is model-dependent (4 on most earbuds, 10 on the P20i family, 12/15 on several over-ears, 30 on Space 2). The helper probes each candidate with the `01:01` handshake and keeps the first channel that answers with a valid `09 FF` frame — accepting a socket alone is not proof (see PROTOCOL.md).
2. **Local Electron-to-helper IPC**: The packaged renderer talks to the bundled Python helper over an authenticated loopback HTTP/WebSocket connection; the helper performs the RFCOMM work. Liveness uses the fast `/health` endpoint; `/scan` enumerates Windows PnP devices (slow on cold machines, cached 3 s) and is only called when the helper is up.

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
- **Category `0x03`**: `0x87` is the model-specific HearID EQ (Liberty 4 NC / Space One / Space Q45). Layout differs per model and risks overwriting measured hearing profiles, so SoundControl disables EQ there instead of guessing.
- **Category `0x06` (Ambient Sound & ANC)**:
  - `0x81`: sound-mode selector, four per-model layouts. Classic over-ears: mode `0x00` = ANC, `0x01` = Transparency, `0x02` = Normal, plus NC scene (Transport/Outdoor/Indoor) and transparency sub-mode bytes. TWS models use 6–7 byte layouts (manual level, adaptive, wind, scenes). Inbound mirror is `06:01`.
- **Category `0x08` (Touch & Button Controls)**:
  - **No write command is publicly documented.** Button mappings appear in some *inbound* state
    parses only; no capture shows how to send new mappings. SoundControl therefore displays
    "Gesture customization is not supported by this protocol" instead of remap UI that could
    never reach the device.
- **Category `0x0B` (Connectivity)**:
  - `0x84`: Dual Connection (Multipoint pairing) toggle.

### Android BLE captures (decode-only)

The Windows app does **not** use Web Bluetooth — Electron has no reliable BLE stack on Windows, and the bundled helper reaches hardware over RFCOMM. Android BLE captures are still documented in [PROTOCOL.md](PROTOCOL.md#appendix-a--android-ble-captures-decode-only-reference) so they can be decoded in **Diagnostics → Base64 capture → hex** and mapped to the RFCOMM frames above:

| BLE capture | RFCOMM equivalent |
|---|---|
| `0x61` telemetry request | `01 01` handshake + `01 03` battery query |
| `0x06` ANC toggle | `06 81` ambient frame |
| `0x01` EQ gain array | `02 81` 8-band EQ frame |

BLE frames use an XOR checksum; RFCOMM frames use the additive Σ checksum. The diagnostics console shows both, and `src/protocol/ble.ts` holds the GATT UUIDs (`ab00` service, `ab01` TX, `ab02` RX) plus the parsers.

### Troubleshooting connections

- **"Windows helper: not responding"** means the renderer could not reach `/health`. Restart SoundControl and check `%AppData%\soundcontrol\main.log` for `bridge started via …` or a Python startup error. The status no longer depends on the slow PnP scan, so a slow machine will not false-positive.
- **Empty paired-device list** with the helper running means Windows has no paired RFCOMM device to enumerate. Pair in **Settings → Bluetooth & devices**, then use **Refresh** on the Devices page (which forces a fresh `?fresh=1` scan).
- **Battery stuck?** The app re-queries `01 03` every 30 s while connected to real hardware and falls back to the Windows PnP percentage when protocol telemetry is unavailable.

---

## 🛠️ Development & Building

### Prerequisites
- **Node.js 20.19+ or 22.12+** (Node 22 recommended) — Vite 8 refuses older runtimes
- **Python 3.9+** — only for running the bridge from source. Release installers carry their own
  bundled Python runtime (`python-embed/`, fetched automatically by `npm run fetch:python-embed`
  during `npm run build:win`), so desktop users install nothing extra.

### Development
```bash
npm install
npm run dev
```

This starts the local Vite renderer used while developing the Windows Electron app.
Use `npm run electron` with the renderer available when testing the desktop shell.

### Tests
```bash
npm test            # everything below in sequence
npm run test:ui     # pure UI state derivation (capabilities, earbud presence, battery math, scan machine) + a server-side render smoke of every page
npm run test:bridge # Python bridge unit tests (channel probe, token/origin auth, WS protocol)
npm run test:e2e    # startup/lifecycle e2e: real helper server + real renderer transport against an emulated RFCOMM device (incl. per-side earbud telemetry)
npm run test:lifecycle # main-process exit/restart races: window close kills the real helper, port 8765 frees, no post-shutdown restart (Electron stubbed; Windows CI repeats this against the packaged app)
```
None of these need Windows, Bluetooth hardware, or an Electron binary; the
emulated helper (`scripts/emulated_bridge.py`) is test data only and is never
packaged into the installer.

### App icon (SC monogram)
Every shipped icon raster — window, taskbar, desktop shortcut, installer,
system tray and browser-tab favicon — is rendered from one vector source,
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
Generates the renderer assets in `dist/` for packaging into the Windows app.

### Package Windows Desktop App
```bash
npm run build:win
```
Generates the NSIS Windows installer (`SoundControl Setup <version>.exe`) in `release/`.

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
`SoundControl-Setup.exe`. The in-app download button always links to the
latest release through that stable filename:

```bash
# Bump "version" in package.json first so the release metadata stays accurate.
git tag vX.Y.Z main
git push origin vX.Y.Z
```

The in-app download button and the links above resolve through
`releases/latest/download/...`, so they always point at the newest Release.

### 🔏 Code signing & SmartScreen
By default the installer is **unsigned**, so first-time downloaders see the
SmartScreen "Windows protected your PC — Unknown publisher" prompt. It is not a
virus check failure; click **More info → Run anyway**, or right-click the file →
**Properties → Unblock** before launching. The prompt can only be removed with an
Authenticode code-signing certificate — nothing in the build config can suppress it.

To sign releases, add two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `WINDOWS_CERTIFICATE_BASE64` | base64 text of the `.p12`/`.pfx` file (e.g. `openssl base64 -in cert.p12 -out cert.b64`) |
| `WINDOWS_CERTIFICATE_PASSWORD` | the certificate password |

The Release workflow picks them up automatically and electron-builder signs the app
and the installer; the cleanup step deletes the certificate after the build.
The workflow also runs a **"Report Authenticode signature status"** step: with no
secrets it only reports the installer as unsigned, but once
`WINDOWS_CERTIFICATE_BASE64` exists a build whose signature is not *Valid* fails
the release instead of shipping another unsigned binary.

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
#      WINDOWS_CERTIFICATE_BASE64   = <contents of soundcontrol.b64>
#      WINDOWS_CERTIFICATE_PASSWORD = <p12 password>
```

Verify afterwards on any Windows box: right-click the installer → Properties
(the digital signature tab appears), or in PowerShell
`Get-AuthenticodeSignature .\SoundControl-Setup.exe` → `Status : Valid`.

---

## 📜 Legal & Disclaimer

SoundControl is an independent, open-source project and is **not** affiliated with, endorsed by, or sponsored by Anker Innovations Limited or Soundcore. All product names, trademarks, and registered trademarks (such as "soundcore", "Liberty", "Space One", "BassUp") are property of their respective owners. Reverse-engineered protocol specifications are documented for interoperability and accessibility purposes under standard fair use guidelines.
