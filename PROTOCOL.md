# SoundControl protocol

Soundcore companion traffic is a thin binary framing layer over **Classic Bluetooth RFCOMM**.
Web Bluetooth (BLE GATT) can read the standard Battery service and sometimes a vendor
characteristic, but **ANC is not accepted on GATT** on the units we care about. The DSP
socket is RFCOMM — commonly **channel 4** (buds), **12** or **15** (some over-ears).

Service UUID (when advertised): `0cf12d31-fac3-4553-bd80-d6832e7b3947`

Do **not** use the generic Serial Port Profile UUID `00001101-0000-1000-8000-00805f9b34fb`
if the vendor UUID is present — it returns garbage on several Liberty units.

## Frame

```
offset  bytes   meaning
0       08      host → device   (device → host is 09)
1       EE      host magic      (device magic is FF)
2–4     00 00 00
5       cat     command family
6       type    command
7…      payload
last    Σ       additive checksum, sum of every preceding byte mod 256
```

Some firmware families (newer TWS) insert a little-endian `total_len` at bytes 7–8 where
`total_len = 10 + payload_len` and the checksum still covers everything except itself.

Commands captured from the official Android app start `08 EE`. Responses start `09 FF`.

### Checksum

```
cs = bytes[0] + bytes[1] + … + bytes[n-2]   (mod 256)
bytes[n-1] == cs
```

Example — handshake:

```
08 EE 00 00 00 01 01 0A 00 | 02
8 + 238 + 1 + 1 + 10 = 258 = 0x102 → 02
```

## Handshake

```
08 EE 00 00 00 01 01 0A 00 02
```

Must be the first write after the RFCOMM socket is up. The device answers with a
`09 FF … cat=01 type=01` info blob. On TWS firmware, left / right / case battery often
sit at payload offsets 40 / 41 / 42 (values `0…100`).

## ANC — Life Q30 / Q35 / Space Q45 / Life Tune (`classic`)

```
08 EE 00 00 00 06 81 0E 00  [mode]  [scene]  01 00  [cs]
```

| mode | meaning        |
|------|----------------|
| 00   | ANC on         |
| 01   | Transparency   |
| 02   | Normal / off   |

| scene | meaning    |
|-------|------------|
| 00    | Transport  |
| 01    | Outdoor    |
| 02    | Indoor     |

Worked examples (checksum included):

```
ANC outdoor     08 EE 00 00 00 06 81 0E 00 00 01 01 00 8D
ANC indoor      08 EE 00 00 00 06 81 0E 00 00 02 01 00 8E
ANC transport   08 EE 00 00 00 06 81 0E 00 00 00 01 00 8C
Transparency    08 EE 00 00 00 06 81 0E 00 01 01 01 00 8E
Normal          08 EE 00 00 00 06 81 0E 00 02 01 01 00 8F
```

## ANC — R50i NC / P30i / Liberty 4 NC (`tws`)

Layout used by SoundControl (level in the second payload byte):

```
08 EE 00 00 00 06 81 0E 00  [mode]  [level]  01  [cs]
```

Maximum ANC (level 5) as documented in the product brief:

```
08 EE 00 00 00 06 81 0E 00 01 05 01 A0
```

The trailing `A0` is the byte captured from a host dump. SoundControl also emits a
sum-mod-256 checksum for other levels so reverse-engineers can compare both.

`mode` 01 = ANC, 02 = transparency, 00 = off. `level` 1–5. Adaptive uses `level = 00`.

## 8-band equalizer

Bands, in order: **100, 200, 400, 800, 1.6k, 3.2k, 6.4k, 12.8k Hz**.

```
08 EE 00 00 00 02 81 14 00  [preset]  00  [b0…b7]  [cs]
```

Gain encoding: `byte = 120 + round(dB * 10)`, clamp 60…180. `0x78` is 0 dB.
Preset `00` is Soundcore Signature (flat 0x78). Custom curves use preset `EE`.

Signature (all zeros):

```
08 EE 00 00 00 02 81 14 00 00 00 78 78 78 78 78 78 78 78 4D
```

## Gaming / low-latency

```
08 EE 00 00 00 01 87 0C 00  [01 on / 00 off]  [cs]
```

Supported on Liberty 4 NC, Liberty 3 Pro, R50i NC, P30i, P20i / P25i.

## BassUp™ dynamic low-frequency boost

```
08 EE 00 00 00 02 82 0B 00  [01 on / 00 off]  [cs]
```

Applies dynamic DSP bass boost without altering the custom equalizer curve.

## 3D Spatial Audio / Surround Sound

```
08 EE 00 00 00 02 86 0A 00  [01 on / 00 off]  [cs]
```

Enables head-related transfer function (HRTF) spatial acoustic soundstage on Liberty 4 and Space One.

## Find My Device (Acoustic Beacon Alarm)

```
08 EE 00 00 00 01 88 0C 00  [Left: 01/00]  [Right: 01/00]  [cs]
```

Triggers high-amplitude 3.2 kHz acoustic locator chirps from the selected earbuds.

## Factory Reset

```
08 EE 00 00 00 01 85 0A 00  [cs]
```

Restores hardware to factory DSP calibration.

## LDAC & dual connection (Liberty 4 NC, Space Q45)

```
LDAC query     08 EE 00 00 00 01 7F 0A 00 80
LDAC enable    08 EE 00 00 00 01 FF 0B 00 01 02
LDAC disable   08 EE 00 00 00 01 FF 0B 00 00 01
Dual enable    08 EE 00 00 00 0B 84 0B 00 01 91
Dual disable   08 EE 00 00 00 0B 84 0B 00 00 90
```

A codec change typically forces an A2DP reconnect.

## Transports SoundControl implements

1. **Web Bluetooth** — `navigator.bluetooth.requestDevice`, Battery GATT `0x180F`, opportunistic write to vendor characteristics. ANC writes often fail here; that is expected.
2. **Web Serial** — virtual COM / SPP (`navigator.serial`).
3. **`soundcore_bridge.py`** — stdlib HTTP + WebSocket on `:8765`, `socket.AF_BLUETOOTH` / `BTPROTO_RFCOMM`.
4. **Simulator** — local ACK generator so the UI is usable without hardware.

## Target units

R50i NC (A3949), P30i (A3959), P20i / P25i, Liberty 4 NC, Liberty 3 Pro,
Life Q30, Life Q35, Space Q45, Life Tune.
