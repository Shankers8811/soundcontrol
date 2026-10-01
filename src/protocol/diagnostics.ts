/**
 * Paste-ready, machine-readable frame diagnostics for hardware validation
 * (`docs/R50I-NC-HARDWARE-VALIDATION.md`).
 *
 * These helpers describe the bytes the app is about to send or has received —
 * profile, command, length, checksum and the decoded sound-mode/EQ fields — so
 * a hardware test can be reported as exact evidence instead of a screenshot.
 * Nothing here asserts that a device applied a frame: that only ever comes
 * from the device's own state response, which the caller logs separately.
 */
import type { AncLayout, DeviceProfile } from '../types';
import { parseSoundModes } from '../state/derive';
import { toHex, verifyFrame } from './codec';

/** `cat:type` of a framed packet, e.g. `06:81`. */
export function frameKey(frame: ArrayLike<number>): string {
  if (frame.length < 7) return '--';
  const cat = frame[5].toString(16).padStart(2, '0');
  const type = frame[6].toString(16).padStart(2, '0');
  return `${cat}:${type}`;
}

/** Payload bytes of a framed packet (everything between the header and the checksum). */
export function framePayload(frame: ArrayLike<number>): number[] {
  const bytes = Array.from({ length: frame.length }, (_, i) => frame[i]);
  return bytes.length >= 10 ? bytes.slice(9, bytes.length - 1) : [];
}

/** `A3959 p30i · 06:81 · 17B · sum 0x9E · checksum ok · 08 EE …` */
export function summarizeFrame(profile: DeviceProfile, frame: ArrayLike<number>): string {
  const key = frameKey(frame);
  const sum = frame.length ? frame[frame.length - 1].toString(16).padStart(2, '0') : '--';
  const valid = verifyFrame(frame);
  const checksum = valid === true ? 'checksum ok' : valid === false ? 'CHECKSUM BAD' : 'checksum n/a';
  return `${profile.sku} ${profile.id} · ${key} · ${frame.length}B · sum 0x${sum} · ${checksum}`;
}

/** Human-readable decode of a `06:81` payload for the given layout. */
export function describeAncPayload(layout: AncLayout, payload: ArrayLike<number>): string {
  const report = parseSoundModes(payload, layout);
  if (!report) return `sound modes: unparsable for layout ${layout}`;
  const parts: string[] = [`mode=${report.mode}`];
  if (report.subMode) parts.push(`sub=${report.subMode}`);
  if (report.level !== undefined) parts.push(`manualL=${report.level}`);
  if (report.adaptiveLevel !== undefined) parts.push(`adaptiveL=${report.adaptiveLevel}`);
  if (report.scene !== undefined) parts.push(`scene=${report.scene}`);
  if (report.wind !== undefined) parts.push(`wind=${report.wind ? 'on' : 'off'}`);
  if (report.transVocal !== undefined) parts.push(`transVocal=${report.transVocal ? 'on' : 'off'}`);
  if (report.adaptiveSensitivity !== undefined) parts.push(`sens=${report.adaptiveSensitivity}`);
  else parts.push('sens=none(0xFF)');
  return `sound modes: ${parts.join(' ')}`;
}

/** Decode of an equalizer payload (`02:81`, `02:83`, `03:87`). */
export function describeEqPayload(payload: ArrayLike<number>): string {
  if (payload.length < 12) return 'eq: payload too short';
  const preset = payload[0] | (payload[1] << 8);
  const presetName = preset === 0xfefe ? '0xFEFE (custom)' : `0x${preset.toString(16).padStart(4, '0')}`;
  const bands = Array.from({ length: 8 }, (_, i) => ((payload[2 + i] - 120) / 10).toFixed(1) + 'dB').join(' ');
  const raw10 = Array.from({ length: 10 }, (_, i) => payload[2 + i]).join(',');
  const drc = payload.length >= 22 ? Array.from({ length: 10 }, (_, i) => payload[12 + i]).join(',') : 'none';
  return `eq: preset=${presetName} band1-8=[${bands}] raw=[${raw10}] drc=[${drc}]`;
}

/** One line describing any outbound frame, dispatching on `cat:type`. */
export function describeFrame(profile: DeviceProfile, frame: ArrayLike<number>): string {
  const head = summarizeFrame(profile, frame);
  const key = frameKey(frame);
  const payload = framePayload(frame);
  if (key === '06:81' && profile.ancLayout !== 'none') {
    return `${head} · ${describeAncPayload(profile.ancLayout, payload)} · payload=[${payload.join(',')}]`;
  }
  if ((key === '02:81' || key === '02:83' || key === '03:87') && profile.eqCommand) {
    return `${head} · ${describeEqPayload(payload)}`;
  }
  return `${head} · payload=[${payload.join(',')}]`;
}

/** Hex dump helper used by the log and the trace script. */
export function hexPayload(frame: ArrayLike<number>): string {
  return toHex(framePayload(frame));
}
