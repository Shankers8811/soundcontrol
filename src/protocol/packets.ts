import type {
  AncLayout,
  AncMode,
  AncScene,
  AncSubMode,
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
  /** Manual ANC strength 1..5 (the high nibble on nibble-carrying layouts). */
  level: number;
  /** ANC sub-mode; defaults to `adaptive` for `mode === 'adaptive'`, else `manual`. */
  subMode?: AncSubMode;
  /**
   * Device-reported adaptive strength (low nibble). OpenSCQ30 exposes
   * `AdaptiveNoiseCanceling` as read-only — the firmware decides it — so the
   * app preserves the reported value instead of inventing one.
   */
  adaptiveLevel?: number;
  /**
   * Device-reported adaptive sensitivity (0..10; 0xFF = none reported).
   * Also read-only upstream, so the reported value is echoed back.
   */
  adaptiveSensitivity?: number;
  scene: AncScene;
  /** Transparency sub-mode: `true` = vocal/talk mode. */
  transVocal: boolean;
  /** Wind-noise suppression where the selected model layout exposes it. */
  wind: boolean;
}

/**
 * Q20i / Life Q30 / Life Q35 / Life Tune.
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

/**
 * Space One (A3035) — six-byte `a3035::structures::SoundModes` body:
 * `[ambient, manual<<4|adaptive, ambient, nc_mode, wind, transparency]`.
 * It is not the four-byte classic over-ear layout.
 */
export function buildSpaceOneAnc(intent: AncIntent): Uint8Array {
  const mode = intent.mode === 'adaptive' ? 'anc' : intent.mode;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    CLASSIC_MODE[mode],
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveDirectLevel(intent.level) : 0),
    CLASSIC_MODE[mode],
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    mode === 'transparency' ? 0x05 : 0x01,
  ]);
}

/**
 * Space Q45 (A3040) — six-byte body:
 * `[ambient, manual<<4|adaptive, transparency_mode, nc_mode, wind,
 * transparency_level]`.
 */
export function buildSpaceQ45Anc(intent: AncIntent): Uint8Array {
  const mode = intent.mode === 'adaptive' ? 'anc' : intent.mode;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    CLASSIC_MODE[mode],
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveDirectLevel(intent.level) : 0),
    intent.transVocal ? 0x00 : 0x01,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    mode === 'transparency' ? 0x05 : 0x01,
  ]);
}

/**
 * Manual/adaptive strengths are documented as the integers 1..5 on every
 * layout that carries them. A non-finite value (corrupted persisted state or
 * a parser bug upstream) must never be encoded as the invalid level 0, so it
 * falls back to the app baseline 5 here — `buildAnc` additionally refuses
 * such an intent outright so the frame is never sent at all.
 */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 5;
  return Math.max(1, Math.min(5, Math.round(level)));
}

/** `(manual << 4) | adaptive`, the shared nibble byte on every TWS layout. */
function manualAdaptiveByte(manual: number, adaptive: number): number {
  const m = clampLevel(manual);
  const a = Number.isFinite(adaptive) ? Math.max(0, Math.min(5, Math.round(adaptive))) : 0;
  return ((m << 4) | a) & 0xff;
}

/** Adaptive strength enum used by layouts whose valid values are 1, 2, 3. */
function adaptiveFromLevel(level: number): number {
  const l = clampLevel(level);
  if (l <= 2) return 1;
  if (l <= 4) return 2;
  return 3;
}

/** Adaptive strength enum used by A3936/A3952/A3957: low, medium, high = 0, 1, 2. */
function adaptiveNamedLevel(level: number): number {
  const l = clampLevel(level);
  if (l <= 2) return 0;
  if (l <= 4) return 1;
  return 2;
}

/** Direct five-step adaptive fields used by the A3035/A3040/A3062 structures. */
function adaptiveDirectLevel(level: number): number {
  return clampLevel(level);
}

