# R50i / R50i NC protocol — what this repository actually establishes

> **Phase 19 correction — user-reported ANC failure:** Android changes ANC
> physically on the same A3959; SoundControl does not, even during playback.
> “SUPPORTED” below describes third-party protocol evidence only, not working
> hardware. [Phase 19 audit](PHASE-19-ANC-AUDIT.md) supersedes the earlier
> claims of complete ANC correctness and documents byte-by-byte discrepancies,
> stateful transitions, independent response parsing and remaining unknowns.
> Physical validation remains PENDING (Phase 18 status B).


**Models:** Soundcore **R50i** (SKU **A3949**, also sold as P20i / P25i) and
Soundcore **R50i NC** (SKU **A3959**, also sold as P30i).

These are **different hardware with different capability sets**. Nothing
below is copied between them: every per-model fact cites its evidence, and
anything not established is marked **UNKNOWN — NOT VERIFIED** rather than
guessed from another Soundcore model.

**Evidence levels used in this document**

| Marker | Meaning |
|---|---|
| *(OpenSCQ30 a3949 / a3959)* | Read from the model's device definition in the [OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30) reverse-engineering project (`lib/src/devices/soundcore/a3949.rs`, `a3959.rs`, their `packets/inbound/state_update.rs`, `structures/sound_modes.rs`, and the i18n name table). Externally derived protocol knowledge, used as supporting evidence — SoundControl's implementation and safety boundaries are its own. |
| *(live capture)* | Frames captured from real hardware by a third-party project and reproduced byte-for-byte by `scripts/verify-protocol.mjs`. |
| *(implemented)* | Implemented in SoundControl and enforced by tests. |
| **UNKNOWN — NOT VERIFIED** | No evidence exists. Not implemented, not sent, not guessed. |

**Physical validation status: PENDING for everything in this document.** All
statuses are protocol-level (see `HARDWARE-VALIDATION.md` for the five-level
evidence ladder; nothing in the repository is above level 4). Run
`docs/R50I-R50I-NC-HARDWARE-TEST.md` on real hardware to promote them.

---

## 1. Identity

