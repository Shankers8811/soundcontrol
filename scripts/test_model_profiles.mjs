#!/usr/bin/env node
/**
 * Phase 18 — model-profile tests for the two target devices.
 *
 *   Soundcore R50i    (SKU A3949, also sold as P20i / P25i)
 *   Soundcore R50i NC (SKU A3959, also sold as P30i)
 *   …plus the UNKNOWN-model profile.
 *
 * Everything here is deterministic — no Bluetooth hardware. Where a status
 * says SUPPORTED it means SUPPORTED BY PROTOCOL EVIDENCE (OpenSCQ30 device
 * definitions + cited captures): physical validation is PENDING for every
 * command, and these tests never claim otherwise.
 *
 * Covered (Task 14):
 *   1. registry integrity + the 14-command matrix for both models
 *   2. matrix ↔ DeviceProfile consistency (code cannot drift from evidence)
 *   3. identification (name matching, ambiguity traps, unknown fallback)
 *   4. command gating: allowed/denied per model, custom-EQ FEFE split,
 *      factory reset denied for every profile
 *   5. transport boundary: model-unsupported frames never reach the wire
 *   6. response validation: state-length guard, device toggle mirrors,
 *      A3959 gaming firmware gate (>= 01.60)
 *   7. session isolation: stale frames from an old session are dropped
 *   8. capability/UI gating incl. volume staying disabled (Task 7)
 *
 * Run: npm run test:models   (also part of `npm test`)
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

/* ------------------------------------------------------------- bundling */

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-models-'));
const bundlePath = join(dir, 'models.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/protocol/modelRegistry.ts';
        export * from './src/protocol/responses.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/packets.ts';
        export * from './src/protocol/presets.ts';
        export * from './src/protocol/targets.ts';
        export * from './src/state/derive.ts';
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
  console.error(`esbuild failed:\n${err?.message ?? err}`);
  process.exit(1);
}

const M = await import(pathToFileURL(bundlePath).href);

const A3949 = M.DEVICES.find((d) => d.sku === 'A3949');
const A3959 = M.DEVICES.find((d) => d.sku === 'A3959');
const UNKNOWN = M.UNKNOWN_PROFILE;
const A3947 = M.DEVICES.find((d) => d.sku === 'A3947');
const A3952 = M.DEVICES.find((d) => d.sku === 'A3952');

/* ------------------------------------------- 1. registry integrity */

console.log('\nTask 1 — model registry');

check('both target models are registered', M.TARGET_MODELS.length === 2);
const r50i = M.targetModel('R50I_A3949');
const r50inc = M.targetModel('R50I_NC_A3959');
check('registry ids are R50I_A3949 and R50I_NC_A3959', !!r50i && !!r50inc);
check(
  'registry links to the correct device profiles',
  r50i.profileId === 'p20i' && r50inc.profileId === 'p30i' &&
    M.targetModelForProfile('p20i') === r50i && M.targetModelForProfile('p30i') === r50inc,
);
check(
  'registry carries commercial name, SKU, sibling names, protocol profile',
  r50i.commercialName === 'Soundcore R50i' && r50i.sku === 'A3949' &&
    r50i.alsoSoldAs.some((n) => n.includes('P20i')) &&
    r50inc.commercialName === 'Soundcore R50i NC' && r50inc.sku === 'A3959' &&
    r50inc.alsoSoldAs.some((n) => n.includes('P30i')) &&
    r50i.protocolProfile.length > 0 && r50inc.protocolProfile.length > 0,
);
check(
  'identification evidence is documented for both',
  r50i.identification.evidence.length > 40 && r50inc.identification.evidence.length > 40 &&
    r50i.identification.nameAliases.includes('R50i') &&
    r50inc.identification.nameAliases.includes('R50i NC'),
);
check(
  'physical validation is PENDING for both (nothing is claimed physically verified)',
  r50i.physicalValidation === 'PENDING' && r50inc.physicalValidation === 'PENDING',
  `${r50i.physicalValidation}/${r50inc.physicalValidation}`,
);

