#!/usr/bin/env node
/**
 * Phase 18 — model-profile tests for the formal R50i targets plus the
 * expanded independently authored Soundcore profiles.
 *
 *   Soundcore R50i    (SKU A3949, also sold as P20i / P25i)
 *   Soundcore R50i NC (SKU A3959, also sold as P30i)
 *   …plus documented over-ear/TWS profiles and the UNKNOWN-model profile.
 *
 * Everything here is deterministic — no Bluetooth hardware. Where a status
 * says SUPPORTED it means SUPPORTED BY PROTOCOL EVIDENCE (OpenSCQ30 device
 * definitions + cited captures): physical validation is PENDING for every
 * command, and these tests never claim otherwise.
 *
 * Covered (Task 14):
 *   1. registry integrity + the 15-command matrix for both models
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
        export * from './src/protocol/marketCatalog.ts';
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
const A3035 = M.DEVICES.find((d) => d.sku === 'A3035');
const A3936 = M.DEVICES.find((d) => d.sku === 'A3936');
const A3954 = M.DEVICES.find((d) => d.sku === 'A3954');
const A3955 = M.DEVICES.find((d) => d.sku === 'A3955');
const A3957 = M.DEVICES.find((d) => d.sku === 'A3957');
const A3062 = M.DEVICES.find((d) => d.sku === 'A3062');
const A3004 = M.DEVICES.find((d) => d.sku === 'A3004');
const A3005 = M.DEVICES.find((d) => d.sku === 'A3005');
const D1402 = M.DEVICES.find((d) => d.sku === 'D1402');
const A3330 = M.DEVICES.find((d) => d.sku === 'A3330');
const A3388 = M.DEVICES.find((d) => d.sku === 'A3388');
const D1101 = M.DEVICES.find((d) => d.sku === 'D1101');

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

console.log('\nExpanded model profiles — independently authored layouts and safety gates');
const expanded = [
  [A3936, 'Space A40', 'tws-a3936', 5, 111],
  [A3954, 'Liberty 4 Pro', 'tws-l4pro', 100, 125],
  [A3955, 'P40i', 'tws-p40i', 5, 119],
  [A3957, 'Liberty 5', 'tws-l5', 10, 119],
];
for (const [profile, name, layout, batteryMax, soundModes] of expanded) {
  check(`${profile?.sku}: profile is present with documented identity`, profile?.name === name && profile?.verified === true);
  check(`${profile?.sku}: sound-mode layout is model-specific`, profile?.ancLayout === layout);
  check(`${profile?.sku}: battery/state offsets are documented`, profile?.batteryMax === batteryMax && profile?.state.soundModes === soundModes);
  const expectedFrameLength = layout === 'tws-l4pro' ? 14 : ['tws-a3936'].includes(layout) ? 16 : 17;
  check(`${profile?.sku}: a 06:81 frame has the expected payload size`, M.buildAnc(profile.ancLayout, { mode: 'adaptive', level: 4, scene: 'outdoor', transVocal: true, wind: true })?.length === expectedFrameLength);
}
check('A3957 uses the Liberty 10:85 gaming command', M.validateOutboundFrame(M.buildGameMode(A3957, true)).ok && M.buildGameMode(A3957, true)[5] === 0x10);
check('A3062 uses the documented offset-1 single-battery scale and corrected state head', A3062.batteryMax === 10 && A3062.batteryOffset === 1 && A3062.state.batteryLeft === 0 && A3062.state.batteryChargingLeft === 1 && A3062.state.firmware.at === 2 && A3062.state.serial.at === 7 && A3062.state.eqPresetId === 23 && A3062.state.eqBands.at === 25 && A3062.state.soundModes === 69 && A3062.state.dualConnections === 79);
check('A3005 uses the corrected two-byte battery head and DRC offsets', A3005.state.batteryLeft === 0 && A3005.state.batteryChargingLeft === 1 && A3005.state.firmware.at === 2 && A3005.state.serial.at === 7 && A3005.state.eqPresetId === 23 && A3005.state.eqBands.at === 25 && A3005.state.dualConnections === 41);
check('A3004 has the classic four-byte sound mode at state offset 35', A3004.ancLayout === 'classic' && A3004.state.batteryLeft === 0 && A3004.state.soundModes === 35 && A3004.state.soundModeLength === 4);
check('A3004 four-byte state guard does not require a false seventh byte', M.requiredStateLength(A3004.state) === 39);
check('A3005 exposes only its documented DRC EQ and dual connection features', A3005.eqCommand === '02:83' && A3005.ancLayout === 'none' && A3005.dual === true);
check('D1402 Space 2 resolves to a read-only profile', D1402.ancLayout === 'none' && D1402.eqCommand === null && D1402.gaming === false);
check('D1402 universal reads remain allowed', M.gateCommandForProfile('battery.query', M.BATTERY_QUERY, D1402).ok);
check('D1402 sound-mode writes remain blocked until the unlock handshake exists', !M.gateCommandForProfile('sound-modes.set', M.buildAnc('tws-a3062', { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false }), D1402).ok);

/* -------------------------------- market catalog/status registry */