| | R50i | R50i NC |
|---|---|---|
| Commercial name | Soundcore R50i | Soundcore R50i NC |
| SKU | A3949 | A3959 |
| Also sold as | P20i, P25i | P30i |
| Name mapping source | *(OpenSCQ30 i18n)* `soundcore-a3949 = Soundcore P20i / P25i / R50i` | *(OpenSCQ30 i18n)* `soundcore-a3959 = Soundcore P30i / R50i NC` |
| Transport | Classic Bluetooth RFCOMM (DSP channel found by the bridge's handshake probe) | same |
| State-update payload | 67 bytes | 90 bytes |

Identification in SoundControl *(implemented)*: ranked **whole-token** name
matching (longest first, `R50i NC` outranks `R50i`; `R50iNC`/`XR50i` match
nothing; a name with two different models' tokens is ambiguous → unknown
profile), confirmed by the model-specific `01:01` state layout. When identity
cannot be established the model is **UNKNOWN**: only protocol-universal reads
run, no model-specific control is shown or sendable.

## 2. Frame format (both models)

```
08 EE 00 00 00 | cat | type | len u16 LE (= 10 + payload) | payload | Σ
```

Σ = sum of all preceding bytes mod 256. Device→host frames use `09 FF`.
Verified against OpenSCQ30 `common/packet.rs` and every capture in
`PROTOCOL.md`. *(implemented — every outbound frame is validated against the
command registry and the model gate before transmission; see
`src/protocol/targets.ts` and `src/protocol/modelRegistry.ts`.)*

## 3. `01:01` state update layout (both models)

*(OpenSCQ30 a3949/a3959 `packets/inbound/state_update.rs`)* — the layouts
DIFFER, which is itself identification evidence:

| Offset | A3949 (67-byte payload) | A3959 (90-byte payload) |
|---|---|---|
| 0–1 | TWS status | TWS status |
| 2 / 3 | battery left / right (**scale 0..5**, `0xFF` = absent) | battery left / right (**scale 0..10**) |
| 4 / 5 | charging flags L / R | charging flags L / R |
| 6–15 | firmware ASCII "XX.XX" ×2 | firmware ASCII ×2 |
| 16–31 | serial ASCII | serial ASCII |
| 32–33 | EQ preset id u16 LE | EQ preset id u16 LE |
| 34–43 | 10 EQ band bytes | 10 EQ band bytes |
| 44–54 | unknown(11) — **UNKNOWN — NOT VERIFIED** | unknown(10) — **UNKNOWN — NOT VERIFIED** |
| 55–62 | buttons(6 × 1 byte) | unknown(1) + buttons(8 × 1 byte) |
| 63–64 | unknown(4) | ambient_cycle(1) at 63 |
| 64–70 | — | **sound modes (7 bytes, §5)** |
| 65 | **gaming flag** | touch_tone 72, **dual flag 73**, **surround flag 74**, auto_power_off 75, low_battery_prompt 76 |
| 66 | touch_tone | **gaming flag 77** — only trustworthy when min(both firmware) ≥ **01.60** *(OpenSCQ30 firmware gate)* |
| 78–89 | — | unknown(12) — **UNKNOWN — NOT VERIFIED** |

*(implemented)*: a state frame shorter than the model's documented layout is
rejected whole (never partially parsed); gaming/surround/dual flags update
the UI as **device-confirmed** state where the model mirrors them; the A3959
gaming byte is ignored below firmware 01.60.

## 4. Command matrix

Status legend: **SUPPORTED** = protocol evidence + implemented + gated ON for
the model. **UNSUPPORTED** = evidence says the model lacks it — the model
gate refuses the frame even if the UI is buggy. Everything is
**PHYSICALLY_UNVERIFIED** until the hardware checklist runs.

| Command | CAT:TYPE | R50i A3949 | R50i NC A3959 | Evidence |
|---|---|---|---|---|
| State request | `01:01` | SUPPORTED | SUPPORTED | *(OpenSCQ30)* RequestState → state update |
| Battery query | `01:03` | SUPPORTED | SUPPORTED | *(OpenSCQ30)* dual_battery module |
| Charging query | `01:04` | SUPPORTED | SUPPORTED | charging flags in DualBattery |
| Serial + firmware | `01:05` | SUPPORTED | SUPPORTED | *(OpenSCQ30)* serial_number_and_dual_firmware_version |
| Sound modes (ANC/transparency/normal) | `06:81` | **UNSUPPORTED** | SUPPORTED | A3949 registers **no sound-modes module**; A3959 `a3959_sound_modes` |
| Equalizer | `02:83` | SUPPORTED (factory presets only) | SUPPORTED (+ custom `FE FE`) | *(OpenSCQ30)* equalizer_with_drc_tws; *(live capture)* 22 P20i factory-preset frames |
| Custom EQ curve | `02:83` preset `FE FE` | **UNSUPPORTED** | SUPPORTED | A3949 `custom_preset_id: None` ("device doesn't support custom presets"); A3959 `Some(0xfefe)` |
| Gaming mode | `01:87` | SUPPORTED | SUPPORTED | *(OpenSCQ30)* gaming_mode module |
| Dual connection | `0B:84` | **UNSUPPORTED** | SUPPORTED | A3959 dual_connections module |
| 3D Surround | `02:86` | **UNSUPPORTED** | SUPPORTED | A3959 surround_sound module |
| LDAC query / set | `01:7F` / `01:FF` | **UNSUPPORTED** | **UNSUPPORTED** | neither model registers an LDAC module |
| Factory reset | `01:85` | **UNSUPPORTED** | **UNSUPPORTED** | documented only for the Motion+ (A3116) speaker — never sent to these models |
| Game mode (A3947 variant) | `10:85` | **UNSUPPORTED** | **UNSUPPORTED** | Liberty 4 NC only |
| Classic EQ | `02:81` | **UNSUPPORTED** | **UNSUPPORTED** | the 02:81 command belongs to over-ear models |

## 5. A3959 sound modes — `06:81` (7-byte payload)

*(OpenSCQ30 a3959 `structures/sound_modes.rs` — this is the mandated proof
that the ambient-mode enum is not a generic guess)*:

```
byte 0  ambient sound mode:  0x00 = NoiseCanceling · 0x01 = Transparency · 0x02 = Normal
byte 1  (manual << 4) | adaptive   (manual 1..5; adaptive read-only, preserve report)
byte 2  ambient sound mode (repeated)
byte 3  ANC automation: 0x00 Manual · 0x01 Adaptive · 0x02 Multi-scene
byte 4  wind noise: bit0 suppression on/off (bit1 = "wind detected", read-only)
byte 5  independent adaptive sensitivity level 0..10 (preserve report)
byte 6  multi-scene ANC scene: 0x00 Transport · 0x01 Outdoor · 0x02 Indoor
```

- Transparency **sub-modes** (fully transparent vs vocal) do **not** exist on
  A3959 — the struct has no TransparencyMode field; the vocal toggle stays
  hidden. *(OpenSCQ30 changelog: "Soundcore R50i NC should not have
  transparency modes".)*
- **Response**: the device mirrors sound modes in the `01:01` state blob
  (offset 64) and in `06:01` reports; the UI treats the device report as the
  confirmed state (`parseSoundModes` rejects malformed mirrors).
- **Error behavior**: unknown to this repository — the device's behavior on a
  malformed `06:81` is **UNKNOWN — NOT VERIFIED**; SoundControl's answer is
  to never send one (checksum + registry + model gate all precede the wire).
- On **A3949** this frame is refused by the model gate: the R50i has no ANC.

## 6. Equalizer — `02:83` (both models, preset split)

```
08 EE 00 00 00 02 83 20 00 | preset u16 LE | 10 raw band bytes | 10 DRC band bytes | Σ
```

- Band byte = `120 + dB×10` (`0x78` = 0 dB); bands 9–10 are neutral/−12 dB
  slots the firmware expects. The DRC channel is the raw curve passed through
  the DSP's cross-band matrix *(OpenSCQ30 `volume_adjustments.rs`)*.
- **Response**: EQ state mirrors in the `01:01` blob (preset id + bands);
  the UI resyncs from it.
- **A3949: factory presets only** (ids `00`–`16`). Custom `FE FE` frames are
  refused — UI hidden, store refuses, model gate rejects *(OpenSCQ30
  `custom_preset_id: None` + zero FE FE frames among the 22 live captures)*.
- **A3959: custom `FE FE` supported** at protocol level *(OpenSCQ30
  `Some(0xfefe)`)* — physically unverified.
- Malformed-band behavior on-device: **UNKNOWN — NOT VERIFIED**; values are
  clamped to ±6 dB in the UI before building anyway.

## 7. Toggles — gaming `01:87`, dual `0B:84`, surround `02:86`

- Gaming *(both models)*: payload `[01|00]`. A3949 mirrors the flag at state
  byte 65; A3959 at byte 77 (firmware ≥ 01.60 only). Where no mirror exists,
  the app logs the honest "Command sent — device confirmation unavailable".
- Dual / surround *(A3959 only)*: payload `[01|00]`, mirrored at state bytes
  73 / 74. On A3949 the frames are refused (no such hardware feature).
- Acknowledgement frames for the writes themselves: **UNKNOWN — NOT
  VERIFIED** — state-blob mirrors are the confirmation mechanism used.
- LDAC `01:7F/01:FF`: **UNSUPPORTED on both models** — no LDAC module in
  either device definition.

## 8. Explicitly NOT supported / not implemented (both models)

| Feature | Status |
|---|---|
| Device-side volume | No volume command exists in any published capture for any Soundcore model — the Volume card stays disabled. **UNKNOWN — NOT VERIFIED** whether one exists. |
| Touch/button configuration | Documented in OpenSCQ30 (A3949: 6 buttons × 3 press kinds; A3959: 8 × 4) but **not implemented** by SoundControl — no write command is exposed. |
| Factory reset `01:85` | **UNSUPPORTED** — Motion+ (A3116) only; never sent to these models. |
| Auto power-off (A3959) | Documented *(OpenSCQ30 auto_power_off 10/20/30/60)*, **not implemented**. |
| Ambient sound-mode cycle button behavior | Documented *(OpenSCQ30 ambient_sound_mode_cycle)*, not configurable from SoundControl. |
| Firmware update / TOTA channels | Out of scope; the bridge hard-blocks channels 12/13 (BESOTA/TOTA) and 16 (iAP2). |

## 9. Where the enforcement lives

1. `src/protocol/targets.ts` — the 14-command earbud registry; every
   transport write passes `validateOutboundFrame` (structure + checksum +
   registered CAT:TYPE).
2. `src/protocol/modelRegistry.ts` — the per-model matrix above,
   machine-readable; `gateCommandForProfile` refuses model-unsupported
   frames (including `FE FE` on A3949); `withDeviceBoundary` wraps every
   transport the store installs.
3. `soundcore_bridge.py` — the Windows helper independently re-validates
   every `tx` frame against the same command set before the RFCOMM socket.
4. `scripts/test_model_profiles.mjs` + `scripts/test_command_targets.mjs` +
   `scripts/verify-protocol.mjs` — all of the above is asserted on every
   build; the matrix and the code cannot drift apart silently.
