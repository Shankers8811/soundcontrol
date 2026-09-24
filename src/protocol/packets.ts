import type {
  AncLayout,
  AncMode,
  AncScene,
  DeviceProfile,
  EqCommand,
} from '../types';
import { describeBlePacket } from './ble';
import { fromHex, withChecksum } from './codec';
import { adjustmentToByte, applyDrc } from './drc';
import { CUSTOM_EQ_PRESET_ID, type EqPreset } from './presets';

/**
 * Soundcore framing.
 *
 *   08 EE 00 00 00 | cat | type | total_len (u16 LE) | payload | checksum
 *
 * `total_len` counts every byte of the frame including the checksum, so it is
 * always `10 + payload.length`. The checksum is the sum of all preceding
 * bytes mod 256. Verified against OpenSCQ30's `packet.rs` (which computes
 * `body_length = length − 5 − 2 − 2 − 1`) and against every captured frame in
 * PROTOCOL.md.
 */
function frame(cat: number, type: number, payload: number[] = []): Uint8Array {
  const total = 10 + payload.length;
  return withChecksum([
    0x08, 0xee, 0x00, 0x00, 0x00,
    cat & 0xff, type & 0xff,
    total & 0xff, (total >> 8) & 0xff,
    ...payload,
  ]);
}

/** Handshake captured from the official app: `08 EE 00 00 00 01 01 0A 00 02`. */
export const INIT = frame(0x01, 0x01);

/**
 * Serial number + firmware version. Every model in OpenSCQ30 implements this,
 * so it is the reliable way to read firmware — unlike the `01:01` state blob,
 * whose layout differs per model. Response payload is 10 bytes of ASCII
 * firmware (`XX.XX` left, `XX.XX` right) followed by 16 bytes of ASCII serial.
 */
export const DEVICE_INFO = frame(0x01, 0x05);

/** Request the live left/right battery levels. Response starts with the two levels. */
export const BATTERY_QUERY = frame(0x01, 0x03);

/** Request the charging flags (`01:04`). */
export const CHARGING_QUERY = frame(0x01, 0x04);

export const LDAC = {
  /** `01:7F` — OpenSCQ30 `REQUEST_LDAC_STATE_COMMAND`. */
  query: frame(0x01, 0x7f),
  /** `01:FF` with `[codec, enabled]`, captured from the official app. */
  enable: fromHex('08 EE 00 00 00 01 FF 0B 00 01 02'),
  disable: fromHex('08 EE 00 00 00 01 FF 0B 00 00 01'),
};

export const DUAL = {
  enable: fromHex('08 EE 00 00 00 0B 84 0B 00 01 91'),
  disable: fromHex('08 EE 00 00 00 0B 84 0B 00 00 90'),
};

/* -------------------------------------------------------------------------- */
/* Sound modes — 06:81                                                         */
/* -------------------------------------------------------------------------- */

const CLASSIC_SCENE: Record<AncScene, number> = {
  transport: 0x00,
  outdoor: 0x01,
  indoor: 0x02,
};

const CLASSIC_MODE: Record<Exclude<AncMode, 'adaptive'>, number> = {
  anc: 0x00,
  transparency: 0x01,
  normal: 0x02,
};

export interface AncIntent {
  mode: AncMode;
  /** Manual ANC strength 1..5 (only meaningful when `mode === 'anc'`). */
  level: number;
  scene: AncScene;
  /** Transparency sub-mode: `true` = vocal/talk mode. */
  transVocal: boolean;
  /** Wind-noise suppression. Not available on the classic over-ears. */
  wind: boolean;
}

/**
 * Life Q30 / Q35 / Life Tune / Space One / Space Q45.
 * `[ambient, nc_scene_or_transparency, transparency_mode, custom_nc]`
 *
 * Byte-for-byte identical to OpenSCQ30's `SetSoundModes` unit tests and to the
 * live frames in Noiseclapper-GNOME / SoundcoreDesktop:
 *
 *   ANC outdoor   08 EE 00 00 00 06 81 0E 00 00 01 01 00 8D
 *   Transparency  08 EE 00 00 00 06 81 0E 00 01 01 01 00 8E
 */
export function buildClassicAnc(intent: AncIntent): Uint8Array {
  const mode = intent.mode === 'adaptive' ? 'anc' : intent.mode;
  // Byte 1 is the noise-canceling sub-scene and is carried in every mode, not
  // just while ANC is on: OpenSCQ30's `SetSoundModes` normal-mode test vector
  // is `02 00 01 00` (Normal + Transport). The live Noiseclapper captures all
  // happen to be Outdoor, which is why they show `01` here.
  const sceneByte = CLASSIC_SCENE[intent.scene];
  const transByte = intent.transVocal ? 0x01 : 0x00;
  return frame(0x06, 0x81, [CLASSIC_MODE[mode], sceneByte, transByte, 0x00]);
}

/** `(manual << 4) | adaptive`, the shared nibble byte on every TWS layout. */
function manualAdaptiveByte(manual: number, adaptive: number): number {
  const m = Math.max(1, Math.min(5, Math.round(manual)));
  const a = Math.max(0, Math.min(5, Math.round(adaptive)));
  return ((m << 4) | a) & 0xff;
}