console.log('\nMarket catalog — identity/evidence/coverage are separate');
const catalog = M.MARKET_CATALOG;
check('market catalog has 51 deduplicated current/regional/legacy rows', catalog.length === 51, `${catalog.length}`);
check('market catalog SKUs are unique', new Set(catalog.map((entry) => entry.sku)).size === catalog.length);
for (const entry of catalog) {
  const profile = M.DEVICES.find((d) => d.id === entry.profileId);
  check(`${entry.sku}: catalog row links to an exact profile`, Boolean(profile));
  check(`${entry.sku}: canonical SKU is an alias`, entry.aliases.includes(entry.sku));
  check(`${entry.sku}: exact SKU/alias resolver is case-insensitive`, M.marketEntryForSku(entry.sku.toLowerCase())?.sku === entry.sku);
  check(`${entry.sku}: protocol/coverage statuses are explicit`,
    ['implemented', 'read-only', 'unknown'].includes(entry.protocolStatus) &&
      ['covered', 'not-covered'].includes(entry.simulatorCoverage) &&
      ['covered', 'not-covered'].includes(entry.unitTestCoverage) &&
      entry.physicalValidation === 'pending',
  );
  if (profile && entry.protocolStatus === 'unknown') {
    check(`${entry.sku}: catalog-only row exposes no guessed controls`,
      profile.verified === false && profile.ancLayout === 'none' && profile.eqCommand === null && profile.batteryMax === null,
    );
  }
}
check('D1202C regional alias resolves to the D1202 row', M.marketEntryForSku('d1202c')?.sku === 'D1202');
check('A3874X feature/SKU alias resolves to A3874', M.marketEntryForSku('a3874x')?.sku === 'A3874');
check('A3213 resolves to the neckband presentation kind', M.matchDevice('soundcore Life U2i').kind === 'neckband');
check('A3212 resolves to the neckband presentation kind', M.matchDevice('soundcore Life U2').kind === 'neckband');
check('A3201 resolves to the neckband presentation kind', M.matchDevice('soundcore Life NC').kind === 'neckband');
console.log(`  ${catalog.length * 5 + 5} market-catalog checks`);

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
  ['soundcore Space A40', 'A3936'],
  ['soundcore Liberty 4 Pro', 'A3954'],
  ['soundcore P40i', 'A3955'],
  ['soundcore Liberty 5', 'A3957'],
  ['soundcore Space One Pro', 'A3062'],
  ['soundcore Space One', 'A3035'],
  ['Space One', 'A3035'],
  ['A3035', 'A3035'],
  ['soundcore Q20i', 'A3004'],
  ['soundcore Q11i', 'A3005'],
  ['soundcore Space 2', 'D1402'],
  ['soundcore C30i', 'A3330'],
  ['soundcore AeroClip', 'A3388'],
  ['soundcore V20i', 'A3876'],
  ['soundcore Sport X20', 'A3968'],
  ['soundcore C50i', 'D1101'],
  ['soundcore P31i', 'D1202'],
  ['soundcore R60i NC', 'D1202'],
  ['D1202C', 'D1202'],
  ['soundcore Sleep A30', 'D1301'],
  ['AeroClip2', 'D1105'],
  ['AeroFit 2 AI Assistant', 'A3874'],
  ['Space 2 Pro', 'D1406'],
  ['Liberty Buds 2', 'D1206'],
  ['soundcore Q21i NC', 'A3004'],
  ['Q21i NC', 'A3004'],
  ['soundcore Life Tune', 'A3029'],
  ['Life Tune XR', 'A3029'],
  ['soundcore Life Tune Pro', 'A3030'],
  ['A3030', 'A3030'],
  ['soundcore Vortex', 'A3031'],
  ['Vortex', 'A3031'],
  ['soundcore Life 2', 'A3023'],
  ['soundcore Life Q10', 'A3032'],
  ['soundcore Life Q20+', 'A3045'],
  ['soundcore Life 2 Neo', 'A3033'],
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
// The legacy/regional headset names introduced on 2026-10-01 include three
// prefix families. The whole-token, longest-match rule must keep each exact
// name on its own SKU instead of letting the shorter name win.
check(
  'Life 2 Neo resolves to A3033 while bare Life 2 resolves to A3023',
  M.matchDevice('soundcore Life 2 Neo').sku === 'A3033' && M.matchDevice('soundcore Life 2').sku === 'A3023',
);
check(
  'Life Q20+ resolves to A3045 while Life Q20 stays on A3025',
  M.matchDevice('soundcore Life Q20+').sku === 'A3045' && M.matchDevice('soundcore Life Q20').sku === 'A3025',
);
check(
  'Life Tune Pro resolves to A3030 while Life Tune and Life Tune XR stay on A3029',
  M.matchDevice('soundcore Life Tune Pro').sku === 'A3030' &&
    M.matchDevice('soundcore Life Tune').sku === 'A3029' &&
    M.matchDevice('soundcore Life Tune XR').sku === 'A3029',
);

