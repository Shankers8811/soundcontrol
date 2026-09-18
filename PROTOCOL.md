# SoundControl protocol

SoundControl talks to already-paired Soundcore hardware over **Classic
Bluetooth RFCOMM** with the exact frames the official apps use. The Windows
desktop renderer reaches RFCOMM through the bundled local Python helper
(`soundcore_bridge.py`); Android BLE captures are decode-only reference
material (Appendix A).

Everything below cites where each fact comes from. Wherever a claim is
captured live on real hardware, the source project is named;
[OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30) is the authoritative
per-model reference and the other projects cross-check it with their own
captures. `scripts/verify-protocol.mjs` rebuilds every frame this app sends
and compares it byte-for-byte against those captures; it runs as part of
`npm run build` and fails on any drift.

Service UUID (when advertised): `0cf12d31-fac3-4553-bd80-d6832e7d1402` —
the last nibble pair is the model id, so `…34fb` is the generic SPP UUID and
**not** the DSP service on Liberty-family units.

## Frame

```
offset  bytes   meaning
0       08      host → device   (device → host is 09)
1       EE      host magic      (device magic is FF)
2–4     00 00 00
5       cat     command family
6       type    command
7–8     len     total frame length, u16 little-endian (= 10 + payload length)
9…      payload
last    Σ       additive checksum, sum of every preceding byte mod 256
```

So a 20-byte frame has `len = 0x14`, a 32-byte frame `0x20`. Verified against
OpenSCQ30 `common/packet.rs` (`body_length = length − 5 − 2 − 2 − 1`) and
against every capture below.

### Checksum

```
cs = bytes[0] + bytes[1] + … + bytes[n-2]   (mod 256)
bytes[n-1] == cs
```

## Reads every supported model implements

| Command | Response payload | Source |
|---|---|---|
| `01:01` | full state update; **layout differs per model**, see "State offsets" | OpenSCQ30 `request_state.rs` |
| `01:03` | live battery: byte0 left, byte1 right (TWS) or one level (over-ear); `0xFF` = side not connected | OpenSCQ30 `request_battery_level.rs` |
| `01:04` | charging flag(s) | OpenSCQ30 `request_battery_charging.rs` |
| `01:05` | 10 ASCII bytes firmware (`XX.XX` + `XX.XX`) then 16 ASCII bytes serial | OpenSCQ30 `request_serial_number_and_firmware_version.rs` |

SoundControl sends `01:01` (handshake), `01:05` and `01:03` on every connect
and re-polls `01:03` every 30 s while a real device is attached. Firmware and
serial are read from `01:05`, because the `01:01` blob layout differs per
model — no more fabricated version strings.

Handshake (also OpenSCQ30's `STATE_COMMAND`):

```
08 EE 00 00 00 01 01 0A 00 02
```

## State-update offsets per model

Payload offsets inside the `01:01` body, from OpenSCQ30's per-model
`packets/inbound/state_update.rs`:

| Field | P30i / R50i NC (A3959) | Liberty 4 NC (A3947) | P20i family (A3949) |
|---|---|---|---|
| left battery (0..10 / 0..5 steps) | 2 | 2 | 2 |
| right battery | 3 | 3 | 3 |
| charging flags | 4, 5 | 4, 5 | 4, 5 |
| case battery | — | 139 | — |
| firmware ASCII | 6 (10) | 6 (10) | 6 (10) |
| serial ASCII | 16 (16) | 16 (16) | 16 (16) |
| EQ preset u16LE / bands | 32 / 34 (10) | 37 / 39 (10) | 32 / 34 (10) |
| sound-mode block start | 64 | 126 | — (no module registered) |

These are the sums of OpenSCQ30's `nom` parse chains (tws 2 + battery 4 +
firmware 10 + serial 16, then per-model blocks: A3959 eq 12 + unknown 10 + 1
+ buttons 8 + cycle 1 = 64; A3947 unknown 5 + eq 22 + 1 + hear_id 48 + 1 +
buttons 16 + cycle 1 = 126, case battery 6 bytes later at 139). Liberty 3
Pro (A3952): sound modes at 120, case battery at 129.

