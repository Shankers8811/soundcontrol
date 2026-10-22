# Parity research: model coverage and pairing

Date: 2026-10-22. Scope: the two open must-haves in `replica/parity.md` that need
external facts rather than code changes — **support for all current models** and
**device discovery / pairing**. Everything below is cited; nothing here was
tested against hardware.

## 1. The five SKUs missing from our registry

These codes appear in the Soundcore 6.4.0 APK's per-SKU animation assets
(`docs/APK-6.4.0-INVENTORY.md`) but are absent from `src/protocol/`.

| SKU | Product | Evidence | Confidence | Protocol evidence |
|---|---|---|---|---|
| A3927 | Soundcore Life A1 | Anker support page titles it "A3927 Life A1" throughout its documents and videos ([service.soundcore.com](https://service.soundcore.com/article-description/How-do-I-power-the-earbuds-on-and-off-for-A3927)) | High (first-party) | None found |
| A3944 | Soundcore Life P2 Mini | OpenSCQ30 device table ([README](https://github.com/Oppzippy/OpenSCQ30)), **plus a full implementation**: `lib/src/devices/soundcore/a3944.rs` with `ButtonConfigurationModule` and `EqualizerModule` | High | **Available to mirror** |
| A3958 | Soundcore A30i | OpenSCQ30 faker fixture `tools/soundcore-device-faker/devices/a3958.toml`, which also records its RFCOMM UUID and a real state packet | Medium (third-party fixture) | Partial (one state packet) |
| A3937 | unknown | None — not in OpenSCQ30, no text occurrence in the APK | — | None |
| A3943 | unknown | None — not in OpenSCQ30, no text occurrence in the APK | — | None |

### What this changes

- **A3944 is the only real coverage win available.** It is not catalog filler: a
  reference implementation exists, including the exact modules we ship (equalizer
  and button configuration). Adding it means porting a known layout, not guessing.
- **A3958 (A30i)** could be added as identity + universal reads only. Its faker
  fixture gives a sample `[1,1]` state update, but one packet is not a layout.
- **A3927 (Life A1)** is a 2021-era product with no equalizer module in any
  reference implementation and no evidence of a `02:8x` EQ command. It belongs in
  a catalog as identity-only if we want it at all, and it is likely no longer
  `current`.
- **A3937 and A3943 stay out.** No name, no layout, no capture. Adding them would
  mean inventing both.

## 2. Pairing: what the platforms actually allow

### Windows

Windows exposes pairing through WinRT `Windows.Devices.Enumeration`:
`DeviceInformation.Pairing.Custom` returns a `DeviceInformationCustomPairing`,
and `PairAsync(DevicePairingKinds.ConfirmOnly)` performs the ceremony
([Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/develop/devices-sensors/pairing-a-set)).

The important finding is **set pairing**. Earbuds present as more than one
endpoint, and Windows documents `PairingSetMembersRequested` explicitly for that
case — "a simple example might be a set of wireless earbuds. As the first
earbud's pairing is finalized, the device informs the PC that there's a second
device to pair as part of the set." The same page warns that **without a
set-member handler the protocol stack will not attempt to enumerate the members
of a pairing set**, which is precisely the failure mode that leaves one earbud
unpaired.

Caveat for this app: those are WinRT APIs, which Electron cannot call directly
from JavaScript. They do not need a native addon though — the bridge is already
Python, and `officiallor/soundcore-windows` drives WinRT RFCOMM from Python
(`winrt-Windows.Devices.Bluetooth`). See `docs/ECOSYSTEM-RESEARCH.md` §2.1, which
revises this item from L to M.

### Linux

BlueZ pairs over D-Bus with an `org.bluez.Agent1` implementation
(`Pair`, `Cancel`, `RequestConfirmation`, `AuthorizeService`), driven today by
`bluetoothctl`. The existing bridge already shells out to `bluetoothctl` and
therefore inherits BlueZ's policy — including the fact that an agent must be
registered before `Pair()` will complete.

## 3. Recommended build order

| # | Item | Size | Why |
|---|---|---|---|
| 1 | **A3944 (Life P2 Mini) profile** | M | The only SKU with both a name and a reference layout; exercises the registry with real evidence instead of adding catalog rows |
| 2 | **Feature-conflict rules** (Custom EQ vs Spatial vs Gaming vs LDAC) | S | Already next in `parity.md`; UI-only, no protocol risk |
| 3 | **A3958 (A30i) identity + universal reads** | S | Recognises the device honestly without claiming control |
| 4 | **Windows set-pairing helper** | M | WinRT from the existing Python bridge: paired-device enumeration, RFCOMM service discovery, then the set-member handler (see `docs/ECOSYSTEM-RESEARCH.md` §2.1) |
| 5 | **Linux pairing via BlueZ agent** | M | Registering an agent around the existing `bluetoothctl` path |

## 4. What this research did not establish

- No packet captures for any of the five SKUs. A3944's layout comes from a
  third-party implementation, which is strong but still not our own capture; it
  must be labelled as ported evidence, not physical validation.
- No hardware testing. Nothing here proves any command works on a real device.
- A3937/A3943 remain unidentified; the APK carries no name for them.