// Every one of the 14 registered earbud commands has a matrix entry per model.
const allCommands = M.EARBUD_COMMANDS.map((c) => c.id);
for (const entry of [r50i, r50inc]) {
  const missing = allCommands.filter((id) => !entry.commands[id]);
  check(
    `${entry.id}: all ${allCommands.length} registered commands have a matrix status`,
    missing.length === 0,
    `missing: ${missing.join(', ')}`,
  );
  const badStatus = Object.entries(entry.commands).filter(
    ([, v]) => !['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN', 'PHYSICALLY_UNVERIFIED'].includes(v.status),
  );
  check(`${entry.id}: every status is one of SUPPORTED/UNSUPPORTED/UNKNOWN/PHYSICALLY_UNVERIFIED`, badStatus.length === 0);
  const noEvidence = Object.entries(entry.commands).filter(([, v]) => !v.evidence || v.evidence.length < 10);
  check(`${entry.id}: every matrix entry cites evidence`, noEvidence.length === 0);
  check(`${entry.id}: capability notes exist`, entry.notes.length >= 3);
}

/* --------------------------------- 2. matrix ↔ DeviceProfile consistency */

console.log('\nTask 3 — capability matrix (matrix must match the code)');

function statusOf(entry, id) {
  return entry.commands[id]?.status;
}
check(
  'R50i A3949: ANC/transparency/wind sound modes are UNSUPPORTED (no sound-modes module)',
  statusOf(r50i, 'sound-modes.set') === 'UNSUPPORTED' && A3949.ancLayout === 'none',
);
check(
  'R50i NC A3959: sound modes are SUPPORTED (a3959_sound_modes module)',
  statusOf(r50inc, 'sound-modes.set') === 'SUPPORTED' && A3959.ancLayout === 'tws-p30i',
);
check(
  'both models: EQ is 02:83 (equalizer_with_drc_tws)',
  A3949.eqCommand === '02:83' && A3959.eqCommand === '02:83' &&
    statusOf(r50i, 'equalizer.set-drc') === 'SUPPORTED' && statusOf(r50inc, 'equalizer.set-drc') === 'SUPPORTED',
);
check(
  'custom EQ split: A3949 factory presets only (customEq false), A3959 custom 0xFEFE (customEq true)',
  A3949.customEq === false && A3959.customEq === true,
);
check(
  'gaming supported on both (OpenSCQ30 gaming_mode module)',
  statusOf(r50i, 'game-mode.set') === 'SUPPORTED' && statusOf(r50inc, 'game-mode.set') === 'SUPPORTED' &&
    A3949.gaming && A3959.gaming,
);
check(
  'LDAC unsupported on both (no LDAC module in a3949/a3959)',
  statusOf(r50i, 'ldac.set') === 'UNSUPPORTED' && statusOf(r50inc, 'ldac.set') === 'UNSUPPORTED' &&
    !A3949.ldac && !A3959.ldac,
);
check(
  'dual audio: A3949 UNSUPPORTED, A3959 SUPPORTED (dual_connections module)',
  statusOf(r50i, 'dual-audio.set') === 'UNSUPPORTED' && statusOf(r50inc, 'dual-audio.set') === 'SUPPORTED' &&
    !A3949.dual && A3959.dual,
);
check(
  'surround: A3949 UNSUPPORTED, A3959 SUPPORTED (surround_sound module)',
  statusOf(r50i, 'surround.set') === 'UNSUPPORTED' && statusOf(r50inc, 'surround.set') === 'SUPPORTED' &&
    !A3949.surround && A3959.surround,
);
check(
  'factory reset UNSUPPORTED on both (01:85 documented only for the Motion+ speaker)',
  statusOf(r50i, 'device.factory-reset') === 'UNSUPPORTED' && statusOf(r50inc, 'device.factory-reset') === 'UNSUPPORTED' &&
    !A3949.factoryReset && !A3959.factoryReset,
);
check(
  'battery/device-info/state/charging queries SUPPORTED on both',
  ['state.request', 'battery.query', 'charging.query', 'device.info'].every(
    (id) => statusOf(r50i, id) === 'SUPPORTED' && statusOf(r50inc, id) === 'SUPPORTED',
  ),
);
check(
  'battery scales differ and are the documented ones: A3949 dual_battery(5), A3959 dual_battery(10)',
  A3949.batteryMax === 5 && A3959.batteryMax === 10,
);

/* -------------------------------------------- 3. identification (Task 5) */

console.log('\nTask 5 — model identification');