The case offsets are kept as wire facts, but SoundControl deliberately never
**displays** a case level: several Soundcore models do not report one (the
official app hides it there as well) and over-ears have no case, so a visible
number would mostly be a guess.

Over-ears (Q30 / Q35 / Life Tune / Space One / Space Q45) use
`single_battery(5)`: one 0..5 level at offset 2; their other offsets are not
published byte-for-byte, so SoundControl reads battery only and takes
firmware/serial from `01:05` on every model.

`0xFF` in a battery slot means *that side is not connected to the host* — it
is availability, not a zero-percent reading.

## Sound modes — `06:81`

Four different payload layouts share this one command; sending the wrong one
silently sets the wrong state, so SoundControl keys the layout by SKU.

### `classic` — Life Q30 / Q35 / Life Tune / Space One / Space Q45 (4 bytes)

```
08 EE 00 00 00 06 81 0E 00  [mode]  [nc_scene]  [transparency]  [custom_nc]  [cs]
```

| mode | `00` ANC · `01` Transparency · `02` Normal |
|---|---|
| nc_scene | `00` Transport · `01` Outdoor · `02` Indoor (carried in every mode) |
| transparency | `00` fully transparent · `01` vocal / talk mode |

Worked examples (byte-identical in OpenSCQ30 `set_sound_modes.rs` unit tests
**and** in the live frames of Noiseclapper-GNOME / SoundcoreDesktop):

```
ANC transport    08 EE 00 00 00 06 81 0E 00 00 00 01 00 8C
ANC outdoor      08 EE 00 00 00 06 81 0E 00 00 01 01 00 8D
ANC indoor       08 EE 00 00 00 06 81 0E 00 00 02 01 00 8E
Transparency     08 EE 00 00 00 06 81 0E 00 01 01 01 00 8E
Normal           08 EE 00 00 00 06 81 0E 00 02 01 01 00 8F
```

### `tws-p30i` — P30i / R50i NC (A3959) (7 bytes)

From OpenSCQ30 `a3959/structures/sound_modes.rs`:

```
0  ambient      00 NC · 01 Transparency · 02 Normal
1  (manual << 4) | adaptive     manual 1–5, adaptive 0–5
2  ambient again
3  automation   00 Manual · 01 Adaptive · 02 Multi-scene
4  wind         bit0 suppression · bit1 wind-detected (read-only)
5  adaptive sensitivity
6  multi-scene scene            00 Transport · 01 Outdoor · 02 Indoor
```

This model has **no transparency sub-mode byte** (OpenSCQ30 changelog:
"R50i NC should not have transparency modes"), so the app hides that option.

### `tws-l4nc` — Liberty 4 NC (A3947) (7 bytes)

From OpenSCQ30 `a3947/structures.rs`:

```
0  ambient
1  (manual << 4) | adaptive
2  transparency   00 fully · 01 vocal
3  automation     00 Manual · 01 Adaptive · 02 Transportation
4  wind
5  environment detection
6  transportation 00 Plane · 01 Train · 02 Bus · 03 Car
```

### `tws-l3pro` — Liberty 3 Pro (A3952) (6 bytes)

```
[ambient, (manual<<4)|adaptive, transparency, automation, wind, unknown]
```

The device answers sound-mode changes with a `06:01` report of the same
block; SoundControl mirrors that report back into the UI so a level changed
from the phone app shows up correctly.

## Equalizer

Bands: **100, 200, 400, 800 Hz, 1.6, 3.2, 6.4, 12.8 kHz**, wire byte
`120 + dB×10`, `0x78` = 0 dB. Preset id is a **u16 little-endian** — that is
why every factory preset looks like `NN 00` on the wire. Custom curves use
`FE FE` (captured in SoundcoreDesktop `EQGain()`, OpenSCQ30 `set_equalizer`
test, Space 2 HCI snoop).

