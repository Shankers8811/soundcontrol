import type { AncMode, AncScene, DeviceFamily } from '../types';
import { dbToByte, fromHex, withChecksum } from './codec';
import type { EqPreset } from './presets';

/** Handshake captured from the official app. Last byte is checksum. */
export const INIT = fromHex('08 EE 00 00 00 01 01 0A 00 02');

export const LDAC = {
  query: fromHex('08 EE 00 00 00 01 7F 0A 00 80'),
  enable: fromHex('08 EE 00 00 00 01 FF 0B 00 01 02'),
  disable: fromHex('08 EE 00 00 00 01 FF 0B 00 00 01'),
};

export const DUAL = {
  enable: fromHex('08 EE 00 00 00 0B 84 0B 00 01 91'),
  disable: fromHex('08 EE 00 00 00 0B 84 0B 00 00 90'),
};

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

/**
 * Life Q30 / Q35 / Space Q45 ambient-sound frame
 * 08 EE 00 00 00 06 81 0E 00 [mode] [scene] 01 00 [cs]
 */
export function buildClassicAnc(mode: AncMode, scene: AncScene = 'outdoor'): Uint8Array {
  const m = mode === 'adaptive' ? 0x00 : CLASSIC_MODE[mode];
  const s = mode === 'adaptive' ? 0x01 : mode === 'anc' ? CLASSIC_SCENE[scene] : 0x01;
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x06, 0x81, 0x0e, 0x00, m, s, 0x01, 0x00]);
}

/**
 * TWS ANC (R50i NC, P30i, Liberty 4 NC).
 * Host dump for Max ANC L5: 08 EE 00 00 00 06 81 0E 00 01 05 01 A0
 * We keep that layout and append a correct additive checksum.
 */
export function buildTwsAnc(mode: AncMode, level: number): Uint8Array {
  let modeByte = 0x01;
  let levelByte = Math.max(1, Math.min(5, level | 0));
  if (mode === 'transparency') {
    modeByte = 0x02;
    levelByte = 0x01;
  } else if (mode === 'normal') {
    modeByte = 0x00;
    levelByte = 0x00;
  } else if (mode === 'adaptive') {
    modeByte = 0x01;
    levelByte = 0x00;
  }
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x06, 0x81, 0x0e, 0x00, modeByte, levelByte, 0x01]);
}

/** Exact Max-ANC dump from the product spec (legacy checksum as captured). */
export const MAX_ANC_DUMP = fromHex('08 EE 00 00 00 06 81 0E 00 01 05 01 A0');

export function buildAnc(family: DeviceFamily, mode: AncMode, level: number, scene: AncScene): Uint8Array {
  return family === 'classic' ? buildClassicAnc(mode, scene) : buildTwsAnc(mode, level);
}

/**
 * 8-band EQ. 08 EE 00 00 00 02 81 14 00 [preset] 00 [8 band bytes] [cs]
 * Custom curves use preset 0xEE.
 */
export function buildEq(presetIndex: number, bandsDb: number[]): Uint8Array {
  const body = [
    0x08, 0xee, 0x00, 0x00, 0x00, 0x02, 0x81, 0x14, 0x00,
    presetIndex & 0xff,
    0x00,
    ...Array.from({ length: 8 }, (_, i) => dbToByte(bandsDb[i] ?? 0)),
  ];
  return withChecksum(body);
}

export function buildEqPreset(preset: EqPreset): Uint8Array {
  return buildEq(preset.index, preset.bands);
}

export function buildCustomEq(bandsDb: number[]): Uint8Array {
  return buildEq(0xee, bandsDb);
}

/** Low-latency / gaming mode. Command 0x87 as used on Liberty / P-series chipsets. */
export function buildGameMode(on: boolean): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x87, 0x0c, 0x00, on ? 0x01 : 0x00]);
}

/** BassUp dynamic bass boost command */
export function buildBassUp(on: boolean): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x02, 0x82, 0x0b, 0x00, on ? 0x01 : 0x00]);
}

/** 3D/spatial audio toggle. The frame length byte includes the checksum. */
export function buildSpatialAudio(on: boolean): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x02, 0x86, 0x0a, 0x00, on ? 0x01 : 0x00]);
}

/** Find My Device acoustic beacon command */
export function buildFindDevice(left: boolean, right: boolean): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x88, 0x0c, 0x00, left ? 0x01 : 0x00, right ? 0x01 : 0x00]);
}

/** Factory reset command */
export function buildResetDevice(): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x85, 0x0a, 0x00]);
}

export function buildDeviceInfoQuery(): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x01, 0x0a, 0x00]);
}

/** Request the live left/right battery levels (cat=01, type=03). */
export function buildBatteryQuery(): Uint8Array {
  return withChecksum([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x03, 0x0a, 0x00]);
}

export function describePacket(data: ArrayLike<number>): string {
  if (data.length < 8) return 'Short frame';
  const a = data[0];
  const b = data[1];
  const cat = data[5];
  const typ = data[6];
  const dir = a === 0x09 && b === 0xff ? 'RX' : a === 0x08 && b === 0xee ? 'TX' : 'UNK';
  if (cat === 0x06 && typ === 0x81) return `${dir} ANC / ambient`;
  if (cat === 0x02 && typ === 0x81) return `${dir} Equalizer`;
  if (cat === 0x02 && typ === 0x82) return `${dir} BassUp`;
  if (typ === 0x87) return `${dir} Gaming / latency`;
  if (typ === 0x88) return `${dir} Find Device`;
  if (typ === 0x85) return `${dir} Device Reset`;
  if (cat === 0x01 && typ === 0x01) return `${dir} Init / device info`;
  if (cat === 0x01 && typ === 0x03) return `${dir} Battery query`;
  if (cat === 0x01 && typ === 0x7f) return `${dir} LDAC query`;
  if (cat === 0x01 && typ === 0xff) return `${dir} LDAC set`;
  if (cat === 0x0b && typ === 0x84) return `${dir} Dual connection`;
  return `${dir} cat=${cat.toString(16)} type=${typ.toString(16)}`;
}
