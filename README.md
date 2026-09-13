# SoundControl [unofficial]

<p align="center">
  <img src="public/icon-512.png" width="128" height="128" alt="SoundControl">
</p>

<p align="center">
  <b>Desktop companion for Anker soundcore earbuds and headphones.</b><br>
  ANC, EQ, HearID, game mode — in the browser. No Anka. No official app.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Brave-lightgrey" alt="Chromium">
  <img src="https://img.shields.io/badge/Anka-not%20included-success" alt="No Anka">
</p>

Not affiliated with Anker or soundcore. Independent reverse-engineered companion, in the same spirit as [ear (web)](https://github.com/radiance-project/ear-web) for Nothing earbuds.

## Live app

1. Use **Chrome, Edge, or Brave** (version 117+) on a **computer**
2. Open **[this link](https://YOUR_GITHUB_USERNAME.github.io/soundcontrol/)** after you publish (see [PUBLISH.md](PUBLISH.md))
3. **Add Device → Search** and tap your soundcore  
   or **Try the demo** if you have no buds connected

iPhone Safari cannot connect hardware. Firefox cannot. The site must be opened as its **own tab**, not inside another website.

## Compatible devices

Tested against the public soundcore RFCOMM / BLE command set:

**Earbuds**

- soundcore R50i NC (A3949)
- P30i (A3959)
- P20i / P25i
- Liberty 4 NC
- Liberty 3 Pro

**Headphones**

- Life Q30
- Life Q35
- Space Q45
- Life Tune

Not every model supports every toggle (game mode, LDAC, dual connection, ANC levels vs indoor/outdoor scenes). The UI hides what the selected profile does not have.

## Features

- Battery (left / right / case)
- Hardware ANC: max, adaptive, transparency, normal
- Manual ANC levels 1–5 and Q30-style scenes
- 8-band EQ (100 Hz–12.8 kHz) and 20+ soundcore-style presets
- HearID-style tone test (not an AI chatbot)
- Game / low-latency mode
- Dual connection and LDAC on supported units
- Gesture remap, wear detection, find device, safe volume
- Optional RFCOMM helper (`soundcore_bridge.py`) for Classic Bluetooth ANC
- PWA install and Electron wrapper
- No Anka, no Insight, no AI chat

## How connection works

| Path | What you do | What you get |
|------|-------------|--------------|
| Web Bluetooth | **Search** in Chrome/Edge/Brave | Device picker, battery, some EQ |
| Demo | **Try the demo** | Full UI without hardware |
| RFCOMM bridge | Run `python3 soundcore_bridge.py` on the same PC | Exact DSP packets (ANC) |

Web Bluetooth cannot always drive ANC. Official soundcore apps send those frames over Classic Bluetooth RFCOMM (often channel 4). The Python helper is optional and has **zero pip packages**.

## Run from source

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

```bash
python3 soundcore_bridge.py --port 8765 --channel 4
```

## Publish

GitHub builds the public site for you. Follow **[PUBLISH.md](PUBLISH.md)** — written for people who have never used GitHub.

After Pages is live, replace `YOUR_GITHUB_USERNAME` in this README with your username.

## Contributing

Bug reports and new device notes are welcome. Use GitHub **Issues** (templates included). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Protocol

Frame layout, checksums, and known opcodes: [PROTOCOL.md](PROTOCOL.md).

## Legal

MIT License. See [LICENSE](LICENSE).

SoundControl is **not** affiliated with, sponsored by, or endorsed by Anker Innovations Limited or soundcore. Product names and images are used only to describe compatible hardware. Use at your own risk. Reverse-engineered commands can differ by firmware.

## Credits

- Public research: OpenSCQ30, SoundcoreLifeAPI, CoreSound, and related RFCOMM dumps
- UI modelled on the official soundcore Android companion **without** Anka
