# Ecosystem research: how other Soundcore desktop projects work

Date: 2026-10-22. Survey of 36 GitHub repositories found by searching
`soundcore`, `anker soundcore`, `anker earbuds bluetooth`, `soundcore linux`
and `anker headphone control`. Purpose: find prior art worth copying, and
avoid re-solving problems others already solved.

Method: repositories and their source were read through the GitHub API. REA was
**not** used for this, because its own skill states it should be skipped for
"ordinary source-repository architecture analysis" — it applies to shipped
artifacts. See the last section for where REA does fit.

## 1. Landscape

| Project | Stars | Stack | Platforms | Notes |
|---|---|---|---|---|
| [Oppzippy/OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30) | 527 | Rust + Kotlin | Win/Linux/macOS/Android | The reference implementation. 30+ SKUs, per-device modules. Already cited by our `presets.ts`. |
| [gmallios/SoundcoreManager](https://github.com/gmallios/SoundcoreManager) | 183 | Rust (Tauri) | Windows | Battery, ANC, EQ. Only 3 models, "mostly tested". |
| [DamienStaebler/SoundcoreDesktop](https://github.com/DamienStaebler/SoundcoreDesktop) | 136 | Python | Desktop | Already a source for our EQ wire bytes. |
| [nnonickreal/openqore](https://github.com/nnonickreal/openqore) | 48 | Python/C | — | BES-chipset firmware patching. Out of scope: our policy bans OTA writes. |
| [JordanViknar/Noiseclapper-GNOME](https://github.com/JordanViknar/Noiseclapper-GNOME) | 18 | TypeScript | Linux | GNOME Shell extension; already cited. |
| [pamod-madubashana/SoundCore-Desktop](https://github.com/pamod-madubashana/SoundCore-Desktop) | 10 | Rust (Tauri) | Win/Linux | **Powered by OpenSCQ30.** Auto-restores profile on connect. |
| [CriticalRange/CoreSound](https://github.com/CriticalRange/CoreSound) | 6 | **Electron + Python** | Win/Linux | **Closest architecture to ours.** BlueZ D-Bus in the main process, Python RFCOMM helper. |
| [officiallor/soundcore-windows](https://github.com/officiallor/soundcore-windows) | 3 | Python | Windows | LDAC + multipoint via **WinRT** RFCOMM. |
| [CallMeTak/SoundCoreReversing](https://github.com/CallMeTak/SoundCoreReversing) | 4 | docs | — | HCI-snoop research on ANC modes for Liberty Air 2 Pro. |

Three observations:

1. **Our architecture is the common one.** CoreSound is Electron + a Python
   RFCOMM helper with JSON IPC over stdio — structurally the same as our
   `bridge.ts` + `soundcore_bridge.py`. That is independent validation, not a
   reason to change.
2. **Our model coverage is ahead.** SoundcoreManager ships 3 models, "mostly
   tested". We ship ~30 profiles with a model gate. Coverage is our advantage;
   it is also the thing `parity.md` correctly refuses to fake.
3. **Nobody in this list solves in-app pairing.** Everyone requires the device
   to be paired in the host OS first, exactly like us. So this is genuinely
   open ground, not a solved problem we are missing.

## 2. Actionable findings

### 2.1 Windows pairing is a Python problem, not an Electron problem

`soundcore-windows` drives RFCOMM entirely through WinRT from Python
(`winrt-Windows.Devices.Bluetooth`, `.Rfcomm`, `.Enumeration`, `.Networking`):

- `BluetoothDevice.from_bluetooth_address_async(mac_int)`
- `device.get_rfcomm_services_async()` → enumerate advertised RFCOMM services
- `StreamSocket()` → connect to the chosen service
- `get_device_selector_from_pairing_state(True)` → enumerate **paired** devices

This corrects the estimate in `PARITY-RESEARCH.md`, which assumed a native
Electron addon. Our bridge is already Python, so device enumeration, RFCOMM
service discovery and (with `DeviceInformationCustomPairing` invoked via a small
WinRT helper) pairing can all live in `soundcore_bridge.py`. That moves Windows
pairing from **L to M**.

It also offers a robustness win independent of pairing: our current transport
probes channels `4, 12, 15, 10, 30, 1` because Windows exposes no service
metadata through a raw `AF_BLUETOOTH` socket. WinRT can *ask* which RFCOMM
services exist, which would replace guess-and-probe with discovery.

### 2.2 Linux: reach BlueZ over D-Bus instead of shelling out

CoreSound's `src/bluez-backend.js` uses `dbus-next` against the system bus:

- `org.freedesktop.DBus.ObjectManager` → enumerate adapter and device paths
- `org.bluez.Adapter1` → `Powered`
- `org.bluez.Device1` → `Connected`, plus `Pair`/`Trust`
- RFCOMM still goes through a separate Python helper
  (`socket.AF_BLUETOOTH`, `SOCK_STREAM`, `BTPROTO_RFCOMM`, default channel 15)

For us the equivalent belongs in Python (`dbus-python`/`pydbus`) so the bridge
keeps one transport story. Benefits: reliable adapter/device state, no parsing
`bluetoothctl` text, and a place to call `Device1.Pair()` for the pairing
must-have.

### 2.3 Restore settings on connect (product idea)

`soundcore-windows`'s LDAC toggle works, but `SoundCore-Desktop` (pamod) has the
better product idea: it "restores your Soundcore device profile automatically
when the device connects, so your preferred gaming mode, ANC, and EQ settings
land without the phone app."

We already have per-model profiles and a `01:01` handshake on connect, so this is
a small addition with real user value: persist a per-device desired state and
replay it after identification succeeds. It must respect the model gate — replay
only commands the profile supports.

### 2.4 Two honesty items worth documenting

- **Windows has no LDAC encoder.** `soundcore-windows` requires a third-party
  "Alternative A2DP Driver" for actual LDAC audio. Our app toggles the device
  side; the README should say plainly that the host still needs a codec, or
  users will report LDAC as broken.
- **ANC sub-modes are richer than on/off.** `SoundCoreReversing` documents
  Transport / Indoor / Outdoor / Custom for ANC, and Vocal Mode inside
  Transparency. Our `ancScene` already models scenes; this is a checklist to
  verify against, not a new feature.

## 3. What we deliberately should not copy

- **Firmware flashing** (openqore, `besota`): our policy treats OTA as
  read-only. Out of scope by design.
- **Guessed opcodes**: nobody above documents inventing frames, and our
  `PROTOCOL.md` is right to refuse.
- **Single-model shortcuts**: SoundcoreManager's 3-model support is simpler, but
  our model gate is the feature that keeps a wrong payload off someone's
  hardware.

## 4. Where REA actually fits

REA is the wrong tool for reading these sources, but it is the right tool for
their **released binaries**, which source does not account for:

- CoreSound and SoundCore-Desktop publish AppImage/deb/exe builds. `inspect_artifact`
  and `inspect_electron_fuses` work today (no analysis engine needed). Those show
  whether a shipped build matches its source, which bundled protocol version it
  carries, and what fuses an Electron build ships with.
- Native `.exe` decompilation would need Ghidra, which is not configured here
  (`GHIDRA_INSTALL_DIR` unset), so that path is unavailable.

## 5. Recommended order

| # | Item | Size | Source of the idea |
|---|---|---|---|
| 1 | WinRT RFCOMM in the bridge: service discovery + paired-device enumeration | M | soundcore-windows |
| 2 | BlueZ D-Bus device/adapter state in the bridge | M | CoreSound |
| 3 | Restore per-device settings on connect | S | SoundCore-Desktop |
| 4 | Document the Windows LDAC codec requirement | XS | soundcore-windows |
