/**
 * Android BLE capture reference for Soundcore devices.
 *
 * The Windows desktop app talks to already-paired hardware over Classic
 * Bluetooth RFCOMM (see PROTOCOL.md and src/protocol/packets.ts). It does
 * NOT use Web Bluetooth: Electron has no reliable Web Bluetooth stack on
 * Windows, and RFCOMM is what the bundled helper can reach with zero setup.
 *
 * This module exists because Android captures are still useful for reverse
 * engineering. The official mobile app exposes the same DSP families over a
 * vendor GATT service; pasting such a capture into the diagnostics console
 * decodes it with the helpers below, and the command map shows the RFCOMM
 * equivalent that SoundControl actually sends.
 */

import { toHex, withChecksum, xorChecksum } from './codec';

/** Primary vendor GATT service seen on Soundcore BLE captures. */
export const BLE_SERVICE_UUID = '0000ab00-0000-1000-8000-00805f9b34fb';
/** Alternate vendor service UUID on some firmware families. */
export const BLE_SERVICE_UUID_ALT = '0000ff00-0000-1000-8000-00805f9b34fb';
/** Host -> device write characteristic. */
export const BLE_TX_CHAR_UUID = '0000ab01-0000-1000-8000-00805f9b34fb';
/** Device -> host notify characteristic. */
export const BLE_RX_CHAR_UUID = '0000ab02-0000-1000-8000-00805f9b34fb';

/**
 * Simplified BLE frame layout from Android captures:
 *   Header (2B: 08 EE) + Cmd (1B) + Length (1B) + Payload + XOR checksum (1B)
 * This is NOT the RFCOMM layout (which carries category + type + 2-byte
 * length and an additive checksum). Do not send BLE frames over RFCOMM.
 */
export interface BlePacket {
  cmd: number;
  payload: Uint8Array;
  xorValid: boolean | null;
  raw: Uint8Array;
}

export function buildBlePacket(cmdId: number, payload: ArrayLike<number> = []): Uint8Array {
  const body = [0x08, 0xee, cmdId & 0xff, payload.length & 0xff, ...Array.from(payload)];
  const out = new Uint8Array(body.length + 1);
  out.set(body);
  out[body.length] = xorChecksum(body);
  return out;
}

export function parseBlePacket(raw: ArrayLike<number>): BlePacket | null {
  const bytes = Uint8Array.from(Array.from(raw));
  if (bytes.length < 5) return null;
  if (bytes[0] !== 0x08 || bytes[1] !== 0xee) return null;
  const cmd = bytes[2];
  const len = bytes[3];
  if (bytes.length < 4 + len + 1) return null;
  const payload = bytes.slice(4, 4 + len);
  const frame = bytes.slice(0, 4 + len + 1);
  const xorValid = xorChecksum(frame, frame.length - 1) === frame[frame.length - 1];
  return { cmd, payload, xorValid, raw: frame };
}

/**
 * BLE command IDs from Android captures and their RFCOMM equivalents.
 * `rfcomm` is a human reference to the frame SoundControl actually sends;
 * see buildAnc / buildEq / buildBatteryQuery in packets.ts.
 */
export const BLE_COMMAND_MAP: Array<{ ble: number; name: string; rfcomm: string; note: string }> = [
  {
    ble: 0x61,
    name: 'Device telemetry request',
    rfcomm: '01 01 handshake + 01 03 battery query',
    note: 'Empty payload on BLE; RFCOMM splits this into device-info and battery frames.',
  },
  {
    ble: 0x06,
    name: 'ANC mode toggle',
    rfcomm: '06 81 ambient frame',
    note: 'BLE payload 00=off 01=ANC 02=transparency; RFCOMM adds level/scene bytes.',
  },
  {
    ble: 0x01,
    name: 'Equalizer bands',
    rfcomm: '02 81 8-band EQ frame',
    note: 'BLE carries an 8-byte gain array; RFCOMM adds preset + additive checksum.',
  },
];

export function describeBlePacket(raw: ArrayLike<number>): string | null {
  const parsed = parseBlePacket(raw);
  if (!parsed) return null;
  const known = BLE_COMMAND_MAP.find((c) => c.ble === parsed.cmd);
  const hex = toHex(parsed.payload);
  const label = known ? `BLE ${known.name}` : `BLE cmd=0x${parsed.cmd.toString(16).padStart(2, '0')}`;
  const validity = parsed.xorValid === null ? '' : parsed.xorValid ? ' · XOR ok' : ' · XOR mismatch';
  return hex ? `${label} [${hex}]${validity}` : `${label}${validity}`;
}

/** True for the name prefixes the Android app scans for. */
export function isSoundcoreBleName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /soundcore|anker|liberty|life |space |r50i|p30i|p20i|q30|q35|q45/i.test(name);
}

/** Re-export for callers that build RFCOMM frames next to BLE references. */
export { withChecksum };
