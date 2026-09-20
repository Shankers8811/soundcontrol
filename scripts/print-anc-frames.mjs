#!/usr/bin/env node
/**
 * Print the EXACT `06:81` frames the A3959 actions will send, for a given
 * device-reported sound-mode block. The default baseline is the recorded real
 * A3959 state (`tests/fixtures/a3959-recorded-state.json`, payload 64..70), so
 * a maintainer running the hardware test can compare the live TX log line by
 * line. Frames depend on what the earbuds report, which is why this prints a
 * table per action instead of one "the ANC frame" constant.
 *
 *   node scripts/print-anc-frames.mjs [--block 00 55 00 00 01 FF 01]
 *
 * Test/diagnostic tool only: it writes nothing to a device and touches no
 * Windows audio API.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'anc-frames-'));
try {
  const out = join(dir, 'frames.mjs');
  await build({
    stdin: {
      contents: `export * from './src/protocol/packets.ts'; export * from './src/protocol/p30i.ts'; export * from './src/protocol/codec.ts';`,
      resolveDir: root,
      loader: 'ts',
    },
    outfile: out, bundle: true, platform: 'node', format: 'esm',
  });
  const m = await import(pathToFileURL(out).href);

  const argIndex = process.argv.indexOf('--block');
  const recorded = JSON.parse(readFileSync(join(root, 'tests/fixtures/a3959-recorded-state.json'), 'utf8'));
  const baseline = Uint8Array.from(
    argIndex > 0
      ? process.argv.slice(argIndex + 1, argIndex + 8).map((v) => parseInt(v, 16))
      : recorded.soundModeBlock,
  );
  const describe = (b) =>
    `ambient=${b[0]} manual=${b[1] >> 4} adaptive=${b[1] & 15} automation=${b[3]} wind=${b[4] & 1} sensitivity=0x${b[5].toString(16).padStart(2, '0').toUpperCase()} scene=${b[6]}`;

  console.log(`Baseline (device-reported) block: ${m.toHex(baseline)}`);
  console.log(`  ${describe(baseline)}\n`);

  const actions = [
    ['Normal', { mode: 'normal', level: 5, scene: 'outdoor' }],
    ['Transparency', { mode: 'transparency', level: 5, scene: 'outdoor' }],
    ['Manual 1', { mode: 'anc', level: 1, scene: 'outdoor' }],
    ['Manual 2', { mode: 'anc', level: 2, scene: 'outdoor' }],
    ['Manual 3', { mode: 'anc', level: 3, scene: 'outdoor' }],
    ['Manual 4', { mode: 'anc', level: 4, scene: 'outdoor' }],
    ['Manual 5', { mode: 'anc', level: 5, scene: 'outdoor' }],
    ['Adaptive', { mode: 'adaptive', level: 5, scene: 'outdoor' }],
    ['Scene transport', { mode: 'anc', level: 5, scene: 'transport', automation: 2 }],
    ['Scene outdoor', { mode: 'anc', level: 5, scene: 'outdoor', automation: 2 }],
    ['Scene indoor', { mode: 'anc', level: 5, scene: 'indoor', automation: 2 }],
    ['Wind off (keeps mode)', { mode: 'anc', level: 5, scene: 'outdoor', wind: false }],
    ['Wind on (keeps mode)', { mode: 'anc', level: 5, scene: 'outdoor', wind: true }],
  ];

  for (const [label, action] of actions) {
    const { automation, ...rest } = action;
    const intent = {
      ...rest,
      wind: action.wind ?? (baseline[4] & 1) !== 0,
      transVocal: false,
      p30iState: baseline,
      ...(automation ? { p30iAutomation: automation } : {}),
    };
    const target = m.buildP30iAnc(intent).slice(9, -1);
    const steps = m.planP30iAnc(baseline, target);
    console.log(`${label}`);
    steps.forEach((frame, i) => {
      const payload = frame.slice(9, -1);
      console.log(`  step ${i + 1}: ${m.toHex(frame)}`);
      console.log(`           → ${describe(payload)}`);
    });
    if (steps.length === 0) console.log('  (no change required)');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
