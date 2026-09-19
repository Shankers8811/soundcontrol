import { toHex } from './codec';

/** Serial numbers are personal device identifiers even when hex encoded.
 * Preserve other bytes and mark redaction explicitly; never forge a checksum.
 */
export function diagnosticFrame(data: ArrayLike<number>): string {
  const bytes = Array.from(data);
  if (bytes[0] !== 9 || bytes[5] !== 1) return toHex(bytes);
  const start = bytes[6] === 1 ? 9 + 16 : bytes[6] === 5 ? 9 + 10 : -1;
  return bytes.map((b, i) => start >= 0 && i >= start && i < start + 16 && i < bytes.length - 1
    ? 'XX' : b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
