#!/usr/bin/env node
/**
 * R50i NC (A3959) write-path trace — the software half of
 * `docs/R50I-NC-HARDWARE-VALIDATION.md`.
 *
 * Prints the exact `06:81` / `02:83` frames this build would transmit for
 * every user action on a Soundcore R50i NC, plus the model-gate decision for
 * each one. Run it with the physical earbuds connected to compare the app's
 * console output byte for byte, or paste the output into a bug report.
 *
 *   npm run trace:r50i-nc
 *
 * This script never talks to Bluetooth and never claims a device applied
 * anything: hardware results are recorded by the human running the checklist.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

/* ------------------------------------------------------------- bundling */

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-trace-'));
const bundlePath = join(dir, 'trace.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/protocol/modelRegistry.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/packets.ts';
        export * from './src/protocol/presets.ts';
        export * from './src/protocol/diagnostics.ts';
        export * from './src/state/derive.ts';
        export { toHex } from './src/protocol/codec.ts';
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: bundlePath,
    logLevel: 'silent',
  });
} catch (err) {
  console.error('Could not bundle the protocol modules:', err);
  process.exit(1);
}

const M = await import(bundlePath);

const profile = M.DEVICES.find((d) => d.sku === 'A3959');
if (!profile) {
  console.error('A3959 profile not found');
  process.exit(1);
}
const capabilities = M.deriveCapabilities(profile);

const hex = (frame) => M.toHex(frame);
const payload = (frame) => Array.from(frame.slice(9, frame.length - 1));
const frameOf = (intent) => M.buildAnc(profile.ancLayout, intent);
const gate = (frame) => M.gateCommandForProfile('sound-modes.set', frame, profile);

/** The physical R50i NC reports wind suppression ON, adaptive 5, scene Outdoor. */
const INTENT = {
  mode: 'anc',
  level: 3,
  subMode: 'manual',
  adaptiveLevel: 5,
  scene: 'outdoor',
  transVocal: false,
  wind: true,
};

function report(label, intent, extraNote = '', expectAllowed) {
  const frame = frameOf(intent);
  const decision = frame ? gate(frame) : { ok: false, reason: 'builder returned null' };
  const verdict =
    expectAllowed === undefined
      ? decision.ok
        ? 'ALLOWED for A3959'
        : `REFUSED — ${decision.reason}`
      : expectAllowed === decision.ok
        ? expectAllowed
          ? 'ALLOWED for A3959 (expected)'
          : `REFUSED for this model (expected) — ${decision.reason}`
        : `UNEXPECTED: ${decision.ok ? 'allowed' : `refused — ${decision.reason}`}`;
  console.log(`\n${label}`);
  console.log(`  intent   : ${JSON.stringify(intent)}`);
  console.log(`  TX frame : ${frame ? hex(frame) : '(none — builder refused the intent)'}`);
  if (frame) {
    console.log(`  length   : ${frame.length} bytes (payload ${payload(frame).length})`);
    console.log(`  checksum : 0x${frame[frame.length - 1].toString(16).padStart(2, '0')}`);
    console.log(`  decoded  : ${M.describeFrame(profile, frame)}`);
  }
  console.log(`  gate     : ${verdict}${extraNote ? ` ${extraNote}` : ''}`);
  if (typeof expectAllowed === 'boolean') {
    console.log(`  expected : ${expectAllowed ? 'allowed' : 'refused'} — ${expectAllowed === decision.ok ? 'MATCHES' : 'MISMATCH (investigate)'}`);
  }
  return frame;
}

console.log('================================================================');
console.log(' SoundControl — R50i NC (A3959) write-path trace');
console.log('================================================================');
console.log(`profile        : ${profile.name} (id ${profile.id}, SKU ${profile.sku})`);
console.log(`sound-mode cmd : 06:81 · layout ${profile.ancLayout}`);
console.log(`EQ command     : ${profile.eqCommand} · custom EQ ${profile.customEq ? 'allowed (0xFEFE)' : 'withheld'}`);
console.log(`automation byte: 0x00 = Manual · 0x01 = Adaptive · 0x02 = Multi-scene (OpenSCQ30 9b6e42a7)`);
console.log(`nibble byte    : high = manual 1..5 · low = firmware-owned adaptive 1..5`);
console.log(`sensitivity    : byte 5, 0..10, 0xFF when the device reports none`);
console.log(`transparency   : ${capabilities.supportsTransparencyMode ? 'offered' : 'NOT offered — the model gate refuses the ambient 0x01 frame'}`);
console.log(`surround (02:86): ${profile.surround ? 'offered (documented for this model)' : 'not offered'}`);
console.log(`preset table   : ${profile.presetSet ?? 'standard'}`);
console.log(`source         : ${profile.source}`);

/* ------------------------------------------------ 1. ANC write path */