/**
 * P30i / R50i NC (A3959) — `a3959/structures/sound_modes.rs`, 7 bytes:
 *
 *   0 ambient sound mode      00 NC · 01 Transparency · 02 Normal
 *   1 (manual << 4) | adaptive    manual 1..5, adaptive 1..5
 *   2 ambient sound mode again
 *   3 ANC automation          00 Manual · 01 Adaptive · 02 Multi-scene
 *   4 wind noise              bit0 suppression · bit1 "wind detected" (read-only)
 *   5 adaptive sensitivity    0..10; 0xFF = none reported by the device
 *   6 multi-scene ANC scene   00 Transport · 01 Outdoor · 02 Indoor
 *
 * Byte 3 is the A3959-specific Manual/Adaptive/Multi-scene selector. The
 * correct values are **Manual = 0x00, Adaptive = 0x01, Multi-scene = 0x02** —
 * OpenSCQ30 commit `9b6e42a7` ("a3959 incorrect noise canceling mode ids")
 * fixed exactly this enum, whose previous `Adaptive = 0, Manual = 1` mapping
 * is the historical "manual and automatic noise cancelling were mixed up"
 * bug. Its `set_manual_noise_canceling` test then expects the frame
 * `06:81 00 25 00 00 01 FF 01` for manual level 2: manual nibble 2, the
 * device's stored adaptive nibble 5, automation 0x00 (Manual), wind 0x01,
 * sensitivity 0xFF, scene 0x01 (Outdoor).
 *
 * A manual level is only honoured by the firmware while byte 3 says Manual
 * (0x00); sending 0x02 (Multi-scene) for a level change makes the device
 * ignore the level entirely, which is why the previous builder produced no
 * audible change on real R50i NC hardware.
 *
 * `AdaptiveNoiseCanceling` and `AdaptiveNoiseCancelingSensitivityLevel` are
 * read-only in OpenSCQ30 (the firmware owns them), so this builder echoes the
 * values the device reported (falling back to the 5 / 0xFF values seen in
 * every capture) rather than fabricating a strength.
 *
 * This model has **no transparency sub-mode byte** — OpenSCQ30's changelog
 * records "Soundcore R50i NC should not have transparency modes".
 */
export function buildP30iAnc(intent: AncIntent): Uint8Array {
  const ambient =
    intent.mode === 'anc' || intent.mode === 'adaptive'
      ? 0x00
      : intent.mode === 'transparency'
        ? 0x01
        : 0x02;
  const subMode: AncSubMode =
    intent.subMode ?? (intent.mode === 'adaptive' ? 'adaptive' : 'manual');
  const automation =
    subMode === 'adaptive' ? 0x01 : subMode === 'multiscene' ? 0x02 : 0x00;
  // The manual nibble follows the user's level in every sub-mode; the adaptive
  // nibble always mirrors the device (read-only), never the UI.
  const manual = clampLevel(intent.level);
  const adaptive = Number.isFinite(intent.adaptiveLevel)
    ? Math.max(0, Math.min(5, Math.round(intent.adaptiveLevel as number)))
    : 5;
  const sensitivity =
    Number.isInteger(intent.adaptiveSensitivity) &&
    (intent.adaptiveSensitivity as number) >= 0 &&
    (intent.adaptiveSensitivity as number) <= 10
      ? (intent.adaptiveSensitivity as number)
      : 0xff;
  return frame(0x06, 0x81, [
    ambient,
    ((manual << 4) | adaptive) & 0xff,
    ambient,
    automation,
    intent.wind ? 0x01 : 0x00,
    sensitivity,
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
  const automation = adaptive ? 0x01 : intent.mode === 'anc' && intent.scene === 'transport' ? 0x02 : 0x00;
  return frame(0x06, 0x81, [
    ambient,
    nibble,
    intent.transVocal ? 0x01 : 0x00,
    automation,
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
  const nibble = manualAdaptiveByte(intent.level, adaptive ? adaptiveNamedLevel(intent.level) : 0);
  return frame(0x06, 0x81, [
    ambient,
    nibble,
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0x00,
  ]);
}

/** Space One Pro (A3062) — six-byte custom-transparency layout. */
export function buildSpaceOneProAnc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveDirectLevel(intent.level) : 0),
    0x01, // custom transparency is the only transparency mode on A3062
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    ambient === 0x01 ? 0x05 : 0x01,
  ]);
}

