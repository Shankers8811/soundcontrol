# SoundControl [Soundcore Desktop & Web Companion]

<p align="center">
  <img src="public/icon-512.png" width="128" height="128" alt="SoundControl">
</p>

<p align="center">
  <b>Complete Web App & Windows App companion for Anker Soundcore earbuds and headphones.</b><br>
  Engineered to replicate 100% of the core audio DSP and hardware control capabilities from the official Soundcore Android app without bloat, accounts, or telemetry.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Web%20App-Chrome%20%7C%20Edge%20%7C%20Brave-0084ff" alt="Web App">
  <img src="https://img.shields.io/badge/Windows%20App-Electron%20%7C%20EXE-0084ff" alt="Windows App">
  <img src="https://img.shields.io/badge/Android%20Parity-100%25-success" alt="Feature Complete">
</p>

---

## 🚀 Two Ways to Use: Web App or Windows Desktop App

### 1. 🌐 Web App (Browser Version)
- **Live Deployment**: Access the web app hosted directly via GitHub Pages:  
  **`https://shankers8811.github.io/soundcontrol/`**
- **Browser Compatibility**: Chrome, Edge, Brave, or Opera (version 117+) on Windows, macOS, Linux, or ChromeOS.
- **Connection**: Connects directly via the **Web Bluetooth API** (GATT Service `0000ffe0-0000-1000-8000-00805f9b34fb`).
- **Installable PWA**: Click the Install icon in your browser address bar to install SoundControl as a standalone desktop application.
- **Demo Mode**: Includes full offline simulation with realistic hardware models and audio synthesis if no physical device is connected.

### 2. 💻 Windows Desktop App (Electron & Native EXE)

**⬇️ Direct download (recommended) — no build required:**