console.log('\n----------------------------------------------------------------');
console.log('1. ANC / scene / adaptive / wind — exact frames');
console.log('----------------------------------------------------------------');
for (const level of [1, 2, 3, 4, 5]) {
  report(`ANC level ${level} (manual sub-mode)`, { ...INTENT, level });
}
report('Adaptive ANC (firmware owns the strength; nibble preserved)', {
  ...INTENT,
  mode: 'adaptive',
  subMode: 'adaptive',
  adaptiveLevel: 3,
});
report('Transport scene (multi-scene sub-mode)', { ...INTENT, subMode: 'multiscene', scene: 'transport' });
report('Outdoor scene (multi-scene sub-mode)', { ...INTENT, subMode: 'multiscene', scene: 'outdoor' });
report('Indoor scene (multi-scene sub-mode)', { ...INTENT, subMode: 'multiscene', scene: 'indoor' });
report('Wind-noise suppression ON', { ...INTENT, wind: true });
report(
  'Transparency — refused for this model (no documented transparency mode)',
  { ...INTENT, mode: 'transparency' },
  '',
  capabilities.supportsTransparencyMode,
);
report('Normal', { ...INTENT, mode: 'normal' });
report('Sensitivity echoed from a device report of 7', { ...INTENT, adaptiveSensitivity: 7 });

/* -------------------------------------------- 2. five levels side by side */

console.log('\n----------------------------------------------------------------');
console.log('2. The five manual levels side by side (bytes that differ marked *)');
console.log('----------------------------------------------------------------');
const levelFrames = [1, 2, 3, 4, 5].map((level) => frameOf({ ...INTENT, level }));
const width = Math.max(...levelFrames.map((f) => hex(f).length));
const reference = payload(levelFrames[0]);
for (let i = 0; i < levelFrames.length; i++) {
  const bytes = payload(levelFrames[i]);
  const diff = bytes
    .map((b, idx) => (b === reference[idx] ? b.toString(16).padStart(2, '0') : `${b.toString(16).padStart(2, '0')}*`))
    .join(' ');
  console.log(`  level ${i + 1}: payload [ ${diff} ]  frame ${hex(levelFrames[i]).padEnd(width)}`);
}
console.log(`  byte 1 high nibble = manual level; all other payload bytes are identical.`);

/* ------------------------------------------------------------- 3. EQ */

console.log('\n----------------------------------------------------------------');
console.log('3. Equalizer — every factory preset and the extreme custom curve');
console.log('----------------------------------------------------------------');
const PHYSICAL_TEST_PRESETS = ['Soundcore Signature', 'Flat', 'Bass Booster', 'Acoustic'];
const presets = M.presetsForProfile(profile);
console.log(`\n  (preset table: ${profile.presetSet ?? 'standard'} — ${presets.length} factory curves)`);
for (const preset of presets) {
  const physical = PHYSICAL_TEST_PRESETS.includes(preset.name) ? '  ← physical test' : '';
  const frame = M.buildEq(profile.eqCommand, preset.index, preset.bands);
  const decision = M.gateCommandForProfile(
    profile.eqCommand === '02:83' ? 'equalizer.set-drc' : 'equalizer.set',
    frame,
    profile,
  );
  console.log(`\n  ${preset.name} (id 0x${preset.index.toString(16).padStart(4, '0')})${physical}`);
  console.log(`    TX  : ${hex(frame)}`);
  console.log(`    len : ${frame.length} bytes · ${M.describeEqPayload(payload(frame))}`);
  console.log(`    gate: ${decision.ok ? 'ALLOWED for A3959' : `REFUSED — ${decision.reason}`}`);
}
const extreme = [12, -12, 12, -12, 12, -12, 12, -12];
const customFrame = M.buildCustomEq(profile, extreme);
{
  const decision = M.gateCommandForProfile('equalizer.set-drc', customFrame, profile);
  console.log(`\n  Extreme custom curve ${JSON.stringify(extreme)} dB (preset 0xFEFE)`);
  console.log(`    TX  : ${hex(customFrame)}`);
  console.log(`    len : ${customFrame.length} bytes · ${M.describeEqPayload(payload(customFrame))}`);
  console.log(`    gate: ${decision.ok ? 'ALLOWED for A3959' : `REFUSED — ${decision.reason}`}`);
}

/* --------------------------------------------------- 4. what to capture */

console.log('\n----------------------------------------------------------------');
console.log('4. What to capture on the physical R50i NC');
console.log('----------------------------------------------------------------');
console.log(`
  1. Connect the earbuds in SoundControl (Settings → Diagnostics → Open console).
  2. Press "Read state" and keep the log — this is the BEFORE state frame.
  3. Perform ONE action from the checklist in docs/R50I-NC-HARDWARE-VALIDATION.md.
  4. Press "Read state" again and keep the log — this is the AFTER state frame.
  5. Export JSON (or paste the log lines) together with:
       - the TX line (contains the full frame hex and the decoded fields),
       - the "STATE sound modes @64 [...]" line (the device's own report),
       - the audible result you observed.
  The AFTER line must differ from the BEFORE line for the write to count as
  applied. If the two are identical, the firmware rejected or ignored the
  frame — that is the evidence we need, not a success message.
`);

rmSync(dir, { recursive: true, force: true });
