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
  emptyBattery,
  mergeBatteryTelemetry,
  parseSoundModes,
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
eq('untrustworthy byte (>100) is unknown, never "present"', presenceFromRaw(0xff, 245), 'unknown');
eq('garbage on both sides is unknown', presenceFromRaw(245, 245), 'unknown');

const twsCaps = deriveCapabilities(byId('liberty-4-nc'));
const overEarCaps = deriveCapabilities(byId('q45'));

// TEST 6 — unsupported/non-TWS: explicit 'unavailable', never fake sides.
const overEar = deriveEarbudState({ left: 4, right: null }, overEarCaps);
eq('over-ears: supported=false, aggregate unavailable', [overEar.supported, overEar.connection], [false, 'unavailable']);
eq('over-ears: both sides explicitly unavailable with no data', [
  overEar.left.state, overEar.left.battery, overEar.right.state, overEar.right.battery,
], ['unavailable', null, 'unavailable', null]);

// TEST 5 — no valid telemetry: unknown (never 'disconnected').
const unknownState = deriveEarbudState(emptyBattery(), twsCaps);
eq('unknown: both sides unknown', [unknownState.left.state, unknownState.right.state], ['unknown', 'unknown']);
eq('unknown: aggregate unknown', unknownState.connection, 'unknown');
eq('unknown: no battery claimed per side', [unknownState.left.battery, unknownState.right.battery], [null, null]);
check('unknown: supported flag stays true (model HAS sides)', unknownState.supported === true);

const leftOnly = deriveEarbudState(
  { left: 4, right: 4, batteryScale: 5, presence: 'left', leftCharging: true, rightCharging: true },
  twsCaps,
);
eq('left-only: left connected at 80%', [leftOnly.left.state, leftOnly.left.battery], ['connected', 80]);
eq('left-only: right explicitly disconnected', leftOnly.right.state, 'disconnected');
eq('left-only: stale right battery suppressed', leftOnly.right.battery, null);
eq('left-only: aggregate is left', leftOnly.connection, 'left');
eq('left-only: charging shown only for the connected side', [leftOnly.left.charging, leftOnly.right.charging], [true, null]);

const both = deriveEarbudState({ left: 8, right: 6, batteryScale: 10, presence: 'both' }, twsCaps);
eq('both: independent per-side percents', [both.left.battery, both.right.battery], [80, 60]);
eq('both: aggregate both from side states', [both.left.state, both.right.state, both.connection], ['connected', 'connected', 'both']);

const rightOnly = deriveEarbudState({ left: 0, right: 9, batteryScale: 10, presence: 'right' }, twsCaps);
eq('right-only: left disconnected (stale 0 suppressed), right 90%', [
  rightOnly.left.state, rightOnly.left.battery, rightOnly.right.state, rightOnly.right.battery, rightOnly.connection,
], ['disconnected', null, 'connected', 90, 'right']);

const none = deriveEarbudState({ left: 4, right: 4, batteryScale: 5, presence: 'none' }, twsCaps);
eq('none: both sides disconnected, no batteries', [
  none.left.state, none.left.battery, none.right.state, none.right.battery, none.connection,
], ['disconnected', null, 'disconnected', null, 'none']);

const missingPresence = deriveEarbudState({ left: 4, right: 4, batteryScale: 5 }, twsCaps);
eq('absent presence field defaults to unknown', [
  missingPresence.left.state, missingPresence.right.state, missingPresence.connection,
], ['unknown', 'unknown', 'unknown']);

/* ================ 3b. source-of-truth telemetry merge ==================== */
/* The store merges every battery frame through mergeBatteryTelemetry. These */
/* are the Pass-4 regression tests: a side reported 0xFF (or missing, or      */
/* untrustworthy) must lose its previous level AT THE SOURCE — the UI never   */
/* gets a chance to mask a stale value. Raw percents (scale null) are used so */
/* the numbers match the spec cases exactly: L=100 R=90 etc.                  */

console.log('\n[3b] stale-battery regressions (mergeBatteryTelemetry)');

const merge = (prev, rawL, rawR, extra = {}) =>
  mergeBatteryTelemetry(prev, { rawLeft: rawL, rawRight: rawR, scale: null, ...extra });