| Download | File | Notes |
|---|---|---|
| 🪟 **Windows installer** | [`SoundControl Setup 1.0.0.exe`](https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl%20Setup%201.0.0.exe) | NSIS setup, Start-menu & desktop shortcuts |
| 💾 **Portable app** | [`SoundControl 1.0.0.exe`](https://github.com/Shankers8811/soundcontrol/releases/latest/download/SoundControl%201.0.0.exe) | Single file, runs without installing |

- All builds and release notes live on the **[Releases page](https://github.com/Shankers8811/soundcontrol/releases/latest)**.
- The same **Download for Windows** buttons are built into the app under **Settings → About → Desktop extras**.
- Windows SmartScreen may show an unsigned-publisher prompt on first run (the app is free and not code-signed); choose **More info → Run anyway**.

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
  The packaged NSIS setup installer and portable `.exe` will be generated in the **`release/`** directory.

---

## 🎧 Complete Android App Feature Parity

| Feature | Official Android App | SoundControl (Web & Windows) |
|---|:---:|:---:|
| **Ambient Sound (ANC)** | ✅ 5-Level Manual, Adaptive, Multi-Scene | ✅ Level 1–5, Adaptive, Transport/Outdoor/Indoor |
| **Transparency Mode** | ✅ Fully Transparent & Talk Mode | ✅ Fully Transparent & Talk Mode |
| **Equalizer Presets** | ✅ 22 Soundcore Curated Presets | ✅ All 22 Exact Soundcore Presets |
| **Custom Graphic EQ** | ✅ 8-Band Slider Curve (-6 to +6 dB) | ✅ Interactive 8-Band SVG Bezier EQ |
| **BassUp™ Technology** | ✅ Dynamic Low-End Boost | ✅ Dynamic BassUp Command & Curve |
| **HearID Sound** | ✅ Dual-Ear Frequency Test & Audiogram | ✅ Interactive Left/Right Web Audio Test |
| **Superior Sleep** | ✅ Ambient White Noise Mixer | ✅ Procedural Nature Sound Synthesizer |
| **Touch Remapping** | ✅ 1-Tap, 2-Tap, 3-Tap, Hold per ear | ✅ Left & Right Earbud Gestures |
| **Game Mode** | ✅ 80ms Low Latency | ✅ 0x87 Packet Low-Latency Switch |
| **LDAC High-Res** | ✅ Sony 990 kbps Codec Flip | ✅ LDAC Query & Command Dispatch |
| **Dual Connection** | ✅ Multipoint PC + Phone | ✅ Dual Connection Command 0x84 |
| **Safe Volume** | ✅ Decibel Limiter & Warnings | ✅ Interactive Volume Limiter |
| **Find My Device** | ✅ Acoustic Locator Chirps | ✅ Left/Right/Both Audio Beacon |
| **Diagnostics / Console**| ❌ Hidden / Unavailable | ✅ Live Hex Frame Inspector & TX/RX Logger |

---

## 🔬 Protocol Reverse Engineering & Technical Architecture

The official Soundcore Android application (`com.oceanwing.soundcore`) communicates with Soundcore Bluetooth hardware using two primary protocols:

1. **Bluetooth Low Energy (BLE)**: Custom GATT service UUID `0000ffe0-0000-1000-8000-00805f9b34fb` with characteristic `0000ffe1-0000-1000-8000-00805f9b34fb` (and companion notify UUIDs).
2. **Bluetooth Classic RFCOMM (SPP)**: Bound to Channel 4 (or Channels 12/15 on Q-series over-ear models).

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
  - `0x01`: Handshake initialization & query firmware telemetry.
  - `0x7F` / `0xFF`: LDAC High-Resolution audio query and enable/disable.
  - `0x87`: Low-latency Game Mode toggle.
  - `0x88`: Find My Device acoustic beacon.
  - `0x85`: Factory reset device configuration.
- **Category `0x02` (Audio DSP & Equalizer)**:
  - `0x81`: 8-Band Graphic EQ. Target bands: 100 Hz, 200 Hz, 400 Hz, 800 Hz, 1.6 kHz, 3.2 kHz, 6.4 kHz, 12.8 kHz.
  - `0x82`: BassUp dynamic bass boost flag.
  - `0x86`: 3D Spatial Audio / Surround Sound toggle.
- **Category `0x06` (Ambient Sound & ANC)**:
  - `0x81`: Ambient mode selector. Mode `0x00` = ANC, `0x01` = Normal, `0x02` = Transparency. For TWS models, level byte ranges from `0x01` (Min) to `0x05` (Max).
- **Category `0x08` (Touch & Button Controls)**:
  - Mapping gesture indices (Single tap, Double tap, Triple tap, Long press) to action IDs (Volume, Play/Pause, Skip, ANC cycle, Voice Assistant).
- **Category `0x0B` (Connectivity)**:
  - `0x84`: Dual Connection (Multipoint pairing) toggle.

---

## 🛠️ Development & Building

### Prerequisites
- Node.js 18+ (Node 20 or 22 recommended)
- Python 3.9+ (Optional, for the Classic Bluetooth RFCOMM bridge)

### Setup & Development Server
```bash
npm install
npm run dev
```
Preview at `http://localhost:5173`.

### Build for Web Production
```bash
npm run build
```
Generates production assets in `dist/`.

### Package Windows Desktop App
```bash
npm run build:win
```
Generates standalone Windows installer and portable `.exe` in `release/`.

### Publish a new Windows Release
Tagged commits are built and published automatically by the **Release Windows**
workflow (`.github/workflows/release-windows.yml`). It compiles both `.exe`
targets on `windows-latest`, creates a GitHub Release, and attaches both files:

```bash
git tag v1.0.0 main
git push origin v1.0.0
```

The in-app download buttons and the links above resolve through
`releases/latest/download/...`, so they always point at the newest Release.

---

## 📜 Legal & Disclaimer

SoundControl is an independent, open-source project and is **not** affiliated with, endorsed by, or sponsored by Anker Innovations Limited or Soundcore. All product names, trademarks, and registered trademarks (such as "soundcore", "Liberty", "Space One", "BassUp") are property of their respective owners. Reverse-engineered protocol specifications are documented for interoperability and accessibility purposes under standard fair use guidelines.