const ID_CASES = [
  ['soundcore R50i', 'A3949'],
  ['R50i', 'A3949'],
  ['soundcore P20i', 'A3949'],
  ['P25i', 'A3949'],
  ['A3949', 'A3949'],
  ['soundcore R50i NC', 'A3959'],
  ['R50i NC', 'A3959'],
  ['soundcore P30i', 'A3959'],
  ['P30i', 'A3959'],
  ['A3959', 'A3959'],
  ['SOUNDCORE R50I', 'A3949'],
];
for (const [name, sku] of ID_CASES) {
  check(`matchDevice("${name}") → ${sku}`, M.matchDevice(name).sku === sku, `got ${M.matchDevice(name).sku}`);
}
// "R50i Pro Max" is hypothetical: it contains the whole token "R50i" and no
// other model's token, so the documented behavior is the R50i profile — the
// identification heuristic is token-based, and future unknown suffixes are
// covered by the physical checklist's identity-confirmation step.
check('matchDevice("R50i Pro Max") → A3949 (whole-token match, no competing model)', M.matchDevice('R50i Pro Max').sku === 'A3949');

const UNKNOWN_CASES = [
  ['R50iNC', 'no space — must not substring-match the R50i'],
  ['XR50i', 'prefix garbage'],
  ['Liberty 4', 'unverified alias (A3953 is not Liberty 4 NC)'],
  ['Sport X10', 'unverified alias'],
  ['Some Other Buds', 'nothing matches'],
  ['', 'empty'],
];
for (const [name, why] of UNKNOWN_CASES) {
  check(`matchDevice("${name}") → unknown (${why})`, M.matchDevice(name).id === 'unknown');
}
check('matchDevice(undefined) → unknown', M.matchDevice(undefined).id === 'unknown');
check(
  'ambiguous name with two models\' tokens → unknown (no lucky longest-first win)',
  M.matchDevice('P30i R50i').id === 'unknown',
);
check(
  'R50i NC is never mistaken for R50i (longest token wins)',
  M.matchDevice('soundcore R50i NC').ancLayout === 'tws-p30i' &&
    M.matchDevice('soundcore R50i NC').ancLayout !== M.matchDevice('soundcore R50i').ancLayout,
);

/* --------------------------------------- 4. command gating (Tasks 3/4/11) */

console.log('\nTasks 3/4/8/11 — model command gate');

function frameOf(cat, typ, payload = []) {
  const total = 10 + payload.length;
  const body = [0x08, 0xee, 0x00, 0x00, 0x00, cat, typ, total & 0xff, (total >> 8) & 0xff, ...payload];
  return new Uint8Array([...body, body.reduce((a, b) => a + b, 0) & 0xff]);
}
const FE = (id) => [id & 0xff, (id >> 8) & 0xff];

