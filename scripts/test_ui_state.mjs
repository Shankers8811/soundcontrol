#!/usr/bin/env node
/**
 * Deterministic UI-state tests (no DOM, no UI test framework).
 *
 * The renderer's device-truth logic lives in pure modules — src/state/derive.ts
 * (capabilities, battery math, per-side earbud state, connection phase, the
 * Devices-page scan reducer) and src/protocol/devices.ts (the per-model
 * profile table). This harness bundles them with esbuild (the same approach
 * scripts/test_startup_e2e.mjs uses for the transport) and asserts the full
 * matrices:
 *
 *   1. capability derivation for EVERY profile in the model table — including
 *      the two hard protocol facts the UI must never fake (no volume command,
 *      no gesture-write command) and the per-layout 06:81 sub-features
 *   2. battery byte rules (0xFF = side absent, >100 = noise, scale math for
 *      0..5 / 0..10 / Windows-percent values, passthrough above scale)
 *   3. earbud presence + per-side state: both / left-only / right-only /
 *      none / unknown — with "unknown" kept distinct from "disconnected"
 *      and stale batteries suppressed for absent sides
 *   4. connection-phase precedence (connected > connecting > error > idle)
 *   5. the scan state machine: scanning / results / empty / error /
 *      helper-offline transitions
 *
 * Run: npm run test:ui
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ------------------------------------------------------------- bundling */

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-ui-state-'));
const bundlePath = join(dir, 'ui-state.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `export * from './src/state/derive.ts'; export * from './src/protocol/devices.ts';`,
      sourcefile: 'ui-state-barrel.ts',
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: bundlePath,
    logLevel: 'error',
  });
} catch (err) {
  console.error(`esbuild failed:\n${err?.message ?? err}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

const M = await import(pathToFileURL(bundlePath).href);
const {
  DEVICES,
  ANC_SUB_FEATURES,
  deriveCapabilities,
  batteryLevel,
  batteryPercent,
  presenceFromRaw,
  deriveEarbudState,
  deriveConnectionPhase,
  nextScanState,
  INITIAL_SCAN_STATE,
  EMPTY_SCAN_MESSAGE,
} = M;

const byId = (id) => DEVICES.find((d) => d.id === id);

/* ============================== 1. capabilities ========================= */

console.log('\n[1] capability derivation (protocol truth per model)');

check('model table has the 10 documented profiles', DEVICES.length === 10, `got ${DEVICES.length}`);

for (const d of DEVICES) {
  const c = deriveCapabilities(d);
  // Two hard protocol facts: NO model gets a fake volume slider or fake
  // gesture remapping — no such command exists in any public capture.
  check(`${d.id}: volume is never claimed`, c.supportsVolume === false);
  check(`${d.id}: gesture writes are never claimed`, c.supportsGestures === false);
  // 01:05 firmware/serial is implemented by every supported model.
  check(`${d.id}: firmware info supported`, c.supportsFirmwareInfo === true);
  // Noise control exactly when a sound-mode layout exists.
  eq(`${d.id}: supportsNoiseControl`, c.supportsNoiseControl, d.ancLayout !== 'none');
  // EQ exactly when a real EQ command exists (never for the 03:87 models).
  eq(`${d.id}: supportsEqualizer`, c.supportsEqualizer, d.eqCommand !== null);
  // Per-side earbud state only for TWS hardware with two battery bytes.
  eq(
    `${d.id}: supportsEarbudState`,
    c.supportsEarbudState,
    d.kind === 'earbuds' && d.state.batteryRight !== null,
  );
  eq(`${d.id}: gaming/surround/dual/ldac flags`, [c.supportsGaming, c.supportsSurround, c.supportsDual, c.supportsLdac], [d.gaming, d.surround, d.dual, d.ldac]);
  // 01:85 is documented ONLY for the Motion+ (A3116) speaker — no profile in
  // this table may claim a destructive frame it has no source for.
  check(`${d.id}: factory reset never claimed without documentation`, c.supportsFactoryReset === (d.factoryReset === true) && d.factoryReset !== true);
}

// Per-layout 06:81 sub-features (byte-level truth from PROTOCOL.md).
eq('classic layout sub-features', ANC_SUB_FEATURES.classic, {
  level: false, scenes: true, transVocal: true, wind: false, adaptive: false,
});
eq('tws-p30i layout sub-features (no vocal byte on this model)', ANC_SUB_FEATURES['tws-p30i'], {
  level: true, scenes: true, transVocal: false, wind: true, adaptive: true,
});
eq('tws-l4nc layout sub-features', ANC_SUB_FEATURES['tws-l4nc'], {
  level: true, scenes: true, transVocal: true, wind: true, adaptive: true,
});
eq('tws-l3pro layout sub-features (no scene byte)', ANC_SUB_FEATURES['tws-l3pro'], {
  level: true, scenes: false, transVocal: true, wind: true, adaptive: true,
});

// Spot-check the capability consequences for representative models.
eq('q30 (classic): no ANC level slider, scenes yes', [
  deriveCapabilities(byId('q30')).ancSub.level,
  deriveCapabilities(byId('q30')).ancSub.scenes,
], [false, true]);
eq('space-q45 (classic): EQ disabled (03:87), NC enabled', [
  deriveCapabilities(byId('q45')).supportsEqualizer,
  deriveCapabilities(byId('q45')).supportsNoiseControl,
], [false, true]);
eq('p20i: no noise control at all (no sound-mode module)', deriveCapabilities(byId('p20i')).supportsNoiseControl, false);
eq('p20i: no ANC sub-features leak when layout is none', deriveCapabilities(byId('p20i')).ancSub, {
  level: false, scenes: false, transVocal: false, wind: false, adaptive: false,
});
eq('liberty-4-nc: EQ disabled, earbud state enabled', [
  deriveCapabilities(byId('liberty-4-nc')).supportsEqualizer,
  deriveCapabilities(byId('liberty-4-nc')).supportsEarbudState,
], [false, true]);
eq('p30i: 0..10 battery scale', byId('p30i').batteryMax, 10);

/* ============================== 2. battery math ========================= */

console.log('\n[2] battery byte rules and percent math');

eq('0xFF is "side absent", never 255%', batteryLevel(0xff), null);
eq('undefined byte is unavailable', batteryLevel(undefined), null);
eq('values >100 are layout noise', batteryLevel(101), null);
eq('0 is a real (empty) level, not null', batteryLevel(0), 0);
eq('level 4 stays 4', batteryLevel(4), 4);

eq('4 of 5 steps = 80%', batteryPercent(4, 5), 80);
eq('8 of 10 steps = 80%', batteryPercent(8, 10), 80);
eq('0 of 5 steps = 0%', batteryPercent(0, 5), 0);
eq('Windows PnP percent passes through (scale null)', batteryPercent(87, null), 87);
eq('null level stays unavailable', batteryPercent(null, 5), null);
eq('level above scale passes through, not rescaled', batteryPercent(7, 5), 7);
eq('absurd percent is clamped, never shows 140%', batteryPercent(140, null), 100);

/* ========================= 3. presence + earbuds ======================== */

console.log('\n[3] earbud presence and per-side state (unknown ≠ disconnected)');

eq('both sides present', presenceFromRaw(4, 4), 'both');
eq('left only (0xFF right)', presenceFromRaw(4, 0xff), 'left');
eq('right only (0xFF left)', presenceFromRaw(0xff, 4), 'right');
eq('neither side (0xFF both)', presenceFromRaw(0xff, 0xff), 'none');
eq('single byte (over-ear) is unknown, not none', presenceFromRaw(4, undefined), 'unknown');
eq('no bytes at all is unknown', presenceFromRaw(undefined, undefined), 'unknown');

const twsCaps = deriveCapabilities(byId('liberty-4-nc'));
const overEarCaps = deriveCapabilities(byId('q45'));

eq('over-ears get no per-side card at all', deriveEarbudState({ left: 4, right: null }, overEarCaps), null);

const unknownState = deriveEarbudState({ left: 80, right: 80, batteryScale: null, presence: 'unknown' }, twsCaps);
eq('unknown presence → both sides "unknown"', [unknownState.left.connection, unknownState.right.connection], ['unknown', 'unknown']);
eq('unknown presence → no battery claimed per side', [unknownState.left.battery, unknownState.right.battery], [null, null]);

const leftOnly = deriveEarbudState(
  { left: 4, right: 4, batteryScale: 5, presence: 'left', leftCharging: true, rightCharging: true },
  twsCaps,
);
eq('left-only: left connected at 80%', [leftOnly.left.connection, leftOnly.left.battery], ['connected', 80]);
eq('left-only: right disconnected', leftOnly.right.connection, 'disconnected');
eq('left-only: stale right battery suppressed', leftOnly.right.battery, null);
eq('left-only: charging shown only for the connected side', [leftOnly.left.charging, leftOnly.right.charging], [true, null]);

const both = deriveEarbudState({ left: 8, right: 6, batteryScale: 10, presence: 'both' }, twsCaps);
eq('both: independent per-side percents', [both.left.battery, both.right.battery], [80, 60]);

const none = deriveEarbudState({ left: 4, right: 4, batteryScale: 5, presence: 'none' }, twsCaps);
eq('none: both sides disconnected, no batteries', [
  none.left.connection, none.left.battery, none.right.connection, none.right.battery,
], ['disconnected', null, 'disconnected', null]);

const missingPresence = deriveEarbudState({ left: 4, right: 4, batteryScale: 5 }, twsCaps);
eq('absent presence field defaults to unknown', [
  missingPresence.left.connection, missingPresence.right.connection,
], ['unknown', 'unknown']);

/* ======================= 4. connection phase ============================ */

console.log('\n[4] connection phase precedence');

eq('connected wins over everything', deriveConnectionPhase({ connected: true, connecting: true, error: 'x' }), 'connected');
eq('connecting beats error', deriveConnectionPhase({ connected: false, connecting: true, error: 'x' }), 'connecting');
eq('error surfaces when idle', deriveConnectionPhase({ connected: false, connecting: false, error: 'boom' }), 'error');
eq('clean idle is disconnected', deriveConnectionPhase({ connected: false, connecting: false, error: null }), 'disconnected');

/* ========================= 5. scan state machine ======================== */

console.log('\n[5] Devices-page scan state machine');

const s0 = INITIAL_SCAN_STATE;
eq('starts checking the helper', [s0.helper, s0.status], ['checking', 'idle']);

const s1 = nextScanState(s0, { type: 'start' });
eq('manual scan → scanning, message cleared', [s1.status, s1.message], ['scanning', null]);

const s2 = nextScanState(s1, {
  type: 'results',
  devices: [{ id: 'AA', name: 'soundcore Q30', mac: 'AA', battery: 80 }],
  at: 1234,
});
eq('results → results + devices + timestamp + helper online', [s2.status, s2.devices.length, s2.lastScanAt, s2.helper], ['results', 1, 1234, 'online']);

const s3 = nextScanState(s1, { type: 'results', devices: [], at: 5 });
eq('empty list → empty state with pairing hint', [s3.status, s3.message], ['empty', EMPTY_SCAN_MESSAGE]);

const s4 = nextScanState(s2, { type: 'error', message: 'scan failed' });
eq('error → error state keeps helper status', [s4.status, s4.message, s4.helper], ['error', 'scan failed', 'online']);

const s5 = nextScanState(s2, { type: 'helper-offline', message: 'helper down' });
eq('helper-offline → offline + error + stale devices cleared', [s5.helper, s5.status, s5.devices.length], ['offline', 'error', 0]);

const s6 = nextScanState(s0, { type: 'helper', online: true });
eq('background health probe flips helper online without touching scan status', [s6.helper, s6.status], ['online', 'idle']);
const s7 = nextScanState(s6, { type: 'helper', online: false });
eq('health probe can also report offline', s7.helper, 'offline');

/* ------------------------------------------------------------- verdict */

rmSync(dir, { recursive: true, force: true });

console.log(`\n  ${passed} checks`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All UI state derivation checks passed.');
