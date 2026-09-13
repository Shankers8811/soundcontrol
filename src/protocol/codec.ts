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
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (!clean.length) return new Uint8Array();
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

export function dbToByte(db: number): number {
  const clamped = Math.max(-6, Math.min(6, db));
  return Math.max(0x3c, Math.min(0xb4, Math.round(120 + clamped * 10)));
}

export function byteToDb(byte: number): number {
  return Math.round(((byte - 120) / 10) * 10) / 10;
}

export function hexPreview(data: ArrayLike<number>): string {
  return toHex(data);
}