const GATE_CASES = [
  // [label, frame, profile, expectedOk]
  ['A3949 + ANC frame 06:81 → DENIED (no ANC on R50i)', frameOf(0x06, 0x81, [0x00, 0x51, 0x00, 0x00, 0x00, 0x00, 0x01]), A3949, false],
  ['A3959 + ANC frame 06:81 → allowed', frameOf(0x06, 0x81, [0x01, 0x51, 0x01, 0x00, 0x00, 0x00, 0x01]), A3959, true],
  ['A3949 + EQ factory preset → allowed', M.buildEq('02:83', 0x0001, [0, 0, 0, 0, 0, 0, 0, 0]), A3949, true],
  ['A3959 + EQ factory preset → allowed', M.buildEq('02:83', 0x0002, [1, 2, 0, 0, 0, 0, 0, 0]), A3959, true],
  ['A3949 + EQ CUSTOM 0xFEFE → DENIED (no custom presets)', frameOf(0x02, 0x83, [...FE(M.CUSTOM_EQ_PRESET_ID), 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x00, -120 & 0xff, ...Array(10).fill(0x78)]), A3949, false],
  ['A3959 + EQ CUSTOM 0xFEFE → allowed (custom_preset_id Some(0xFEFE))', frameOf(0x02, 0x83, [...FE(M.CUSTOM_EQ_PRESET_ID), 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x78, 0x00, -120 & 0xff, ...Array(10).fill(0x78)]), A3959, true],
  ['A3949 + classic 02:81 EQ frame → DENIED (wrong EQ command for this model)', M.buildEq('02:81', 0x0001, [0, 0, 0, 0, 0, 0, 0, 0]), A3949, false],
  ['A3949 + game mode 01:87 → allowed', M.buildGameMode(A3949, true), A3949, true],
  ['A3959 + game mode 01:87 → allowed', M.buildGameMode(A3959, true), A3959, true],
  ['A3949 + game mode 10:85 (A3947 variant) → DENIED', M.buildGameMode(A3947, true), A3949, false],
  ['A3947 + game mode 10:85 → allowed', M.buildGameMode(A3947, true), A3947, true],
  ['A3949 + dual 0B:84 → DENIED', M.DUAL.enable, A3949, false],
  ['A3959 + dual 0B:84 → allowed', M.DUAL.enable, A3959, true],
  ['A3949 + surround 02:86 → DENIED', M.buildSurroundSound(true), A3949, false],
  ['A3959 + surround 02:86 → allowed', M.buildSurroundSound(true), A3959, true],
  ['A3949 + LDAC 01:FF → DENIED', M.LDAC.enable, A3949, false],
  ['A3952 (Liberty 3 Pro) + LDAC 01:FF → allowed (documented LDAC model)', M.LDAC.enable, A3952, true],
  ['A3949 + factory reset 01:85 → DENIED', M.buildResetDevice(), A3949, false],
  ['A3959 + factory reset 01:85 → DENIED', M.buildResetDevice(), A3959, false],
  ['A3952 + factory reset 01:85 → DENIED', M.buildResetDevice(), A3952, false],
  ['unknown model + factory reset 01:85 → DENIED', M.buildResetDevice(), UNKNOWN, false],
  ['A3949 + state request 01:01 → allowed (universal)', M.INIT, A3949, true],
  ['A3959 + battery query → allowed (universal)', M.BATTERY_QUERY, A3959, true],
  ['unknown model + state request → allowed (universal read)', M.INIT, UNKNOWN, true],
  ['unknown model + battery query → allowed (universal read)', M.BATTERY_QUERY, UNKNOWN, true],
  ['unknown model + device info → allowed (universal read)', M.DEVICE_INFO, UNKNOWN, true],
  ['unknown model + ANC 06:81 → DENIED (never guess a layout)', frameOf(0x06, 0x81, [0, 0x51, 0, 0, 0, 0, 1]), UNKNOWN, false],
  ['unknown model + EQ 02:83 → DENIED', M.buildEq('02:83', 0x0001, [0, 0, 0, 0, 0, 0, 0, 0]), UNKNOWN, false],
  ['unknown model + game mode → DENIED', M.buildGameMode(A3949, true), UNKNOWN, false],
];

for (const [label, frame, profile, expectedOk] of GATE_CASES) {
  const validated = M.validateOutboundFrame(frame);
  const gate = validated.ok ? M.gateCommandForProfile(validated.command.id, frame, profile) : { ok: false, reason: 'not a valid earbud frame' };
  check(label, gate.ok === expectedOk, expectedOk ? `denied: ${gate.reason}` : 'was allowed');
}

/* --------------------------------- 5. transport boundary (end-to-end gate) */

console.log('\nTransport boundary (withDeviceBoundary)');

{
  const written = [];
  const blocked = [];
  const fake = {
    kind: 'bridge',
    label: 'R50i-under-test',
    write: async (d) => { written.push(d); },
    close: async () => {},
  };
  // A3949 connected: ANC must be impossible even if the UI asks for it.
  const t = M.withDeviceBoundary(fake, () => A3949, (r) => blocked.push(r));
  let ancThrew = false;
  try { await t.write(frameOf(0x06, 0x81, [0x00, 0x51, 0x00, 0x00, 0x00, 0x00, 0x01])); } catch { ancThrew = true; }
  check('A3949 session: ANC write throws at the boundary', ancThrew && written.length === 0 && blocked.length === 1);
  let feThrew = false;
  try {
    await t.write(frameOf(0x02, 0x83, [...FE(M.CUSTOM_EQ_PRESET_ID), ...Array(18).fill(0x78)]));
  } catch { feThrew = true; }
  check('A3949 session: custom FE FE EQ write throws at the boundary', feThrew && written.length === 0);
  await t.write(M.buildEq('02:83', 0x0001, [0, 0, 0, 0, 0, 0, 0, 0]));
  check('A3949 session: factory preset passes the boundary', written.length === 1);
  // Now swap the connected model to A3959: the same ANC frame becomes legal.
  const t2 = M.withDeviceBoundary(fake, () => A3959, () => {});
  await t2.write(frameOf(0x06, 0x81, [0x01, 0x51, 0x01, 0x00, 0x00, 0x00, 0x01]));
  check('A3959 session: ANC write passes the boundary', written.length === 2);
}

