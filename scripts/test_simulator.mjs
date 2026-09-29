/**
 * Profile-wide simulator fixtures.
 *
 * The simulator is deliberately not a hardware claim. This test only proves
 * that every catalog/profile row can produce a checksum-valid state frame
 * whose payload reaches the offsets declared by that row, and that every
 * model-specific 06:01 mirror has the declared sound-mode shape.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const temp = mkdtempSync(join(tmpdir(), 'soundcontrol-sim-'));
const bundle = join(temp, 'simulator.mjs');
let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/transports/simulator.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/modelRegistry.ts';
        export * from './src/protocol/codec.ts';
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: bundle,
    logLevel: 'silent',
  });

  const M = await import(pathToFileURL(bundle).href);
  // connectSimulator intentionally uses window.setTimeout because it is a
  // renderer transport. A tiny deterministic browser seam is enough here.
  globalThis.window = { setTimeout };

  const profiles = M.DEVICES;
  check('every registered profile has a fixture', profiles.length === 44, `${profiles.length}`);
  check('fixture SKUs are unique', new Set(profiles.map((p) => p.sku)).size === profiles.length);

  const runs = profiles.map((profile) => new Promise((resolveRun) => {
    const frames = [];
    const simulator = M.connectSimulator((data) => frames.push(data), profile);
    // The app requests 01:01 during attach; mirror that handshake here so
    // every profile exercises both its state blob and 06:01 sound-mode path.
    void simulator.transport.write(new Uint8Array([0x08, 0xee, 0x00, 0x00, 0x00, 0x01, 0x01, 0x0a, 0x00, 0x02]));
    setTimeout(() => resolveRun({ profile, frames }), 145);
  }));
  const results = await Promise.all(runs);

  for (const { profile, frames } of results) {
    const state = frames.find((frame) => frame[5] === 0x01 && frame[6] === 0x01 && frame.length > 10);
    check(`${profile.sku}: initial state frame exists`, Boolean(state));
    if (!state) continue;
    check(`${profile.sku}: state checksum`, M.verifyFrame(state) === true);
    const declared = state[7] | (state[8] << 8);
    check(`${profile.sku}: state declared length`, declared === state.length);
    const payload = state.slice(9, -1);
    const required = M.requiredStateLength(profile.state);
    check(`${profile.sku}: payload reaches required offsets`, payload.length >= required, `${payload.length} < ${required}`);
    check(`${profile.sku}: left battery fixture is 4`, payload[profile.state.batteryLeft] === 4);
    if (profile.state.batteryRight !== null) {
      check(`${profile.sku}: right battery fixture is 4`, payload[profile.state.batteryRight] === 4);
    }

    if (profile.ancLayout !== 'none') {
      const sound = frames.find((frame) => frame[5] === 0x06 && frame[6] === 0x01 && frame.length > 10);
      check(`${profile.sku}: sound-mode mirror exists`, Boolean(sound));
      if (sound) {
        check(`${profile.sku}: sound-mode checksum`, M.verifyFrame(sound) === true);
        const soundPayload = sound.slice(9, -1);
        const expectedLength = profile.state.soundModeLength ?? 7;
        check(`${profile.sku}: sound-mode shape`, soundPayload.length === expectedLength, `${soundPayload.length} != ${expectedLength}`);
      }
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`Simulator fixtures: ${passed} checks`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('All registered profiles exercise a valid local simulator path.');