/** Adaptive strength derived from the user-facing 1..5 level. */
function adaptiveFromLevel(level: number): number {
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  return 3;
}

/**
 * P30i / R50i NC (A3959) — `a3959/structures/sound_modes.rs`, 7 bytes:
 *
 *   0 ambient sound mode      00 NC · 01 Transparency · 02 Normal
 *   1 (manual << 4) | adaptive
 *   2 ambient sound mode again
 *   3 ANC automation          00 Manual · 01 Adaptive · 02 Multi-scene
 *   4 wind noise              bit0 suppression · bit1 "wind detected" (read-only)
 *   5 adaptive sensitivity
 *   6 multi-scene ANC scene   00 Transport · 01 Outdoor · 02 Indoor
 *
 * This model has **no transparency sub-mode byte** — OpenSCQ30's changelog
 * records "Soundcore R50i NC should not have transparency modes".
 */
export function buildP30iAnc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  // Android's A3959 frames use an adaptive sub-level of 1 and a manual
  // sub-level of 5. Mode changes also retain the Android app's level-5
  // baseline; manual level buttons then replace only the high nibble.
  const nibble = adaptive
    ? manualAdaptiveByte(5, 1)
    : manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, intent.mode === 'anc' ? 5 : 1);
  return frame(0x06, 0x81, [
    ambient,
    nibble,
    ambient,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0x00,
    CLASSIC_SCENE[intent.scene],
  ]);
}

/**
 * Liberty 4 NC (A3947) — `a3947/structures.rs`, 7 bytes:
 *
 *   0 ambient sound mode
 *   1 (manual << 4) | adaptive
 *   2 transparency mode       00 Fully transparent · 01 Vocal
 *   3 ANC automation          00 Manual · 01 Adaptive · 02 Transportation
 *   4 wind noise              bit0 suppression · bit1 detected
 *   5 environment detection
 *   6 transportation mode     00 Plane · 01 Train · 02 Bus · 03 Car
 */
export function buildLiberty4NcAnc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  const nibble = manualAdaptiveByte(intent.level, adaptive ? adaptiveFromLevel(intent.level) : 0);
  const transportation = intent.scene === 'transport' ? 0x00 : intent.scene === 'outdoor' ? 0x03 : 0x02;
  return frame(0x06, 0x81, [
    ambient,
    nibble,
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0x00,
    transportation,
  ]);
}

/**
 * Liberty 3 Pro (A3952) — `a3952/structures.rs`, 6 bytes:
 * `[ambient, (manual<<4)|adaptive, transparency, nc_automation, wind, unknown]`
 */
export function buildLiberty3ProAnc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  const nibble = manualAdaptiveByte(intent.level, adaptive ? adaptiveFromLevel(intent.level) : 0);
  return frame(0x06, 0x81, [
    ambient,
    nibble,
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0x00,
  ]);
}