/** Space A40 (A3936) — six-byte manual/adaptive layout. */
export function buildSpaceA40Anc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveNamedLevel(intent.level) : 0),
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    adaptive ? adaptiveFromLevel(intent.level) : 0x00,
  ]);
}

/** Liberty 4 Pro (A3954) — slider/airplane four-byte layout. */
export function buildLiberty4ProAnc(intent: AncIntent): Uint8Array {
  const mode = intent.mode === 'adaptive' ? 'anc' : intent.mode;
  const ambient = CLASSIC_MODE[mode];
  const slider = mode === 'anc' ? 6 - clampLevel(intent.level) : mode === 'transparency' ? 6 + clampLevel(intent.level) : 6;
  return frame(0x06, 0x81, [ambient, slider, 0x00, intent.wind ? 0x01 : 0x00]);
}

/** P40i (A3955) — seven-byte multi-scene ANC layout. */
export function buildP40iAnc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  const automation = adaptive ? 0x01 : intent.mode === 'anc' ? 0x02 : 0x00;
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.level, adaptive ? adaptiveFromLevel(intent.level) : 0),
    intent.transVocal ? 0x01 : 0x00,
    automation,
    intent.wind ? 0x01 : 0x00,
    adaptive ? adaptiveFromLevel(intent.level) : 0x00,
    CLASSIC_SCENE[intent.scene],
  ]);
}

/** Liberty 5 (A3957) — seven-byte transportation-aware ANC layout. */
export function buildLiberty5Anc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  const automation = adaptive ? 0x01 : intent.mode === 'anc' && intent.scene === 'transport' ? 0x02 : 0x00;
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.level, adaptive ? adaptiveNamedLevel(intent.level) : 0),
    intent.transVocal ? 0x01 : 0x00,
    automation,
    intent.wind ? 0x01 : 0x00,
    adaptive ? adaptiveFromLevel(intent.level) : 0x00,
    intent.scene === 'transport' ? 0x00 : 0x03,
  ]);
}

/**
 * Sport X20 (A3968) — six-byte named-noise layout from
 * `a3968/structures/sound_modes.rs`:
 * `[ambient, manual<<4|adaptive(0..2), transparency, automation, wind, unknown]`.
 */
export function buildSportX20Anc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveNamedLevel(intent.level) : 0),
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0xff,
  ]);
}

/**
 * P31i / R60i NC (D1202/D1202C) — eight-byte named-noise layout from
 * `d1202/structures.rs`:
 * `[ambient, manual<<4|adaptive, transparency, nc_mode, wind, reserved,
 *   multi_scene, real_time_adaptive]`.
 */
export function buildD1202Anc(intent: AncIntent): Uint8Array {
  const ambient = intent.mode === 'anc' || intent.mode === 'adaptive' ? 0x00 : intent.mode === 'transparency' ? 0x01 : 0x02;
  const adaptive = intent.mode === 'adaptive';
  return frame(0x06, 0x81, [
    ambient,
    manualAdaptiveByte(intent.mode === 'anc' ? intent.level : 5, adaptive ? adaptiveNamedLevel(intent.level) : 0),
    intent.transVocal ? 0x01 : 0x00,
    adaptive ? 0x01 : 0x00,
    intent.wind ? 0x01 : 0x00,
    0x00,
    CLASSIC_SCENE[intent.scene],
    0x00,
  ]);
}