/* --------------------------------------- 4. command gating (Tasks 3/4/11) */

console.log('\nTasks 3/4/8/11 — model command gate');

function frameOf(cat, typ, payload = []) {
  const total = 10 + payload.length;
  const body = [0x08, 0xee, 0x00, 0x00, 0x00, cat, typ, total & 0xff, (total >> 8) & 0xff, ...payload];
  return new Uint8Array([...body, body.reduce((a, b) => a + b, 0) & 0xff]);
}
const FE = (id) => [id & 0xff, (id >> 8) & 0xff];

// A3035's documented six-byte shape is distinct from the common classic layout.
const a3035Manual = M.buildAnc(A3035.ancLayout, { mode: 'anc', level: 3, scene: 'outdoor', transVocal: false, wind: true });
const a3035Adaptive = M.buildAnc(A3035.ancLayout, { mode: 'adaptive', level: 4, scene: 'outdoor', transVocal: false, wind: false });
check('A3035 manual 06:81: level 3, repeated ambient, manual mode, wind on',
  a3035Manual.length === 16 && M.validateOutboundFrame(a3035Manual).ok &&
  JSON.stringify([...a3035Manual.slice(9, -1)]) === JSON.stringify([0, 0x30, 0, 0, 1, 1]));
check('A3035 adaptive 06:81: direct level 4, adaptive mode, wind off',
  a3035Adaptive.length === 16 && M.validateOutboundFrame(a3035Adaptive).ok &&
  JSON.stringify([...a3035Adaptive.slice(9, -1)]) === JSON.stringify([0, 0x54, 0, 1, 0, 1]));
const a3035Caps = M.deriveCapabilities(A3035);
check('A3035 gates manual/adaptive/wind and LDAC/Dual by its exact profile',
  A3035.id === 'space-one' && a3035Caps.supportsNoiseControl &&
  a3035Caps.ancSub.level && a3035Caps.ancSub.adaptive && a3035Caps.ancSub.wind &&
  !a3035Caps.ancSub.scenes && !a3035Caps.ancSub.transVocal &&
  a3035Caps.supportsLdac && a3035Caps.supportsDual && !a3035Caps.supportsEqualizer);
check('A3035 factory EQ and custom EQ builders both withhold 03:87 writes',
  M.buildEqPreset(A3035, M.EQ_PRESETS[0]) === null &&
  M.buildCustomEq(A3035, Array(10).fill(0)) === null);
check('A3035 single battery uses offset 0 and scale 5; empty state is rejected',
  A3035.state.batteryLeft === 0 && A3035.state.batteryRight === null &&
  A3035.batteryMax === 5 && M.requiredStateLength(A3035.state) === 1 &&
  !M.validStatePayloadLength(A3035.state, 0));
