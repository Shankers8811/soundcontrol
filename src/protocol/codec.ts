/** Soundcore host→device frames start 08 EE; device→host start 09 FF. Checksum is additive mod 256. */

export function checksum(bytes: ArrayLike<number>, end = bytes.length): number {
  let s = 0;
  for (let i = 0; i < end; i++) s = (s + (bytes[i] & 0xff)) & 0xff;
  return s;
}

export function withChecksum(body: number[]): Uint8Array {
  const cs = checksum(body);
  const out = new Uint8Array(body.length + 1);
  out.set(body);
  out[body.length] = cs;
  return out;
}

export function toHex(data: ArrayLike<number>, sep = ' '): string {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i++) {
    parts.push((data[i] & 0xff).toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(sep);
}

export function fromHex(hex: string): Uint8Array {
  // Accept the formats people commonly paste into the diagnostics console,
  // but do not silently discard arbitrary characters: "08 zz" previously
  // became a valid one-byte payload and could send the wrong frame.
  const clean = hex.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (!clean.length) return new Uint8Array();
  if (/[^0-9a-fA-F]/.test(clean)) {
    throw new Error('Hex payload contains an invalid character');
  }
  if (clean.length % 2) {
    throw new Error('Hex payload has an odd number of digits');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function verifyFrame(data: ArrayLike<number>): boolean | null {
  if (data.length < 2) return null;
  return checksum(data, data.length - 1) === (data[data.length - 1] & 0xff);
}

/**
 * XOR checksum used by some legacy BLE captures of the Soundcore protocol.
 * The Windows RFCOMM transport always uses the additive checksum above; this
 * helper exists so Android BLE dumps (see src/protocol/ble.ts) can be
 * validated in the diagnostics console without guessing.
 */
export function xorChecksum(bytes: ArrayLike<number>, end = bytes.length): number {
  let x = 0;
  for (let i = 0; i < end; i++) x ^= bytes[i] & 0xff;
  return x & 0xff;
}

export function verifyXorFrame(data: ArrayLike<number>): boolean | null {
  if (data.length < 2) return null;
  return xorChecksum(data, data.length - 1) === (data[data.length - 1] & 0xff);
}

/**
 * Decode a Base64 blob (obfuscated APK data or raw BLE stream captures)
 * into raw bytes. Accepts whitespace and data-URI prefixes; throws a
 * friendly error instead of returning truncated data.
 */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input
    .trim()
    .replace(/^data:[^,]*,/, '')
    .replace(/\s+/g, '');
  if (!clean) return new Uint8Array();
  if (/[^0-9a-zA-Z+/=]/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('Base64 input is not valid padded Base64');
  }
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

/** Convenience wrapper: Base64 blob -> upper-case spaced hex (see PROTOCOL.md). */
export function base64ToHex(input: string, sep = ' '): string {
  return toHex(base64ToBytes(input), sep);
}

export function dbToByte(db: number): number {
  const safe = Number.isFinite(db) ? db : 0;
  const clamped = Math.max(-6, Math.min(6, safe));
  return Math.max(0x3c, Math.min(0xb4, Math.round(120 + clamped * 10)));
}

export function byteToDb(byte: number): number {
  return Math.round(((byte - 120) / 10) * 10) / 10;
}

export function hexPreview(data: ArrayLike<number>): string {
  return toHex(data);
}
