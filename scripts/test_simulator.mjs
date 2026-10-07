/**
 * Profile-wide simulator fixtures.
 *
 * The simulator is deliberately not a hardware claim. This test only proves
 * that every independently documented profile can produce a checksum-valid
 * state frame whose payload reaches the offsets declared by that row, and
 * that every model-specific 06:01 mirror has the declared sound-mode shape.
 * Catalog-only identities are intentionally excluded: their state layout is
 * unknown, so a generic fixture would be false evidence.
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
        export { parseCaseBatteryStateFrame } from './src/protocol/responses.ts';
        export { parseObservedFeatures, EMPTY_OBSERVED } from './src/protocol/observedFeatures.ts';
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
  const simulatedProfiles = profiles.filter((profile) => profile.verified);
  const unverifiedProfiles = profiles.filter((profile) => !profile.verified);
  check('registered profile count is stable', profiles.length === 48, `${profiles.length}`);
  check('documented profiles have simulator fixtures', simulatedProfiles.length > 0);
  check('fixture SKUs are unique', new Set(simulatedProfiles.map((p) => p.sku)).size === simulatedProfiles.length);
  for (const profile of unverifiedProfiles) {
    let rejected = false;
    try {
      M.connectSimulator(() => {}, profile);
    } catch {
      rejected = true;
    }
    check(`${profile.sku}: undocumented simulator fixture is rejected`, rejected);
  }

  const runs = simulatedProfiles.map((profile) => new Promise((resolveRun) => {
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

    if (profile.state.batteryCase !== null) {
      const scale = profile.caseBatteryMax;
      check(`${profile.sku}: case field has a separately documented scale`, Number.isInteger(scale) && scale > 0);
      check(`${profile.sku}: case fixture decodes only from validated full state`, M.parseCaseBatteryStateFrame(state, profile) === Math.round((3 + (profile.caseBatteryOffset ?? 0)) * 100 / scale));
    } else {
      check(`${profile.sku}: model without a case never decodes one`, M.parseCaseBatteryStateFrame(state, profile) === null);
    }

    const observed = M.parseObservedFeatures(state, profile);
    if (profile.sku === 'A3040') check('A3040 simulator provides only model-scoped readouts', observed?.q45DoublePress === 'BassUp' && observed?.safeVolume?.limitDb === 90);
    else if (profile.sku === 'A3954') check('A3954 simulator includes spatial state + limiter', observed?.spatial?.tracking === 'Fixed' && observed?.safeVolume?.limitDb === 95);
    else if (profile.sku === 'D1202') check('D1202 simulator includes spatial state + limiter', observed?.spatial?.mode === 'Music' && observed?.safeVolume?.limitDb === 90);
    else if (profile.sku === 'A3945') check('A3945 simulator has labelled synthetic BassUp, EQ, game and six actions', observed?.lifeNoteBassUp === true && observed?.lifeNoteEq === 'Soundcore Signature' && observed?.lifeNoteGaming === true && observed?.lifeNoteButtons?.length === 6);
    else if (profile.sku === 'D1301') check('D1301 simulator has synthetic post-sleep setting only', observed?.sleepAfter === 'Pause audio' && observed?.lifeNoteBassUp === null);
    else check(`${profile.sku}: no synthetic observed features on unrelated SKU`, JSON.stringify(observed) === JSON.stringify(M.EMPTY_OBSERVED));

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
console.log('All documented profiles exercise a valid local simulator path; undocumented profiles are rejected.');
