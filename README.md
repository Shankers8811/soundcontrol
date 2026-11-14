# SoundControl

[![GitHub release](https://img.shields.io/github/v/release/Shankers8811/soundcontrol)](https://github.com/Shankers8811/soundcontrol/releases)
[![GitHub last commit](https://img.shields.io/github/last-commit/Shankers8811/soundcontrol)](https://github.com/Shankers8811/soundcontrol/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/Shankers8811/soundcontrol)](https://github.com/Shankers8811/soundcontrol/issues)
[![GitHub license](https://img.shields.io/github/license/Shankers8811/soundcontrol)](LICENSE)
[![CI/CD](https://github.com/Shankers8811/soundcontrol/actions/workflows/ci.yml/badge.svg)](https://github.com/Shankers8811/soundcontrol/actions/workflows/ci.yml)

Native desktop companion app for **Anker/Soundcore** devices. Built with **Rust + Tauri v2** for Windows and Linux.

## 🎯 Purpose

This app is built for desktop users who want to control their Soundcore earbuds, headphones, and speakers from Windows or Linux. The mobile app doesn't allow single-earbud mode with full features — this desktop app fills that gap.

## 📱 Supported Devices (110+ Soundcore/Anker Models)

This app exclusively supports **Anker/Soundcore** devices across all product lines:

### Earbuds & TWS
- **Liberty series:** Liberty 5, 5 Pro, 5 Pro Max, 4 Pro, 4, 4 NC, 3 Pro, 2 Pro, Air 2 Pro, Air 2, Neo 2, Buds
- **Life series:** P3, P3i, P3iS, P3 NC, P3i NC, P2, P2 Mini, P2i, A2 NC, A3i, Note 3, Note 3S, Dot 2, Dot 2 NC, Dot 2S, Dot 2 XR, Q30, Q35, Q20+, Q20i, Q10i
- **Space series:** A40, A40 NC
- **P series:** P20i, P25i, P30i, P31i, P40i, P41i, P42i
- **R series:** R50i, R50i NC, R60i NC, R100, R20i, R30i, R40i
- **Sport series:** Sport X10, Sport X20
- **AeroFit series:** AeroFit, AeroFit Pro, AeroFit 2, AeroFit 2 Pro, AeroFit 2 AI Assistant
- **AeroClip/C series:** AeroClip, C30i, C40i, C50i
- **V series:** V20i, V30i, V40i
- **A series:** A30i, A20i, A25i
- **Sleep series:** Sleep A10, Sleep A20, Sleep A30
- **VR/Gaming:** VR P10

### Headphones
- **Space series:** Q45, Space One, Space One Pro, Space 2
- **Life series:** Q30, Q35, Q20+, Q20i, Q10i

### Speakers
- **Motion series:** Motion+, Motion Boom, Motion Boom Plus, Motion Boom 2, Motion Boom 2 Plus, Motion Boom 2 SE, Motion Boom Go 3i, Motion Boom 3i, Motion X600, Motion X500, Motion X300, Motion 300, Motion 100
- **Flare series:** Flare, Flare 2, Flare S+, Flare Mini
- **Rave series:** Rave, Rave+, Rave Mini, Rave Neo, Rave Neo 2, Rave 3S
- **Other:** Soundcore 3, Soundcore 2, Mini 3, Mini 3 Pro, Select 2, Select 4 Go, Select Pro, Glow, Glow Mini, Wakey, Model Zero, Model Zero+, Infini Pro

## 🚀 Features

| Feature | Status |
|---------|--------|
| 🔊 ANC Control | Active Noise Cancellation modes |
| 🌬️ Transparency Mode | Hear your surroundings |
| 🌪️ Wind Noise Reduction | Outdoor wind noise suppression |
| 🎮 Game Mode | Low latency gaming mode |
| 📡 LDAC Codec | High-res audio (Android-compatible devices) |
| 🔗 Multipoint | Connect to multiple devices |
| 🎵 22-Band EQ | Custom + 22 factory presets |
| 🔋 Battery Monitor | Per-earbud battery levels (L/R/Case) |
| 🎯 Feature Gating | Unsupported features greyed out per device |
| 🔑 Global Hotkeys | Ctrl+Alt+N (ANC), Ctrl+Alt+G (Game), Ctrl+Alt+E (EQ) |
| 📊 Diagnostics | Frame logging and ZIP export |
| 🎨 Dark/Light Theme | System theme + manual toggle |
| ❤️ HearID | Hearing personalization test |
| 🎵 Relaxing Sounds | White noise, nature sounds, healing music |
| 🎮 Touch Controls | Customize tap/hold gestures per earbud |
| 🔋 Firmware Updates | Check and install firmware updates |
| 💡 Speaker Lighting | LED control + PartyCast sync |
| 👂 Single Earbud Mode | All features work with one earbud |

## 🏗️ Architecture

```
Frontend (React + TypeScript + Tailwind)
    ↓ Tauri IPC
Backend (Rust 100%) → Bluetooth → Soundcore CMF Protocol → Device
           → SQLite Database → Local Storage
           → Background Tasks → Battery polling, device watch
```

## 📦 Installation

### Windows
Download the latest `.exe` installer from [Releases](https://github.com/Shankers8811/soundcontrol/releases).

### Linux
```bash
# AppImage
chmod +x soundcontrol-x86_64.AppImage
./soundcontrol-x86_64.AppImage

# .deb
sudo dpkg -i soundcontrol_amd64.deb
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

### Requirements
- Rust toolchain
- Node.js 18+
- Bluetooth enabled on your system

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute.

## 📄 License

[MIT License](LICENSE)

## 🔒 Security

See [SECURITY.md](SECURITY.md) for our security policy.

## 📋 Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 🙏 Acknowledgments

- [OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30) - Device protocol research
- [Tauri](https://tauri.app/) - Rust desktop framework
- [bluer](https://gitlab.bareos.com/bluer/bluer) - Linux Bluetooth library

---

**Soundcore/Anker devices only — no CMF/Nothing support.**

Made with ❤️ by Shankers8811