/* ------------------------------------ 6. response validation (Task 12) */

console.log('\nTask 12 — response validation (state layout)');

// A3949 state payload: 67 bytes per the OpenSCQ30 parse chain.
function a3949Payload({ batteryL = 4, batteryR = 3, fw = '01.5901.59', gaming = 0x01 } = {}) {
  const p = new Uint8Array(67);
  p[2] = batteryL; p[3] = batteryR; p[4] = 0; p[5] = 0;
  for (let i = 0; i < 10; i++) p[6 + i] = fw.charCodeAt(i);
  p[32] = 0x01; p[33] = 0x00; // eq preset id u16 LE
  p[65] = gaming; // gaming byte (state_update.rs: take(11)+buttons(6)+take(4))
  return p;
}
// A3959 state payload: 91 bytes — OpenSCQ30 parse chain (auto_power_off is two
// bytes) cross-checked against a recorded real A3959 state response.
function a3959Payload({ fw = '01.6001.60', dual = 0x01, surround = 0x01, gaming = 0x01 } = {}) {
  const p = new Uint8Array(91); // recorded real A3959 payload length
  p[2] = 8; p[3] = 7; // dual_battery(10) scale
  for (let i = 0; i < 10; i++) p[6 + i] = fw.charCodeAt(i);
  p[64] = 0x00; // ambient: NoiseCanceling
  p[73] = dual;
  p[74] = surround;
  p[78] = gaming;
  return p;
}

check(
  'requiredStateLength: A3949 needs ≥ 66 bytes (gaming at 65)',
  M.requiredStateLength(A3949.state) === 66,
  String(M.requiredStateLength(A3949.state)),
);
check(
  'requiredStateLength: A3959 needs ≥ 79 bytes (gaming at 78, sound modes at 64..70)',
  M.requiredStateLength(A3959.state) === 79,
  String(M.requiredStateLength(A3959.state)),
);
check(
  'a 60-byte state frame is malformed for BOTH models (shorter than their documented layouts)',
  60 < M.requiredStateLength(A3949.state) && 60 < M.requiredStateLength(A3959.state),
);

{
  const m = M.parseDeviceToggles(a3949Payload({ gaming: 0x01 }), A3949.state);
  check('A3949 mirror: gaming=true read from byte 65 (no firmware gate for this model)', m.gaming === true && m.surround === null && m.dual === null, JSON.stringify(m));
  const m0 = M.parseDeviceToggles(a3949Payload({ gaming: 0x00 }), A3949.state);
  check('A3949 mirror: gaming=false read back', m0.gaming === false);
  const short = M.parseDeviceToggles(a3949Payload().slice(0, 60), A3949.state);
  check('A3949 mirror: truncated payload yields null (never a partial guess)', short.gaming === null, JSON.stringify(short));
}
{
  const m = M.parseDeviceToggles(a3959Payload({ fw: '01.6001.60', dual: 1, surround: 1, gaming: 1 }), A3959.state);
  check('A3959 mirror: dual/surround/gaming all read (firmware 01.60)', m.dual === true && m.surround === true && m.gaming === true, JSON.stringify(m));
  const old = M.parseDeviceToggles(a3959Payload({ fw: '01.5901.59', gaming: 1 }), A3959.state);
  check(
    'A3959 mirror: gaming byte NOT trusted below firmware 01.60 (OpenSCQ30 gate)',
    old.gaming === null && old.surround === true,
    JSON.stringify(old),
  );
  const half = M.parseDeviceToggles(a3959Payload({ fw: '01.6001.59' }), A3959.state);
  check('A3959 mirror: min(both buds) firmware is what counts (right bud 01.59 ⇒ untrusted)', half.gaming === null, JSON.stringify(half));
}
check(
  'dualFirmwareAtLeast boundary: 01.60 vs 01.60 → true; 01.59 → false; garbage → false',
  M.dualFirmwareAtLeast('01.6001.60', '01.60') === true &&
    M.dualFirmwareAtLeast('01.5901.61', '01.60') === false &&
    M.dualFirmwareAtLeast('garbage!', '01.60') === false,
);