// TEST 9 shape: the cleared state every connect/disconnect starts from.
eq('emptyBattery: no levels, no flags, presence unknown', emptyBattery(), {
  left: null, right: null, leftCharging: undefined, rightCharging: undefined,
  batteryScale: null, presence: 'unknown',
});

// TEST 10 — fresh connection: unknown until the first valid frame, then confirmed.
const t10a = merge(emptyBattery(), undefined, undefined);
eq('fresh link, no bytes yet → unknown/null', [t10a.left, t10a.right, t10a.presence], [null, null, 'unknown']);
const t10b = merge(t10a, 100, 90);
eq('first valid frame confirms both sides', [t10b.left, t10b.right, t10b.presence], [100, 90, 'both']);

// TEST 1 — BOTH: L=100 R=90.
const t1 = merge(emptyBattery(), 100, 90);
const t1d = deriveEarbudState(t1, twsCaps);
eq('TEST 1 both: states/aggregate', [t1d.left.state, t1d.right.state, t1d.connection], ['connected', 'connected', 'both']);
eq('TEST 1 both: batteries 100/90', [t1d.left.battery, t1d.right.battery], [100, 90]);

// TEST 2 + TEST 7 (CRITICAL) — R goes 0xFF while its previous level was 90.
const t2 = merge(t1, 100, 0xff);
eq('TEST 2 left-only: merge keeps left, nulls right', [t2.left, t2.right, t2.presence], [100, null, 'left']);
check('TEST 7 CRITICAL: previous right=90 does NOT survive 0xFF', t2.right !== 90 && t2.right === null);
const t2d = deriveEarbudState(t2, twsCaps);
eq('TEST 2 left-only: right side disconnected, battery null', [t2d.right.state, t2d.right.battery], ['disconnected', null]);
check('TEST 2 explicit: right.battery !== 90', t2d.right.battery !== 90);
eq('TEST 2 left-only: aggregate left, left battery 100', [t2d.connection, t2d.left.battery], ['left', 100]);

// TEST 3 + TEST 8 — mirror image: L goes 0xFF while its previous level was 100.
const t3 = merge(t1, 0xff, 90);
eq('TEST 3 right-only: merge nulls left, keeps right', [t3.left, t3.right, t3.presence], [null, 90, 'right']);
check('TEST 8 CRITICAL: previous left=100 does NOT survive 0xFF', t3.left === null);
const t3d = deriveEarbudState(t3, twsCaps);
eq('TEST 3 right-only: left disconnected/null, right connected/90', [
  t3d.left.state, t3d.left.battery, t3d.right.state, t3d.right.battery, t3d.connection,
], ['disconnected', null, 'connected', 90, 'right']);

// TEST 4 — NONE: both sides 0xFF.
const t4 = merge(t1, 0xff, 0xff);
const t4d = deriveEarbudState(t4, twsCaps);
eq('TEST 4 none: both disconnected, no batteries, aggregate none', [
  t4d.left.state, t4d.left.battery, t4d.right.state, t4d.right.battery, t4d.connection,
], ['disconnected', null, 'disconnected', null, 'none']);

// TEST 11 — LIVE TRANSITION both → left-only → both, on ONE state chain.
const tr1 = merge(emptyBattery(), 100, 90);          // both
const tr2 = merge(tr1, 100, 0xff);                   // right removed
const tr3 = merge(tr2, 100, 90);                     // right returned
eq('TEST 11 step 1: both 100/90', [tr1.left, tr1.right, tr1.presence], [100, 90, 'both']);
eq('TEST 11 step 2: right gone → null immediately', [tr2.left, tr2.right, tr2.presence], [100, null, 'left']);
eq('TEST 11 step 3: right back from FRESH bytes, not reused', [tr3.left, tr3.right, tr3.presence], [100, 90, 'both']);
eq('TEST 11 aggregates follow the sides', [
  deriveEarbudState(tr1, twsCaps).connection,
  deriveEarbudState(tr2, twsCaps).connection,
  deriveEarbudState(tr3, twsCaps).connection,
], ['both', 'left', 'both']);

