import { frame } from './packets';

/**
 * A3959-specific evidence. See docs/PHASE-19-ANC-AUDIT.md and
 * docs/PHASE-20-FINAL-REPORT.md.
 *
 * Incoming bytes are parsed independently; byte 2 is an enum but upstream
 * ignores its value (it need not equal byte 0). Never write wind-detected
 * bit 1.
 *
 * Byte 5 is deliberately NOT range-checked. It is the read-only
 * adaptive-sensitivity byte: OpenSCQ30's A3959 setting handler exposes it as
 * a 0..=10 control range, but the recorded real-hardware state in
 * tests/fixtures/a3959-recorded-state.json reports 0xFF there — this
 * protocol family's "unknown/unset" marker. Phase 19 required <= 10 here, which
 * made the whole state frame invalid on such a device and stopped every ANC
 * write before it was sent. We pass the byte through verbatim and report the
 * out-of-range value as a diagnostic instead of refusing to talk to the
 * earbuds over a field we never write.
 */
export const P30I_SENSITIVITY_DOCUMENTED_MAX = 10;

/** True when byte 5 is inside the documented control range (diagnostics only). */
export function p30iSensitivityInDocumentedRange(p: ArrayLike<number>): boolean {
  return p.length > 5 && p[5] <= P30I_SENSITIVITY_DOCUMENTED_MAX;
}

export function validP30iSoundModes(p: ArrayLike<number>): boolean {
  return p.length === 7 && p[0] <= 2 && p[2] <= 2 &&
    (p[1] >> 4) >= 1 && (p[1] >> 4) <= 5 && (p[1] & 15) <= 5 &&
    p[3] <= 2 && p[4] <= 3 && p[6] <= 2;
}

/** One-field transitions with A3959's OpenSCQ30 MigrationSteps dependencies.
 * This is a source-derived candidate sequence, not an Android capture replay.
 * The caller MUST await each 06:81 reply, then independently request state.
 * Read-only adaptive strength and sensitivity are preserved, not synthesized.
 */
export function planP30iAnc(from: Uint8Array, to: Uint8Array): Uint8Array[] {
  if (!validP30iSoundModes(from) || !validP30iSoundModes(to)) throw new Error('Invalid A3959 sound-mode state');
  if ((from[1] & 15) !== (to[1] & 15) || from[5] !== to[5]) throw new Error('Do not derive adaptive fields from manual level');
  const tuple = (p: Uint8Array) => [p[0], p[3], p[1] >> 4, p[6], p[4] & 1];
  const start = tuple(from), target = tuple(to);
  const key = (s: number[]) => s.join(',');
  const queue = [{ state: start, path: [] as number[][] }];
  const seen = new Set([key(start)]);
  for (let at = 0; at < queue.length; at++) {
    const { state: s, path } = queue[at];
    if (key(s) === key(target)) {
      // Re-sending the same setting is useful for a physical comparison.
      const steps = path.length ? path : [target];
      return steps.map(([ambient, automation, manual, scene, wind]) =>
        frame(0x06, 0x81, [ambient, (manual << 4) | (from[1] & 15), ambient,
          automation, wind, from[5], scene]));
    }
    const choices = [
      [target[0], 0, 1],
      s[0] === 0 ? [target[1], 0, 2] : [],
      s[0] === 0 && s[1] === 0 ? [target[2]] : [],
      s[0] === 0 && s[1] === 2 ? [target[3]] : [],
      s[0] !== 2 ? [target[4]] : [],
    ];
    choices.forEach((values, i) => values.forEach(value => {
      const next = [...s]; next[i] = value;
      if (!seen.has(key(next))) { seen.add(key(next)); queue.push({ state: next, path: [...path, next] }); }
    }));
  }
  throw new Error('No source-supported A3959 transition');
}

/** Match writable state only; a firmware echo/ack is not sufficient. */
export function p30iReportMatches(actual: Uint8Array, requested: Uint8Array): boolean {
  return validP30iSoundModes(actual) && actual[0] === requested[0] &&
    actual[3] === requested[3] && (actual[4] & 1) === (requested[4] & 1) &&
    (requested[0] !== 0 || requested[3] !== 0 || (actual[1] >> 4) === (requested[1] >> 4)) &&
    (requested[0] !== 0 || requested[3] !== 2 || actual[6] === requested[6]);
}