export function buildAnc(layout: AncLayout, intent: AncIntent): Uint8Array | null {
  // Refuse malformed intents outright. A frame is only ever built for a
  // documented mode/scene, and on level-carrying layouts only for an integer
  // strength 1..5 — an out-of-range number is never rounded into a strength
  // the device may not have accepted. (`classic` carries no level byte, so a
  // stale level value can never block a discrete-mode change.)
  if (intent.mode !== 'anc' && intent.mode !== 'adaptive' && intent.mode !== 'normal' && intent.mode !== 'transparency') {
    return null;
  }
  if (intent.scene !== 'transport' && intent.scene !== 'outdoor' && intent.scene !== 'indoor') {
    return null;
  }
  if (layout !== 'none' && layout !== 'classic' && !(Number.isInteger(intent.level) && intent.level >= 1 && intent.level <= 5)) {
    return null;
  }
  switch (layout) {
    case 'classic':
      return buildClassicAnc(intent);
    case 'classic-a3035':
      return buildSpaceOneAnc(intent);
    case 'classic-a3040':
      return buildSpaceQ45Anc(intent);
    case 'tws-p30i':
      return buildP30iAnc(intent);
    case 'tws-l4nc':
      return buildLiberty4NcAnc(intent);
    case 'tws-l3pro':
      return buildLiberty3ProAnc(intent);
    case 'tws-a3062':
      return buildSpaceOneProAnc(intent);
    case 'tws-a3936':
      return buildSpaceA40Anc(intent);
    case 'tws-l4pro':
      return buildLiberty4ProAnc(intent);
    case 'tws-p40i':
      return buildP40iAnc(intent);
    case 'tws-l5':
      return buildLiberty5Anc(intent);
    case 'tws-a3968':
      return buildSportX20Anc(intent);
    case 'tws-d1202':
      return buildD1202Anc(intent);
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

/** A3388/AeroClip — two equalizer channels, no DRC channel. */
export function buildEq83Dual(presetId: number, bandsDb: number[]): Uint8Array {
  const channel = Array.from({ length: 8 }, (_, i) => Math.round((bandsDb[i] ?? 0) * 10));
  channel.push(0, -120);
  return frame(0x02, 0x83, [
    presetId & 0xff,
    (presetId >> 8) & 0xff,
    ...channel.map(adjustmentToByte),
    ...channel.map(adjustmentToByte),
  ]);
}

/** D1101/C50i — two non-DRC channels on the classic EQ command. */
export function buildEq81Dual(presetId: number, bandsDb: number[]): Uint8Array {
  const channel = Array.from({ length: 10 }, (_, i) =>
    adjustmentToByte(Math.round((bandsDb[i] ?? (i === 9 ? -12 : 0)) * 10)),
  );
  return frame(0x02, 0x81, [
    presetId & 0xff,
    (presetId >> 8) & 0xff,
    ...channel,
    ...channel,
  ]);
}

/**
 * D1202/P31i/R60i NC — the source-backed 03:87 HearID/DSP shape.
 *
 * OpenSCQ30's D1202 modifier sends a two-channel ten-band EQ followed by a
 * disabled HearID block. The HearID curves are deliberately encoded as FF
 * (absent), never as a fabricated personalised curve; the active EQ is then
 * repeated with an interleaved zero byte, exactly as the source builder does
 * when HearID is disabled. This supports factory EQ presets while leaving
 * personalised HearID editing out of the UI.
 */
export function buildEq87D1202(presetId: number, bandsDb: number[]): Uint8Array {
  const channel = Array.from({ length: 10 }, (_, i) =>
    adjustmentToByte(Math.round((bandsDb[i] ?? (i === 9 ? -12 : 0)) * 10)),
  );
  const active = [...channel, ...channel].flatMap((value) => [value, 0x00]);
  return frame(0x03, 0x87, [
    presetId & 0xff,
    (presetId >> 8) & 0xff,
    0x00,
    0x00, // favorite music genre
    ...channel,
    ...channel,
    0x00,
    0x00, // unknown
    0x00, // HearID disabled
    ...Array(20).fill(0xff), // initial HearID curves absent
    0x00,
    0x00,
    0x00,
    0x00, // HearID timestamp
    0x00, // initial HearID type
    ...Array(20).fill(0xff), // custom HearID curves absent
    ...active,
    0x00,
    0x00, // unknown
  ]);
}

export function buildEq(command: EqCommand, presetId: number, bandsDb: number[]): Uint8Array {
  switch (command) {
    case '02:83':
    case '02:83-single':
      return buildEq83(presetId, bandsDb);
    case '02:83-dual':
      return buildEq83Dual(presetId, bandsDb);
    case '02:81-dual':
      return buildEq81Dual(presetId, bandsDb);
    case '02:81':
      return buildEq81(presetId, bandsDb);
    case '03:87':
      return buildEq87D1202(presetId, bandsDb);
  }
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
  return profile.sku === 'A3947' || profile.sku === 'A3957'
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
  return DEVICE_INFO;
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