// Charging flags: cleared for absent sides, kept across frames that carry none.
const c1 = merge(emptyBattery(), 100, 90, { chargingLeft: true, chargingRight: true });
eq('charging flags stored from a state frame', [c1.leftCharging, c1.rightCharging], [true, true]);
const c2 = merge(c1, 100, 90); // 01:03-style frame without charging bits
eq('a frame without charging bits keeps the confirmed flags', [c2.leftCharging, c2.rightCharging], [true, true]);
const c3 = merge(c2, 100, 0xff);
eq('absent side loses its charging flag too', c3.rightCharging, undefined);
const c4 = merge(c3, 100, undefined);
eq('missing side byte clears level AND charging (untrusted telemetry)', [c4.right, c4.rightCharging, c4.presence], [null, undefined, 'unknown']);
const c5 = merge(emptyBattery(), 245, 90);
eq('untrustworthy byte (>100) never becomes a battery', [c5.left, c5.presence], [null, 'unknown']);

// Scale conversion still applies to raw-step devices through the merge.
const sc = mergeBatteryTelemetry(emptyBattery(), { rawLeft: 4, rawRight: 0xff, scale: 5 });
const scd = deriveEarbudState(sc, twsCaps);
eq('raw steps: 4/5 → 80%, absent side null', [scd.left.battery, scd.right.battery], [80, null]);

/* ============ 3c. sound-mode mirror parsing (confirmed ANC state) ======== */

console.log('\n[3c] parseSoundModes — device-confirmed ANC mirror');

eq('classic ANC + transport scene + vocal', parseSoundModes([0x00, 0x00, 0x01, 0x00], 'classic'), {
  mode: 'anc', transVocal: true, scene: 'transport',
});
eq('classic transparency + indoor', parseSoundModes([0x01, 0x02, 0x00, 0x00], 'classic'), {
  mode: 'transparency', transVocal: false, scene: 'indoor',
});
eq('l4nc: manual level 3 + wind on', parseSoundModes([0x00, 0x30, 0x00, 0x00, 0x01], 'tws-l4nc'), {
  mode: 'anc', level: 3, transVocal: false, wind: true,
});
eq('p30i: adaptive nibble below 1 is not a level', parseSoundModes([0x02, 0x00, 0x00, 0x00, 0x00], 'tws-p30i'), {
  mode: 'normal', wind: false,
});
// TEST 12 input — a malformed mirror must be REJECTED, so the last confirmed
// mode survives (the store only moves ANC state on a non-null report).
eq('garbage mode byte → null (confirmed state untouched)', parseSoundModes([0x07, 0x00, 0x00, 0x00], 'classic'), null);
eq('short payload → null', parseSoundModes([0x00], 'classic'), null);
eq('layouts without ANC never parse', parseSoundModes([0x00, 0x00, 0x00, 0x00], 'none'), null);

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

/* ------------------------------------------- update checker (Settings → Updates) */