check('A3035 short and invalid 06:01 mirrors cannot confirm a mode',
  M.parseSoundModes([0, 0x50, 0, 1, 1], A3035.ancLayout) === null &&
  M.parseSoundModes([0xff, 0x50, 0, 1, 1, 5], A3035.ancLayout) === null);

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
  // Exact A3945 read profile must not accidentally inherit its reference writers.
  ['A3945 + documented EQ 02:81 → DENIED (read-only)', M.buildEq('02:81', 0x0001, Array(8).fill(0)), M.matchDevice('Life Note 3S'), false],
  ['A3945 + reference game 01:87 → DENIED (read-only)', M.buildGameMode(A3949, true), M.matchDevice('A3945'), false],
  ['A3945 + documented state request → allowed', M.INIT, M.matchDevice('A3945'), true],
  ['A3035 + manual 06:81 → allowed', a3035Manual, A3035, true],
  ['A3035 + adaptive/wind 06:81 → allowed', a3035Adaptive, A3035, true],
  ['A3035 + LDAC query → allowed', M.LDAC.query, A3035, true],
  ['A3035 + LDAC set → allowed by profile (hardware pending)', M.LDAC.enable, A3035, true],
  ['A3035 + Dual set → allowed by profile (hardware pending)', M.DUAL.enable, A3035, true],
  ['A3035 + 03:87 EQ/HearID → DENIED (no enabled A3035 writer)', M.buildEq87D1202(0x0002, Array(10).fill(0)), A3035, false],
  ['A3035 + gaming → DENIED', M.buildGameMode(A3035, true), A3035, false],
  ['A3035 + factory reset → DENIED', M.buildResetDevice(), A3035, false],
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

/* ------------------------------------ expanded state-layout regressions */

console.log('\nExpanded profile layout regressions');
check(
  'A3330/C30i state offsets match the captured 01:01 layout',
  A3330.state.batteryCase === 35 &&
    A3330.state.surround === 44 &&
    A3330.state.dualConnections === 47 &&
    A3330.state.eqPresetId === 50 &&
    A3330.state.eqBands?.at === 52 &&
    A3330.state.eqBands?.count === 10,
  JSON.stringify(A3330.state),
);
check(
  'A3388/AeroClip state uses one ten-band EQ block and accepts the 66-byte sample length',
  A3388.state.batteryCase === 35 &&
    A3388.state.surround === 44 &&
    A3388.state.dualConnections === 47 &&
    A3388.state.eqPresetId === 50 &&
    A3388.state.eqBands?.at === 52 &&
    A3388.state.eqBands?.count === 10 &&
    M.requiredStateLength(A3388.state) === 62,
  JSON.stringify(A3388.state),
);
check(
  'A3388 never advertises or gates the undocumented 02:86 surround writer',
  A3388.surround === false &&
    M.gateCommandForProfile('surround.set', M.buildSurroundSound(true), A3388).ok === false,
);
check(
  'D1101/C50i dual-connections state flag is offset 53',
  D1101.state.dualConnections === 53 && M.requiredStateLength(D1101.state) === 54,
  JSON.stringify(D1101.state),
);

/* --------------------- 2026-10-01 headset coverage additions */

console.log('\nLegacy/regional headset additions (2026-10-01)');

const A3030 = M.DEVICES.find((d) => d.sku === 'A3030');
check(
  'A3030/Life Tune Pro reuses the documented A3027 classic layout',
  A3030?.verified === true && A3030.kind === 'overear' && A3030.family === 'classic' &&
    A3030.ancLayout === 'classic' && A3030.eqCommand === '02:81' &&
    A3030.batteryMax === 5 && A3030.state.soundModes === 35 && A3030.state.eqBands?.count === 8,
  JSON.stringify(A3030?.state),
);
check(
  'A3030 catalog row points at the life-tune-pro profile',
  M.marketEntryForProfile('life-tune-pro')?.sku === 'A3030',
);
const cTunePro = M.deriveCapabilities(A3030);
check(
  'A3030 gates classic sound modes + 02:81 EQ but no LDAC/dual/gaming',
  cTunePro.supportsNoiseControl === true && cTunePro.supportsEqualizer === true &&
    cTunePro.supportsLdac === false && cTunePro.supportsDual === false && cTunePro.supportsGaming === false,
);
check(
  'A3030 name and SKU resolve to its own profile, not the A3027 row',
  M.matchDevice('soundcore Life Tune Pro').id === 'life-tune-pro' && M.matchDevice('A3030').id === 'life-tune-pro',
);
check(
  'A3030 profile remains physically unvalidated (no hardware claim)',
  M.marketEntryForSku('A3030')?.physicalValidation === 'pending' && A3030.verified === true,
);