/* ------------------------------------ 7. session isolation (Task 13) */

console.log('\nTask 13 — device session isolation');

{
  const guard = M.createSessionGuard();
  const s1 = guard.begin();
  check('session 1 is active right after begin', guard.isActive(s1));
  const s2 = guard.begin(); // a new device connects
  check('starting session 2 invalidates session 1 (old device frames drop)', !guard.isActive(s1) && guard.isActive(s2));
  guard.end(); // disconnect
  check('end() invalidates every session (late frames can never update state)', !guard.isActive(s2));
  const s3 = guard.begin();
  check('a fresh connect begins a fresh session', guard.isActive(s3) && !guard.isActive(s1));
}

/* ---------------------------- 8. capability/UI gating (Tasks 6/7/8/9) */

console.log('\nTasks 6/7/8/9 — capability derivation per model');

{
  const c49 = M.deriveCapabilities(A3949);
  check('R50i A3949: no noise control (ANC UI must not appear)', c49.supportsNoiseControl === false);
  check('R50i A3949: EQ supported but NO custom curves', c49.supportsEqualizer === true && c49.supportsCustomEq === false);
  check('R50i A3949: gaming yes; surround/dual/LDAC no', c49.supportsGaming === true && c49.supportsSurround === false && c49.supportsDual === false && c49.supportsLdac === false);
  check('R50i A3949: no factory reset, no gestures, no volume', c49.supportsFactoryReset === false && c49.supportsGestures === false && c49.supportsVolume === false);

  const c59 = M.deriveCapabilities(A3959);
  check('R50i NC A3959: noise control supported (ANC/transparency/normal)', c59.supportsNoiseControl === true);
  check('R50i NC A3959: EQ supported WITH custom curves', c59.supportsEqualizer === true && c59.supportsCustomEq === true);
  check('R50i NC A3959: gaming + surround + dual; NO LDAC', c59.supportsGaming === true && c59.supportsSurround === true && c59.supportsDual === true && c59.supportsLdac === false);
  check('R50i NC A3959: no factory reset, no gestures, no volume', c59.supportsFactoryReset === false && c59.supportsGestures === false && c59.supportsVolume === false);

  const cu = M.deriveCapabilities(UNKNOWN);
  check(
    'unknown model: only universal reads — no ANC/EQ/toggles/factory reset',
    cu.supportsNoiseControl === false && cu.supportsEqualizer === false && cu.supportsCustomEq === false &&
      cu.supportsGaming === false && cu.supportsSurround === false && cu.supportsDual === false &&
      cu.supportsLdac === false && cu.supportsFactoryReset === false && cu.supportsFirmwareInfo === true,
  );
  check('volume stays disabled for BOTH target models and unknown (Task 7)', c49.supportsVolume === false && c59.supportsVolume === false && cu.supportsVolume === false);

  // ANC byte values are the documented A3959 enum, not a generic guess (Task 8).
  const anc = M.buildAnc('tws-p30i', { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false });
  const ancBytes = anc.slice(9, -1);
  check('A3959 ANC frame: ambient byte 0x00 = NoiseCanceling (OpenSCQ30 enum)', ancBytes[0] === 0x00, `got 0x${ancBytes[0].toString(16)}`);
  const trans = M.buildAnc('tws-p30i', { mode: 'transparency', level: 3, scene: 'indoor', transVocal: true, wind: true });
  check('A3959 transparency frame: ambient byte 0x01 = Transparency', trans.slice(9, -1)[0] === 0x01);
  const normal = M.buildAnc('tws-p30i', { mode: 'normal', level: 1, scene: 'transport', transVocal: false, wind: false });
  check('A3959 normal frame: ambient byte 0x02 = Normal', normal.slice(9, -1)[0] === 0x02);
  check('A3959 builder refuses nothing for its layout (all intents build)', !!anc && !!trans && !!normal);
  check('A3949 builder returns null for its no-ANC layout (nothing to send)', M.buildAnc('none', { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false }) === null);
}

/* ------------------------------------------------------------------ done */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