// Bundle src/lib/reporting.ts twice — once with the real build-time repo URL,
// once with a non-GitHub URL — to prove the endpoint is derived ONLY from
// __REPO_URL__ (checkForUpdates takes no URL argument, so renderer input can
// never redirect it) and that the "unconfigured" path is real.
const repDir = mkdtempSync(join(tmpdir(), 'soundcontrol-updates-'));
let repBundleN = 0;
async function bundleReporting(repoUrl) {
  const { build: buildR } = await import('esbuild');
  // Unique filename per build: identical names would hit the ESM import
  // cache and every "different REPO_URL" bundle would silently be the first.
  const out = join(repDir, `reporting-${repBundleN++}.mjs`);
  await buildR({
    stdin: {
      contents: `export * from './src/lib/reporting.ts';`,
      sourcefile: 'reporting-barrel.ts',
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    define: { __REPO_URL__: JSON.stringify(repoUrl) },
    outfile: out,
    logLevel: 'error',
  });
  return import(pathToFileURL(out).href);
}
const R = await bundleReporting('https://github.com/Shankers8811/soundcontrol');

eq(
  'API URL is derived from the build-time repo URL only',
  R.latestReleaseApiUrl(),
  'https://api.github.com/repos/Shankers8811/soundcontrol/releases/latest',
);

// Numeric version compare — a string compare would rank 1.0.10 < 1.0.9.
eq('compareVersions is numeric, v-prefix and length tolerant', [
  R.compareVersions('1.0.10', '1.0.9'),
  R.compareVersions('v1.2.3', '1.2.3'),
  R.compareVersions('1.0', '1.0.0'),
  R.compareVersions('2.0.0', '10.0.0'),
], [1, 0, 0, -1]);

// Every check runs through a scripted fetch; the real one is restored after.
const realFetch = globalThis.fetch;
let fetchCalls = [];
function stubFetch(handler) {
  fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return handler(String(url));
  };
}
const okJson = (body, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const TAG_URL = 'https://github.com/Shankers8811/soundcontrol/releases/tag/v1.2.3';

try {
  stubFetch(() => okJson({ tag_name: 'v1.2.3', html_url: TAG_URL }));
  let r = await R.checkForUpdates('1.0.5');
  eq('newer tag → available with the validated html_url', [r.kind, r.release?.tag, r.release?.url], ['available', 'v1.2.3', TAG_URL]);
  eq('the check hits ONLY the official API endpoint', fetchCalls, [R.latestReleaseApiUrl()]);

  stubFetch(() => okJson({ tag_name: '1.0.5', html_url: TAG_URL }));
  r = await R.checkForUpdates('1.0.5');
  eq('same version → latest', r.kind, 'latest');

  stubFetch(() => okJson({ tag_name: 'v0.9.0', html_url: TAG_URL }));
  r = await R.checkForUpdates('1.0.5');
  eq('older tag → latest', r.kind, 'latest');

  stubFetch(() => ({ status: 404, ok: false, json: async () => ({}) }));
  r = await R.checkForUpdates('1.0.5');
  eq('no releases published (404) → none, an honest answer', r.kind, 'none');

  stubFetch(() => ({ status: 500, ok: false, json: async () => ({}) }));
  r = await R.checkForUpdates('1.0.5');
  eq('HTTP 500 → error with the real status', [r.kind, r.message], ['error', 'GitHub replied HTTP 500']);

  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  r = await R.checkForUpdates('1.0.5');
  check('network failure → honest reachability error', r.kind === 'error' && /Could not reach GitHub/.test(r.message), JSON.stringify(r));

  stubFetch(() => okJson({}));
  r = await R.checkForUpdates('1.0.5');
  eq('response without tag_name → error, never a fabricated version', [r.kind, r.message], ['error', 'Release response contained no version tag']);

  stubFetch(() => okJson([1, 2, 3]));
  r = await R.checkForUpdates('1.0.5');
  eq('JSON array response → error', r.kind, 'error');

  stubFetch(() => okJson({ tag_name: 42, html_url: TAG_URL }));
  r = await R.checkForUpdates('1.0.5');
  eq('non-string tag_name → error', r.kind, 'error');

  stubFetch(() => ({
    status: 200,
    ok: true,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  }));
  r = await R.checkForUpdates('1.0.5');
  check('malformed JSON body → honest error', r.kind === 'error' && /Could not reach GitHub/.test(r.message), JSON.stringify(r));

  // A non-github.com html_url must never be surfaced — the checker falls
  // back to the repository's own releases page instead.
  stubFetch(() => okJson({ tag_name: 'v9.9.9', html_url: 'https://evil.example.com/malware.exe' }));
  r = await R.checkForUpdates('1.0.5');
  eq('foreign html_url → falls back to the repo releases page', [r.kind, r.release?.url], ['available', 'https://github.com/Shankers8811/soundcontrol/releases/latest']);

  // Invalid/untrusted REPO_URL values → unconfigured, and fetch never runs.
  const R2 = await bundleReporting('https://gitlab.com/foo/bar');
  stubFetch(() => okJson({ tag_name: 'v1.0.0' }));
  r = await R2.checkForUpdates('1.0.5');
  eq('non-GitHub REPO_URL → unconfigured without any fetch', [R2.latestReleaseApiUrl(), r.kind, fetchCalls.length], [null, 'unconfigured', 0]);

  const R3 = await bundleReporting('https://github.com.evil.com/foo/bar');
  eq('lookalike-host REPO_URL → unconfigured', [R3.latestReleaseApiUrl()], [null]);
} finally {
  globalThis.fetch = realFetch;
  rmSync(repDir, { recursive: true, force: true });
}

/* ------------------------------------------------------------- verdict */

rmSync(dir, { recursive: true, force: true });

console.log(`\n  ${passed} checks`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All UI state derivation checks passed.');