// The identity-only headset rows added on 2026-10-01: exact SKU resolution,
// protocol-universal reads only, and every model-specific write denied.
const NEW_CATALOG_ONLY_HEADSETS = [
  ['A3023', 'life-2', 'Life 2'],
  ['A3032', 'life-q10', 'Life Q10'],
  ['A3045', 'life-q20-plus', 'Life Q20+'],
  ['A3031', 'vortex', 'Soundcore Vortex'],
  ['A3033', 'life-2-neo', 'Life 2 Neo'],
  ['A3021', 'space-nc', 'Space NC'],
  ['A3024', 'life-2-nc', 'Life 2 NC'],
];
const classicAncFrame = M.buildAnc('classic', { mode: 'anc', level: 3, scene: 'outdoor', transVocal: false, wind: false });
for (const [sku, id, name] of NEW_CATALOG_ONLY_HEADSETS) {
  const profile = M.matchDevice(sku);
  check(`${sku}: exact SKU resolves to its catalog-only ${name} identity`, profile.id === id && profile.sku === sku && profile.verified === false);
  check(`${sku}: no guessed battery scale, ANC, EQ or codec write`, profile.batteryMax === null &&
    !M.gateCommandForProfile('sound-modes.set', classicAncFrame, profile).ok &&
    !M.gateCommandForProfile('equalizer.set', M.buildEq('02:81', 0x0001, Array(8).fill(0)), profile).ok &&
    !M.gateCommandForProfile('ldac.set', M.LDAC.enable, profile).ok &&
    !M.gateCommandForProfile('dual-audio.set', M.DUAL.enable, profile).ok);
  check(`${sku}: protocol-universal identity/battery reads stay available`, M.gateCommandForProfile('state.request', M.INIT, profile).ok &&
    M.gateCommandForProfile('battery.query', M.BATTERY_QUERY, profile).ok &&
    M.gateCommandForProfile('device.info', M.DEVICE_INFO, profile).ok);
  check(`${sku}: catalog row is present and marked unknown/pending`, M.marketEntryForSku(sku)?.protocolStatus === 'unknown' &&
    M.marketEntryForSku(sku)?.physicalValidation === 'pending');
}
check('Q21i NC shares the A3004 profile without creating a second SKU', M.matchDevice('soundcore Q21i NC').sku === 'A3004' &&
  M.DEVICES.filter((d) => d.sku === 'A3004').length === 1 && !M.DEVICES.some((d) => d.sku === 'A3004X'));
check('legacy catalog rows are labelled legacy, not current', ['A3023', 'A3027', 'A3029', 'A3030', 'A3031', 'A3032', 'A3033', 'A3045']
  .every((sku) => M.marketEntryForSku(sku)?.marketStatus === 'legacy'));

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
// A3959 state payload: 90 bytes per the OpenSCQ30 parse chain.
function a3959Payload({ fw = '01.6001.60', dual = 0x01, surround = 0x01, gaming = 0x01 } = {}) {
  const p = new Uint8Array(90);
  p[2] = 8; p[3] = 7; // dual_battery(10) scale
  for (let i = 0; i < 10; i++) p[6 + i] = fw.charCodeAt(i);
  p[64] = 0x00; // ambient: NoiseCanceling
  p[73] = dual;
  p[74] = surround;
  p[77] = gaming;
  return p;
}

check(
  'requiredStateLength: A3949 needs ≥ 66 bytes (gaming at 65)',
  M.requiredStateLength(A3949.state) === 66,
  String(M.requiredStateLength(A3949.state)),
);
check(
  'requiredStateLength: A3959 needs ≥ 78 bytes (gaming at 77, sound modes at 64..70)',
  M.requiredStateLength(A3959.state) === 78,
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
  const invalid = M.parseDeviceToggles(a3949Payload({ gaming: 0xff }), A3949.state);
  check('A3949 mirror: non-boolean gaming byte stays unknown', invalid.gaming === null, JSON.stringify(invalid));
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
  const invalid = M.parseDeviceToggles(a3959Payload({ dual: 0xff, surround: 0xff, gaming: 0xff }), A3959.state);
  check('A3959 mirror: non-boolean toggle bytes stay unknown', invalid.dual === null && invalid.surround === null && invalid.gaming === null, JSON.stringify(invalid));
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

  const raw = {};
  const installed = {};
  check(
    'link-down identity guard accepts the installed transport for the active session',
    M.isCurrentTransportSession(guard, s3, installed, installed),
  );
  check(
    'link-down identity guard rejects an old transport even when its callback is late',
    !M.isCurrentTransportSession(guard, s3, installed, raw),
  );
  guard.end();
  check(
    'link-down identity guard rejects callbacks after disconnect',
    !M.isCurrentTransportSession(guard, s3, installed, installed),
  );
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
