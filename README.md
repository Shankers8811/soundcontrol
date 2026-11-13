# SoundControl

Native desktop companion app for **Anker/Soundcore** devices. Built with **Rust + Tauri v2** for Windows and Linux.

## 🎯 Purpose

This app is built for desktop users who want to control their Soundcore earbuds and headphones from Windows or Linux. The mobile app doesn't allow certain features (like single earbud mode with full functionality), so this desktop app fills that gap.

## 📱 Supported Devices (Soundcore/Anker Only)

This app exclusively supports **Anker/Soundcore** devices. No CMF/Nothing or other brands are supported.

### Earbuds
- Soundcore Life P2, P2 Mini, P3, P3i, P3iS, P3 NC, P3i NC
- Soundcore Liberty 3 Pro, Liberty 4, Liberty 4 NC
- Soundcore Liberty Air 2
- Soundcore Life A2 NC, Life A3i
- Soundcore AeroFit, AeroFit Pro
- Soundcore V30i
- Soundcore Sport X10, Sport X20
- Soundcore P20i, P30i, P40i
- Soundcore R50i, R50i NC, R100, R20i, R30i, R40i
- Soundcore Vortex
- Soundcore Sleep A10, Sleep A20
- Soundcore Space A40, Space A40 NC
- Soundcore Dot 2, Dot R

### Speakers
- Soundcore Motion+, Motion Boom, Motion X600, Motion X500, Motion X300

## 🚀 Features

| Feature | Description |
|---------|-------------|
| 🔊 **ANC Control** | Active Noise Cancellation modes (Off/Low/Mid/High) |
| 🌬️ **Transparency** | Hear your surroundings |
| 🌪️ **Wind Noise** | Wind noise reduction |
| 🎮 **Game Mode** | Low latency gaming mode |
| 📡 **LDAC** | High-res audio codec |
| 🔗 **Multipoint** | Connect to multiple devices |
| 🎵 **8-Band EQ** | Custom equalizer with presets |
| 🔋 **Battery Monitor** | Per-earbud battery levels (L/R/Case) |
| 🎯 **Feature Gating** | Unsupported features are disabled per device |
| 🔑 **Global Hotkeys** | Ctrl+Alt+N (ANC), Ctrl+Alt+G (Game), Ctrl+Alt+E (EQ) |
| 📊 **Diagnostics** | Frame logging and export |
| 🎨 **Dark/Light Theme** | System theme support |

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (React + TypeScript + Tailwind)│
│         UI Layer (WebView)              │
└─────────────────────────────────────────┘
                    │ Tauri IPC
┌─────────────────────────────────────────┐
│  Backend (Rust 100%)                    │
│  • Bluetooth (WinRT/BlueZ)              │
│  • Soundcore CMF Protocol               │
│  • SQLite Database                      │
│  • Background Tasks                     │
└─────────────────────────────────────────┘
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

## 🔒 Privacy & Security

- All data is stored locally on your device
- No cloud services or telemetry
- Bluetooth communication is direct device-to-device
- Open source under MIT License

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30) - Device protocol research
- [Tauri](https://tauri.app/) - Rust desktop framework
- [bluer](https://gitlab.bareos.com/bluer/bluer) - Linux Bluetooth library