Three EQ commands exist in the wild, and a model accepts exactly one:

### `02:81` — classic over-ears (`common_settings()` models)

```
08 EE 00 00 00 02 81 14 00  [preset u16LE]  [8 band bytes]  [cs]
```

Unit-tested in OpenSCQ30 and byte-identical in SoundcoreDesktop +
Noiseclapper captures.

### `02:83` — P20i / P25i / R50i / P30i / A20i (`equalizer_with_drc_tws`)

```
08 EE 00 00 00 02 83 20 00  [preset u16LE]  [10 raw band bytes]  [10 DRC band bytes]  [cs]
```

The second channel is **not** a copy: it is the raw curve passed through the
DSP's cross-band compensation matrix (OpenSCQ30
`volume_adjustments.rs::apply_drc`, ported to `src/protocol/drc.ts`).
SoundControl's DRC port reproduces all 22 live P20i captures from
victor-oliveira1/soundcore_anker_equalyzer **byte for byte** — see
`scripts/verify-protocol.mjs`.

### `03:87` — Liberty 4 NC / Space One / Space Q45: **not implemented on purpose**

This frame embeds each model's HearID block (personalised curves, genre
bytes, per-channel DRC tails) and its layout differs per model. No labelled
public capture exists for the supported models, and a guessed payload risks
**overwriting the hearing profile the phone app measured**. SoundControl
therefore disables the EQ UI for those SKUs and says so in-app; use the
Soundcore app for their EQ.

### Preset table

All 22 factory curves, one table, three independent sources agreeing exactly
(SoundcoreDesktop live frames, Noiseclapper live frames, mervin008's Space-2
HCI snoop). The app ships them with the wire bytes verbatim; dB values are
derived, never hand-typed.

| id | name | bands dB |
|---|---|---|
| 00 | Soundcore Signature | 0 0 0 0 0 0 0 0 |
| 01 | Acoustic | +4 +1 +2 +2 +4 +4 +4 +2 |
| 02 | Bass Booster | +4 +3 +1 0 0 0 0 0 |
| 03 | Bass Reducer | −4 −3 −1 0 0 0 0 0 |
| 04 | Classical | +3 +3 −2 −2 0 +2 +3 +4 |
| 05 | Podcast | −3 +2 +4 +4 +3 +2 0 −2 |
| 06 | Dance | +2 −3 −1 +1 +2 +2 +1 −3 |
| 07 | Deep | +2 +1 +3 +3 +2 −2 −4 −5 |
| 08 | Electronic | +3 +2 −2 +2 +1 +2 +3 +3 |
| 09 | Flat | −2 −2 −1 0 0 0 −2 −2 |
| 0A | Hip-Hop | +2 +3 −1 −1 +2 −1 +2 +3 |
| 0B | Jazz | +2 +2 −2 −2 0 +2 +3 +4 |
| 0C | Latin | 0 0 −2 −2 −2 0 +3 +5 |
| 0D | Lounge | −1 +2 +4 +3 0 −2 +2 +1 |
| 0E | Piano | 0 +3 +3 +2 +4 +5 +3 +4 |
| 0F | Pop | −1 +1 +3 +3 +1 −1 −2 −3 |
| 10 | R&B | +6 +2 −2 −2 +2 +3 +3 +4 |
| 11 | Rock | +3 +2 −1 −1 +1 +3 +3 +3 |
| 12 | **Small Speakers** | +4 +3 +1 0 −2 −3 −4 −4 |
| 13 | Spoken Word | −3 −2 +1 +2 +2 +1 0 −3 |
| 14 | Treble Booster | −2 −2 −2 −1 +1 +2 +2 +4 |
| 15 | Treble Reducer | 0 0 0 −2 −3 −4 −4 −6 |

Two notes on that table:

* Preset `0x12` is **Small Speaker(s)** in every capture. An earlier build of
  this app mislabelled it "Vocal Booster", which is not a Soundcore preset.
* The P20i HCI capture has one documented divergence: its Rock frame carries
  bands 6–8 as `A0 AA` (+4 +5) instead of the three-source consensus
  `96 96 96`. SoundControl keeps the consensus and `verify-protocol.mjs`
  pins both facts.

## Toggles

| Feature | Frame | Source |
|---|---|---|
| Gaming / low latency | `01:87 [01/00]` common; `10:85` on Liberty 4 NC / Liberty 5 | OpenSCQ30 `SET_GAMING_MODE_COMMAND`, `a3947/modules/flag.rs` |
| 3D Surround Sound | `02:86 [01/00]` | OpenSCQ30 `SET_SURROUND_SOUND_COMMAND` |
| Dual connection | `0B:84 [01/00]` | OpenSCQ30 `dual_connections.rs` |
| LDAC query / set | `01:7F` / `01:FF [codec, on]` | OpenSCQ30 `REQUEST_LDAC_STATE_COMMAND` |
| Factory reset | `01:85` | OpenSCQ30 (Motion+ A3116); offered with a warning |
| ~~Find My Device~~ | — | **no capture and no OpenSCQ30 command; removed** (the `01:88` frame never existed) |
| ~~BassUp~~ | — | **no command in any source; UI toggle removed** |

## RFComm channels and the connect handshake

The DSP channel is model-dependent: **4** on most earbuds, **10** on the P20i
family (victor-oliveira1), **12** on Life Q30-class over-ears
(Noiseclapper/SoundcoreDesktop), **15** on some headless captures
(CoreSound), **30** on Space 2 (soundcorebridge).

Accepting a socket is *not* proof the channel is the DSP: hands-free and
A2DP control profiles accept RFCOMM connections and then never answer —
exactly the "Connected but no battery / no ANC" failure. So `soundcore_bridge.py`
probes each candidate with the `01:01` handshake and adopts the **first
channel that answers with a valid `09 FF` frame**. If nothing answers it falls
back to the first accepting socket, logs the condition together with the
refused channels (visible in `%AppData%\soundcontrol\main.log` on Windows,
mirrored to the in-app diagnostics log), and arms an 8 s silent-link watchdog:
the watchdog names the fake-"Connected" state, then keeps re-sending the
read-only handshake in the background. When the single control slot frees up
(the Soundcore phone app closes) and the device finally answers, the bridge
announces "battery and ANC are live now" — no manual reconnect needed.

Channels **12/13** on some families are TOTA/BESOTA firmware-flash channels
and **16** is Apple iAP2; soundcorebridge hard-blocks them. The probe only
sends a read-only state request and never probes 13/16.

Operational rules borrowed from soundcorebridge (all observed behaviour):

* **One control client at a time** — the phone app holding the slot makes
  the headset drop new clients. Close it (or switch the phone's Bluetooth
  off) before connecting.
* **SPP slot exhaustion** — abandoned channels make the headset accept and
  immediately drop connections until power-cycled; the bridge always closes
  its sockets.
* Earbuds must stay *connected* in Windows Bluetooth settings (audio can be
  playing); "pairing mode" is the wrong state and the error text says so.

## Model table (what each SKU really supports)

From OpenSCQ30's device definitions and i18n names; `verified` in
`src/protocol/devices.ts` marks rows with at least one published capture.