export function buildAnc(layout: AncLayout, intent: AncIntent): Uint8Array | null {
  switch (layout) {
    case 'classic':
      return buildClassicAnc(intent);
    case 'tws-p30i':
      return buildP30iAnc(intent);
    case 'tws-l4nc':
      return buildLiberty4NcAnc(intent);
    case 'tws-l3pro':
      return buildLiberty3ProAnc(intent);
    case 'none':
      // This model exposes no sound-mode control. Returning null keeps the
      // caller from sending a frame the firmware would silently discard.
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Equalizer                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `02:81` — Life Q30 / Q35 / Life Tune and any `common_settings()` model.
 * `preset u16LE, 8 band bytes` — the preset id is two bytes little-endian,
 * which is why every factory preset looks like `NN 00` on the wire. Matches
 * OpenSCQ30's unit tests exactly:
 *
 *   Signature      08 EE 00 00 00 02 81 14 00 00 00 78 78 78 78 78 78 78 78 4D
 *   Treble Reducer 08 EE 00 00 00 02 81 14 00 15 00 78 78 78 64 5A 50 50 3C A4
 *   Custom (FEFE)  08 EE 00 00 00 02 81 14 00 FE FE 3C B4 8F A0 8E B4 74 88 E6
 */
export function buildEq81(presetId: number, bandsDb: number[]): Uint8Array {
  return frame(0x02, 0x81, [
    presetId & 0xff,
    (presetId >> 8) & 0xff,
    ...Array.from({ length: 8 }, (_, i) => adjustmentToByte((bandsDb[i] ?? 0) * 10)),
  ]);
}

/**
 * `02:83` — P20i / P25i / R50i / P30i / A20i (`equalizer_with_drc_tws`).
 * `preset u16LE, 10 raw bands, 10 DRC-compensated bands`.
 *
 * The second channel is not optional and not a copy: the device applies it.
 * Reproduced byte-for-byte from all 22 live P20i captures — see
 * scripts/verify-protocol.mjs.
 *
 *   Acoustic  08 EE 00 00 00 02 83 20 00 01 00
 *             A0 82 8C 8C A0 A0 A0 8C 78 00
 *             7D 76 7B 78 7C 7A 7C 79 78 00  03
 */
export function buildEq83(presetId: number, bandsDb: number[]): Uint8Array {
  // Ten bands: the app exposes eight, band 9 is neutral and band 10 is the
  // −12 dB default the firmware expects in that slot.
  const raw = Array.from({ length: 8 }, (_, i) => Math.round((bandsDb[i] ?? 0) * 10));
  raw.push(0, -120);
  const drc = applyDrc(raw);
  return frame(0x02, 0x83, [
    presetId & 0xff,
    (presetId >> 8) & 0xff,
    ...raw.map(adjustmentToByte),
    ...drc.map(adjustmentToByte),
  ]);
}

export function buildEq(command: EqCommand, presetId: number, bandsDb: number[]): Uint8Array {
  return command === '02:83' ? buildEq83(presetId, bandsDb) : buildEq81(presetId, bandsDb);
}

export function buildEqPreset(profile: DeviceProfile, preset: EqPreset): Uint8Array | null {
  if (!profile.eqCommand) return null;
  return buildEq(profile.eqCommand, preset.index, preset.bands);
}

export function buildCustomEq(profile: DeviceProfile, bandsDb: number[]): Uint8Array | null {
  if (!profile.eqCommand) return null;
  return buildEq(profile.eqCommand, CUSTOM_EQ_PRESET_ID, bandsDb);
}

/* -------------------------------------------------------------------------- */
/* Toggles                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Gaming / low-latency mode. `01:87` is OpenSCQ30's common command; the
 * Liberty 4 NC (A3947) and Liberty 5 (A3957) use `10:85` instead.
 */
export function buildGameMode(profile: DeviceProfile, on: boolean): Uint8Array {
  return profile.sku === 'A3947'
    ? frame(0x10, 0x85, [on ? 0x01 : 0x00])
    : frame(0x01, 0x87, [on ? 0x01 : 0x00]);
}

/**
 * 3D Surround Sound — `02:86`, OpenSCQ30 `SET_SURROUND_SOUND_COMMAND`.
 * (Previously labelled "3D Spatial Audio"; the frame is the surround toggle.)
 */
export function buildSurroundSound(on: boolean): Uint8Array {
  return frame(0x02, 0x86, [on ? 0x01 : 0x00]);
}

/** Factory reset — `01:85`, the only device OpenSCQ30 maps it to (Motion+). */
export function buildResetDevice(): Uint8Array {
  return frame(0x01, 0x85);
}

export function buildDeviceInfoQuery(): Uint8Array {
  return INIT;
}

export function buildBatteryQuery(): Uint8Array {
  return BATTERY_QUERY;
}

/* -------------------------------------------------------------------------- */
/* Decoding                                                                    */
/* -------------------------------------------------------------------------- */

export function describePacket(data: ArrayLike<number>): string {
  // Short Android BLE captures (08 EE cmd len … XOR) share the host magic
  // but not the RFCOMM category/type layout; describe them instead of
  // mislabeling the bytes as an RFCOMM category.
  if (data.length >= 5 && data.length < 8) return describeBlePacket(data) ?? 'Short frame';
  if (data.length < 8) return 'Short frame';
  const ble = data.length <= 16 ? describeBlePacket(data) : null;
  if (ble && data[4] !== 0x00) return ble;
  const a = data[0];
  const b = data[1];
  const cat = data[5];
  const typ = data[6];
  const dir = a === 0x09 && b === 0xff ? 'RX' : a === 0x08 && b === 0xee ? 'TX' : 'UNK';
  if (cat === 0x06 && typ === 0x81) return `${dir} Sound modes (ANC / ambient)`;
  if (cat === 0x06 && typ === 0x01) return `${dir} Sound-mode state report`;
  if (cat === 0x02 && typ === 0x81) return `${dir} Equalizer (8-band)`;
  if (cat === 0x02 && typ === 0x83) return `${dir} Equalizer (10-band + DRC)`;
  if (cat === 0x03 && typ === 0x87) return `${dir} Equalizer + HearID`;
  if (cat === 0x02 && typ === 0x86) return `${dir} 3D Surround Sound`;
  if (cat === 0x01 && typ === 0x87) return `${dir} Gaming / latency`;
  if (cat === 0x10 && typ === 0x85) return `${dir} Gaming / latency (Liberty)`;
  if (cat === 0x01 && typ === 0x85) return `${dir} Device Reset`;
  if (cat === 0x01 && typ === 0x01) return `${dir} State request / state update`;
  if (cat === 0x01 && typ === 0x03) return `${dir} Battery level`;
  if (cat === 0x01 && typ === 0x04) return `${dir} Battery charging flag`;
  if (cat === 0x01 && typ === 0x05) return `${dir} Serial number + firmware`;
  if (cat === 0x01 && typ === 0x7f) return `${dir} LDAC query`;
  if (cat === 0x01 && typ === 0xff) return `${dir} LDAC set`;
  if (cat === 0x01 && typ === 0x86) return `${dir} Auto power off`;
  if (cat === 0x0b && typ === 0x84) return `${dir} Dual connection`;
  return `${dir} cat=${cat.toString(16)} type=${typ.toString(16)}`;
}