| SKU | Models | family | ANC layout | EQ | gaming | ldac | dual | surround | battery |
|---|---|---|---|---|---|---|---|---|---|
| A3959 | P30i / R50i NC | tws | tws-p30i | 02:83 | yes | no | yes | yes | 0..10 |
| A3949 | P20i / P25i / R50i | tws | none | 02:83 | yes | no | no | no | 0..5 |
| A3948 | A20i | tws | none | 02:83 | no | no | no | no | 0..5 |
| A3947 | Liberty 4 NC | tws | tws-l4nc | — (03:87) | yes | no | no | yes | 0..5 + case |
| A3952 | Liberty 3 Pro | tws | tws-l3pro | — (HearID) | no | yes | no | no | 0..5 + case |
| A3035 | Space One | classic | classic | — (03:87) | no | yes | yes | no | 0..5 |
| A3040 | Space Q45 | classic | classic | — (03:87) | no | yes | yes | no | 0..5 |
| A3027 | Life Q35 | classic | classic | 02:81 | no | no | no | no | 0..5 |
| A3028 | Life Q30 | classic | classic | 02:81 | no | no | no | no | 0..5 |
| A3029 | Life Tune | classic | classic | 02:81 | no | no | no | no | 0..5 |

SKU traps worth knowing: **A3959 is both the P30i and the R50i NC** while
**A3949 is the R50i without NC** — matching by name alone attaches the wrong
sound-mode layout, so the app ranks aliases longest-first. Liberty 4 (A3953),
Sport X10 (A3961) and Sleep A10 (A6610) have **no** OpenSCQ30 profile, and an
approximate marketing name is not evidence — Liberty 4 (A3953) is a different
product from Liberty 4 NC (A3947). These names therefore resolve to the
unknown-model profile (protocol-universal reads only: firmware/serial and
earbud presence, never battery percentages or model-specific controls) and
the UI explains why. If a capture ever verifies one of these layouts, it gets
promoted to a full profile row with its own evidence — not a resolves-to
fallback.

## Appendix A — Android BLE captures (decode-only reference)

The Windows app does **not** use BLE: Electron has no reliable Web Bluetooth
stack on Windows, and the bundled helper reaches hardware over RFCOMM. This
appendix exists so Android captures can be decoded in the diagnostics console
(**Diagnostics → Base64 capture → hex**).

GATT endpoints seen on Soundcore BLE captures:

| Role | UUID |
|---|---|
| Primary service | `0000ab00-0000-1000-8000-00805f9b34fb` (alt `0000ff00-…`) |
| TX (write) | `0000ab01-0000-1000-8000-00805f9b34fb` |
| RX (notify) | `0000ab02-0000-1000-8000-00805f9b34fb` |

Simplified BLE frame (captures only — never send over RFCOMM):

```text
08 EE | cmd (1B) | len (1B) | payload | XOR checksum (1B)
```

| BLE cmd | Meaning | RFCOMM equivalent SoundControl sends |
|---|---|---|
| `0x61` telemetry request | Device state | `01:01` + `01:05` + `01:03` |
| `0x06` ANC toggle | Ambient mode | `06:81` per-model layout |
| `0x01` EQ bands | Equalizer | `02:81` / `02:83` per model |

`src/protocol/ble.ts` implements `buildBlePacket` / `parseBlePacket` /
`describeBlePacket`; the HexConsole shows both Σ and XOR validity so a pasted
capture is never misread as the wrong transport. Base64 → hex:
`base64ToHex(pastedBlob)`.

## Appendix B — sources surveyed

Used for the fixes in this document: Oppzippy/OpenSCQ30 (authoritative per-
model definitions), mervin008/soundcorebridge (Space-2 HCI traces, 22 EQ
curves, operational notes), DamienStaebler/SoundcoreDesktop and
JordanViknar/Noiseclapper-GNOME (live RFCOMM frame tables),
victor-oliveira1/soundcore_anker_equalyzer (22 live `02:83` captures,
channel 10), thetahmeed/SoundX (Liberty 5 framing),
CriticalRange/CoreSound (TWS 06:81 template, battery offsets),
CallMeTak/SoundCoreReversing (HCI method). Checked, nothing to take:
soundcored, dumpforq45, flip-dots/SolixBLE, tacshi/Soundcore,
andrewseago/d3200-ble-note-downloader, Weldawadyathink/soundcore-utilities
(Sleep A30 GATT, different family), BastionPinnacle/soundcore.
