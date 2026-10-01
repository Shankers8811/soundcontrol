#!/usr/bin/env node
/**
 * Part 11 — the automated model/feature/protocol matrix.
 *
 * A single deterministic pass over every profile in `DEVICES` plus the
 * documented `06:81` ANC layouts, asserting that:
 *
 *   1. the profile table and the market catalog are internally consistent
 *      (identity, aliases, SKU round-trip, catalog → profile links);
 *   2. every profile's advertised feature flags match the pinned per-SKU
 *      matrix below, and `deriveCapabilities()` mirrors those flags exactly
 *      (a capability can never appear that the profile does not claim);
 *   3. every ANC layout produces its documented frame length, mode encoding,
 *      level encoding and checksum, and only the sub-features proven for that
 *      layout can change the frame (no invented transparency/level/wind byte);
 *   4. invalid intents are REJECTED (null, nothing to send): unknown mode,
 *      unknown scene, and any level outside the documented integer 1..5 on a
 *      layout that carries a level byte. A discrete-mode (`classic`) layout
 *      never encodes a level at all, so a 0–4 "level" can never reach a
 *      discrete-mode model;
 *   5. routing cannot silently merge products: different layouts build
 *      different frames, and the model gate refuses a sound-mode frame whose
 *      length does not match the connected profile's layout;
 *   6. EQ writes respect the read-only policy (`eqCommand: null` stays
 *      read-only; `03:87` exists only for D1202; custom 0xFEFE only where
 *      custom EQ is documented);
 *   7. no profile claims volume, gestures, a factory reset or physical
 *      validation without evidence.
 *
 * Everything here is protocol/unit evidence. Physical validation stays
 * PENDING for every SKU: only the R50i (A3949) and R50i NC (A3959) hardware
 * exists in this workspace and no results have been recorded.
 *
 * Run: npm run test:matrix   (also part of `npm test`)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-matrix-'));
const bundlePath = join(dir, 'matrix.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/protocol/modelRegistry.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/packets.ts';
        export * from './src/protocol/presets.ts';
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

const M = await import(bundlePath);

/* --------------------------------------------------------------- tables */

/**
 * The documented `06:81` layouts. `payload` is the byte count after the
 * ten-byte frame header (including checksum), and the booleans are the only
 * sub-features the bytes can carry — this mirrors `ANC_SUB_FEATURES` and is
 * asserted against it below.
 */
const LAYOUT_MATRIX = {
  classic: { payload: 4, level: false, scenes: true, transVocal: true, wind: false, adaptive: false },
  'classic-a3035': { payload: 6, level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  'classic-a3040': { payload: 6, level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-p30i': { payload: 7, level: true, scenes: true, transVocal: false, wind: true, adaptive: true },
  'tws-l4nc': { payload: 7, level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  'tws-l3pro': { payload: 6, level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-a3062': { payload: 6, level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  'tws-a3936': { payload: 6, level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-l4pro': { payload: 4, level: true, scenes: false, transVocal: false, wind: true, adaptive: false },
  'tws-p40i': { payload: 7, level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  'tws-l5': { payload: 7, level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-a3968': { payload: 6, level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-d1202': { payload: 8, level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
};

/** layout → the exported builder the dispatcher must use (routing identity). */
const LAYOUT_BUILDER = {
  classic: 'buildClassicAnc',
  'classic-a3035': 'buildSpaceOneAnc',
  'classic-a3040': 'buildSpaceQ45Anc',
  'tws-p30i': 'buildP30iAnc',
  'tws-l4nc': 'buildLiberty4NcAnc',
  'tws-l3pro': 'buildLiberty3ProAnc',
  'tws-a3062': 'buildSpaceOneProAnc',
  'tws-a3936': 'buildSpaceA40Anc',
  'tws-l4pro': 'buildLiberty4ProAnc',
  'tws-p40i': 'buildP40iAnc',
  'tws-l5': 'buildLiberty5Anc',
  'tws-a3968': 'buildSportX20Anc',
  'tws-d1202': 'buildD1202Anc',
};

/**
 * Pinned per-SKU feature matrix (verified profiles). Every value is the
 * evidence-backed claim recorded in `src/protocol/devices.ts`; a change that
 * is not accompanied by new evidence fails here.
 */
const FEATURE_MATRIX = [
  { sku: 'A3945', id: 'life-note-3s-readonly', kind: 'earbuds', anc: 'none', ldac: false, dual: false, gaming: false, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3330', id: 'c30i', kind: 'open-ear', anc: 'none', ldac: false, dual: true, gaming: false, surround: false, customEq: true, eq: '02:83-single', bat: 5, off: 0 },
  { sku: 'A3388', id: 'aeroclip', kind: 'open-ear', anc: 'none', ldac: false, dual: true, gaming: false, surround: false, customEq: true, eq: '02:83-dual', bat: 10, off: 1 },
  { sku: 'A3876', id: 'v20i', kind: 'open-ear', anc: 'none', ldac: false, dual: true, gaming: true, surround: false, customEq: true, eq: '02:83-single', bat: 10, off: 1 },
  { sku: 'A3968', id: 'sport-x20', kind: 'earbuds', anc: 'tws-a3968', ldac: false, dual: true, gaming: false, surround: true, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'D1101', id: 'c50i', kind: 'open-ear', anc: 'none', ldac: true, dual: true, gaming: false, surround: false, customEq: true, eq: '02:81-dual', bat: 10, off: 1 },
  { sku: 'D1202', id: 'p31i', kind: 'earbuds', anc: 'tws-d1202', ldac: true, dual: true, gaming: false, surround: false, customEq: false, eq: '03:87', bat: 10, off: 1 },
  { sku: 'D1301', id: 'sleep-a30', kind: 'earbuds', anc: 'none', ldac: false, dual: false, gaming: false, surround: false, customEq: false, eq: null, bat: 10, off: 1 },
  { sku: 'A3959', id: 'p30i', kind: 'earbuds', anc: 'tws-p30i', ldac: false, dual: true, gaming: true, surround: true, customEq: true, eq: '02:83', bat: 10, off: 0 },
  { sku: 'A3949', id: 'p20i', kind: 'earbuds', anc: 'none', ldac: false, dual: false, gaming: true, surround: false, customEq: false, eq: '02:83', bat: 5, off: 0 },
  { sku: 'A3948', id: 'a20i', kind: 'earbuds', anc: 'none', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:83', bat: 5, off: 0 },
  { sku: 'A3947', id: 'liberty-4-nc', kind: 'earbuds', anc: 'tws-l4nc', ldac: false, dual: false, gaming: true, surround: true, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3952', id: 'liberty-3-pro', kind: 'earbuds', anc: 'tws-l3pro', ldac: true, dual: false, gaming: false, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3936', id: 'space-a40', kind: 'earbuds', anc: 'tws-a3936', ldac: true, dual: true, gaming: true, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3954', id: 'liberty-4-pro', kind: 'earbuds', anc: 'tws-l4pro', ldac: true, dual: true, gaming: false, surround: false, customEq: false, eq: null, bat: 100, off: 0 },
  { sku: 'A3955', id: 'p40i', kind: 'earbuds', anc: 'tws-p40i', ldac: false, dual: true, gaming: false, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3957', id: 'liberty-5', kind: 'earbuds', anc: 'tws-l5', ldac: true, dual: true, gaming: true, surround: false, customEq: false, eq: null, bat: 10, off: 1 },
  { sku: 'A3062', id: 'space-one-pro', kind: 'overear', anc: 'tws-a3062', ldac: true, dual: true, gaming: false, surround: false, customEq: false, eq: null, bat: 10, off: 1 },
  { sku: 'A3004', id: 'q20i', kind: 'overear', anc: 'classic', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:83', bat: 5, off: 0 },
  { sku: 'A3005', id: 'q11i', kind: 'overear', anc: 'none', ldac: false, dual: true, gaming: false, surround: false, customEq: true, eq: '02:83', bat: 10, off: 1 },
  { sku: 'D1402', id: 'space-2-readonly', kind: 'overear', anc: 'none', ldac: false, dual: false, gaming: false, surround: false, customEq: false, eq: null, bat: 10, off: 1 },
  { sku: 'A3035', id: 'space-one', kind: 'overear', anc: 'classic-a3035', ldac: true, dual: true, gaming: false, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3040', id: 'q45', kind: 'overear', anc: 'classic-a3040', ldac: true, dual: true, gaming: false, surround: false, customEq: false, eq: null, bat: 5, off: 0 },
  { sku: 'A3027', id: 'q35', kind: 'overear', anc: 'classic', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:81', bat: 5, off: 0 },
  { sku: 'A3028', id: 'q30', kind: 'overear', anc: 'classic', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:81', bat: 5, off: 0 },
  { sku: 'A3029', id: 'life-tune', kind: 'overear', anc: 'classic', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:81', bat: 5, off: 0 },
  { sku: 'A3030', id: 'life-tune-pro', kind: 'overear', anc: 'classic', ldac: false, dual: false, gaming: false, surround: false, customEq: true, eq: '02:81', bat: 5, off: 0 },
];

/** Profiles whose EQ writes are deliberately withheld (read-only policy). */
const EQ_READ_ONLY_SKUS = ['A3945', 'A3968', 'D1301', 'A3947', 'A3952', 'A3936', 'A3954', 'A3955', 'A3957', 'A3062', 'A3035', 'A3040', 'D1402'];

const intent = (over = {}) => ({
  mode: 'anc',
  level: 3,
  scene: 'outdoor',
  transVocal: false,
  wind: false,
  ...over,
});

const payloadOf = (frame) => Array.from(frame.slice(9, frame.length - 1));

const gateEq = (profile, frame) =>
  ['equalizer.set', 'equalizer.set-drc', 'equalizer.set-hearid']
    .some((id) => M.gateCommandForProfile(id, frame, profile).ok);

/* ------------------------------------------------- registry integrity */

console.log('\n[registry] profile and catalog integrity');
const AX = M.DEVICES.filter((d) => d.ancLayout !== 'none');
check('profile table holds the 56 documented profiles', M.DEVICES.length === 56, `${M.DEVICES.length}`);
check('profile ids are unique', new Set(M.DEVICES.map((d) => d.id)).size === M.DEVICES.length);
check('profile SKUs are unique', new Set(M.DEVICES.map((d) => d.sku)).size === M.DEVICES.length);
check('market catalog holds the 51 documented rows', M.MARKET_CATALOG.length === 51, `${M.MARKET_CATALOG.length}`);
check('market catalog SKUs are unique', new Set(M.MARKET_CATALOG.map((e) => e.sku)).size === M.MARKET_CATALOG.length);
check('ANC-capable profiles are the 17 documented ones', AX.length === 17, `${AX.length}`);

for (const profile of M.DEVICES) {
  check(`${profile.sku}: exact SKU resolves back to the same profile`, M.matchDevice(profile.sku).id === profile.id);
  const entry = M.marketEntryForSku(profile.sku);
  if (!profile.verified || entry) {
    check(`${profile.sku}: catalog row exists and points at the profile`, Boolean(entry) && entry.profileId === profile.id);
    check(`${profile.sku}: catalog row is not a physical-validation claim`, entry?.physicalValidation === 'pending');
  }
  const claimed = new Set(M.DEVICES.filter((d) => d.id !== profile.id).flatMap((d) => d.names.map((n) => n.toLowerCase())));
  const own = profile.names.filter((n) => !claimed.has(n.toLowerCase()));
  check(
    `${profile.sku}: at least one unique alias resolves to this exact profile`,
    own.some((n) => M.matchDevice(n).id === profile.id),
    profile.names.join(' | '),
  );
}

/* ------------------------------------------------ per-profile features */

console.log('\n[features] pinned per-SKU matrix + capability derivation');
const bySku = new Map(M.DEVICES.map((d) => [d.sku, d]));
for (const row of FEATURE_MATRIX) {
  const profile = bySku.get(row.sku);
  if (!profile) {
    check(`${row.sku}: pinned matrix row has a profile`, false);
    continue;
  }
  check(
    `${row.sku}: feature matrix (layout/flags/EQ/battery) matches the pinned evidence`,
    profile.id === row.id && profile.kind === row.kind && profile.ancLayout === row.anc &&
      profile.ldac === row.ldac && profile.dual === row.dual && profile.gaming === row.gaming &&
      profile.surround === row.surround && profile.customEq === row.customEq &&
      profile.eqCommand === row.eq && profile.batteryMax === row.bat &&
      (profile.batteryOffset ?? 0) === row.off,
  );
}

for (const profile of M.DEVICES) {
  const caps = M.deriveCapabilities(profile);
  const layoutNone = profile.ancLayout === 'none';
  check(
    `${profile.sku}: capabilities mirror the profile flags exactly`,
    caps.supportsNoiseControl === !layoutNone &&
      caps.supportsEqualizer === (profile.eqCommand !== null) &&
      caps.supportsCustomEq === (profile.eqCommand !== null && profile.customEq) &&
      caps.supportsGaming === profile.gaming &&
      caps.supportsSurround === profile.surround &&
      caps.supportsDual === profile.dual &&
      caps.supportsLdac === profile.ldac &&
      caps.supportsFactoryReset === (profile.factoryReset === true),
  );
  check(
    `${profile.sku}: no volume/gesture control is ever advertised`,
    caps.supportsVolume === false && caps.supportsGestures === false,
  );
  if (!layoutNone) {
    const layout = M.ANC_SUB_FEATURES[profile.ancLayout];
    check(
      `${profile.sku}: ANC sub-features are layout ∩ profile flags (never extra)`,
      caps.ancSub.level === (layout.level && profile.ancLevels) &&
        caps.ancSub.adaptive === (layout.adaptive && profile.ancLevels) &&
        caps.ancSub.scenes === (layout.scenes && profile.scenes) &&
        caps.ancSub.transVocal === (layout.transVocal && profile.transparency) &&
        caps.ancSub.wind === (layout.wind && profile.wind),
    );
  }
  if (!profile.verified) {
    check(
      `${profile.sku}: catalog-only profile exposes no model-specific write`,
      profile.ancLayout === 'none' && profile.eqCommand === null && profile.batteryMax === null &&
        !profile.ldac && !profile.dual && !profile.gaming && !profile.surround,
    );
  }
}
check(
  'no profile claims a factory reset (01:85 is documented only for a speaker)',
  M.DEVICES.every((d) => d.factoryReset !== true),
);

/* ------------------------------------------------------ ANC frame matrix */

console.log('\n[anc] layout frame matrix (length, mode, level, checksum, sub-features)');
for (const [layout, spec] of Object.entries(LAYOUT_MATRIX)) {
  const frame = M.buildAnc(layout, intent({ level: 3 }));
  check(`${layout}: builds a frame`, Boolean(frame));
  if (!frame) continue;
  check(`${layout}: documented frame length ${spec.payload + 10}`, frame.length === spec.payload + 10, `${frame.length}`);
  check(
    `${layout}: header + length field are the documented Soundcore header`,
    frame[0] === 0x08 && frame[1] === 0xee && frame[2] === 0x00 && frame[3] === 0x00 && frame[4] === 0x00 &&
      frame[5] === 0x06 && frame[6] === 0x81 && frame[7] === (frame.length & 0xff) && frame[8] === 0,
  );
  const sum = frame.slice(0, -1).reduce((a, b) => a + b, 0) & 0xff;
  check(`${layout}: checksum is the byte sum`, frame[frame.length - 1] === sum);
  const payload = payloadOf(frame);
  check(`${layout}: ANC mode byte 0x00`, M.buildAnc(layout, intent({ mode: 'anc' })).slice(9, -1)[0] === 0x00);
  check(`${layout}: transparency mode byte 0x01`, M.buildAnc(layout, intent({ mode: 'transparency' })).slice(9, -1)[0] === 0x01);
  check(`${layout}: normal mode byte 0x02`, M.buildAnc(layout, intent({ mode: 'normal' })).slice(9, -1)[0] === 0x02);
  check(`${layout}: dispatcher uses ${LAYOUT_BUILDER[layout]}`, M.buildAnc(layout, intent())?.length === M[LAYOUT_BUILDER[layout]](intent())?.length);
  check(
    `${layout}: dispatcher output is byte-identical to ${LAYOUT_BUILDER[layout]}`,
    Array.from(M.buildAnc(layout, intent())).join(',') === Array.from(M[LAYOUT_BUILDER[layout]](intent())).join(','),
  );

  // Only the documented sub-features may change the frame.
  const t = M.buildAnc(layout, intent({ transVocal: true }));
  const w = M.buildAnc(layout, intent({ wind: true }));
  const s = M.buildAnc(layout, intent({ scene: 'indoor' }));
  const base = M.buildAnc(layout, intent());
  const same = (a, b) => Array.from(a).join(',') === Array.from(b).join(',');
  check(`${layout}: transparency ${spec.transVocal ? 'sub-mode changes the frame' : 'is NOT invented (frame unchanged)'}`, spec.transVocal ? !same(base, t) : same(base, t));
  check(`${layout}: wind ${spec.wind ? 'byte changes the frame' : 'is NOT invented (frame unchanged)'}`, spec.wind ? !same(base, w) : same(base, w));
  check(`${layout}: scene ${spec.scenes ? 'bytes change the frame' : 'is NOT invented (frame unchanged)'}`, spec.scenes ? !same(base, s) : same(base, s));

  if (!spec.level) {
    check(
      `${layout}: discrete-mode model never encodes a level (levels 1–5 identical, level 0/9 ignored)`,
      same(base, M.buildAnc(layout, intent({ level: 1 }))) &&
        same(base, M.buildAnc(layout, intent({ level: 5 }))) &&
        same(base, M.buildAnc(layout, intent({ level: 0 }))) &&
        same(base, M.buildAnc(layout, intent({ level: 9 }))),
    );
  } else if (layout === 'tws-l4pro') {
    check(
      `${layout}: slider byte maps ANC strength 1..5 to 5..1 and transparency to 7..11`,
      M.buildAnc(layout, intent({ level: 1 })).slice(9, -1)[1] === 5 &&
        M.buildAnc(layout, intent({ level: 5 })).slice(9, -1)[1] === 1 &&
        M.buildAnc(layout, intent({ mode: 'transparency', level: 5 })).slice(9, -1)[1] === 11,
    );
  } else {
    check(
      `${layout}: manual nibble equals the integer strength 1..5 in ANC mode`,
      [1, 2, 3, 4, 5].every((level) => ((M.buildAnc(layout, intent({ level })).slice(9, -1)[1] >> 4) & 0x0f) === level),
    );
  }

  if (spec.adaptive) {
    check(`${layout}: adaptive is encoded and differs from manual ANC`, !same(base, M.buildAnc(layout, intent({ mode: 'adaptive' }))));
  } else {
    check(
      `${layout}: requesting adaptive on a non-adaptive layout degrades to the plain ANC frame`,
      same(M.buildAnc(layout, intent({ mode: 'adaptive' })), base),
    );
  }

  // Invalid values are rejected outright — nothing is rounded into a value
  // the device never accepted.
  check(`${layout}: unknown mode is rejected (null)`, M.buildAnc(layout, intent({ mode: 'bogus' })) === null);
  check(`${layout}: unknown scene is rejected (null)`, M.buildAnc(layout, intent({ scene: 'bogus' })) === null);
  if (spec.level) {
    const bad = [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY];
    check(
      `${layout}: levels outside the integer 1..5 are rejected (${bad.join(', ')})`,
      bad.every((level) => M.buildAnc(layout, intent({ level })) === null),
    );
    check(`${layout}: no rejected build writes a level byte`, M.buildAnc(layout, intent({ level: 0 })) === null);
  } else {
    check(
      `${layout}: a stale level cannot block a discrete-mode change (0/NaN still build)`,
      M.buildAnc(layout, intent({ level: 0 })) !== null && M.buildAnc(layout, intent({ level: Number.NaN })) !== null,
    );
  }
}
check('layout "none" builds nothing (null, never a guessed frame)', M.buildAnc('none', intent()) === null);
check(
  'transparency mode never reuses the level nibble to fake a level on the discrete layout',
  Array.from(M.buildAnc('classic', intent({ mode: 'transparency', level: 1 }))).join(',') ===
    Array.from(M.buildAnc('classic', intent({ mode: 'transparency', level: 5 }))).join(','),
);

/* --------------------------------------------- per-model routing + gate */

console.log('\n[routing] own frame allowed, wrong-length frame refused');
const lengthOfLayout = (layout) => LAYOUT_MATRIX[layout].payload + 10;
for (const profile of AX) {
  const frame = M.buildAnc(profile.ancLayout, intent());
  check(`${profile.sku}: own ${profile.ancLayout} frame is allowed by the model gate`, M.gateCommandForProfile('sound-modes.set', frame, profile).ok);
  const other = Object.keys(LAYOUT_MATRIX).find((l) => l !== profile.ancLayout && lengthOfLayout(l) !== frame.length);
  if (other) {
    const foreign = M.buildAnc(other, intent());
    const gate = M.gateCommandForProfile('sound-modes.set', foreign, profile);
    check(`${profile.sku}: a ${other} frame of a different length is refused`, gate.ok === false, JSON.stringify(gate));
  }
}
for (const profile of M.DEVICES.filter((d) => d.ancLayout === 'none')) {
  check(`${profile.sku}: no sound-mode frame can be sent (no layout)`, M.gateCommandForProfile('sound-modes.set', M.buildAnc('classic', intent()), profile).ok === false);
}

/* ---------------------------------------------------- transparency audit */

console.log('\n[transparency] separate encoding, never the ANC level');
const transLayouts = Object.entries(LAYOUT_MATRIX).filter(([, s]) => s.transVocal).map(([l]) => l);
const noTransLayouts = Object.entries(LAYOUT_MATRIX).filter(([, s]) => !s.transVocal).map(([l]) => l);
check('vocal transparency layouts are the nine documented ones', transLayouts.length === 9, transLayouts.join(','));
check(
  'layouts with no transparency sub-mode are fixed-shape under transVocal changes',
  noTransLayouts.every((l) => Array.from(M.buildAnc(l, intent({ transVocal: true }))).join(',') === Array.from(M.buildAnc(l, intent())).join(',')),
);

/* ----------------------------------------------------------- EQ audit */

console.log('\n[eq] read-only policy, command routing, custom-curve gating');
for (const sku of EQ_READ_ONLY_SKUS) {
  const profile = bySku.get(sku);
  check(`${sku}: EQ writes stay withheld (eqCommand null)`, profile.eqCommand === null);
  check(
    `${sku}: every EQ frame is refused by the model gate`,
    ['02:81', '02:83', '03:87'].every((command) => !gateEq(profile, M.buildEq(command, 0x0001, Array(8).fill(0)))),
  );
}
check('03:87 is used by exactly one profile (D1202 P31i/R60i NC)', M.DEVICES.filter((d) => d.eqCommand === '03:87').map((d) => d.sku).join(',') === 'D1202');
check('02:81 EQ frames are 20 bytes (classic one-channel)', M.buildEq('02:81', 0x0100, Array(8).fill(0)).length === 20);
check('02:81-dual EQ frames are 32 bytes (D1101 two-channel)', M.buildEq('02:81-dual', 0x0100, Array(8).fill(0)).length === 32);
check('02:83 EQ frames are 32 bytes (preset + raw + DRC)', M.buildEq('02:83', 0x0100, Array(8).fill(0)).length === 32);
check('03:87 EQ frames are 124 bytes (D1202 template)', M.buildEq('03:87', 0x0100, Array(8).fill(0)).length === 124);
for (const profile of M.DEVICES.filter((d) => d.eqCommand !== null)) {
  const custom = M.buildEq(profile.eqCommand, M.CUSTOM_EQ_PRESET_ID, Array(8).fill(0));
  check(
    `${profile.sku}: custom 0xFEFE curve is ${profile.customEq ? 'allowed' : 'refused'}`,
    gateEq(profile, custom) === profile.customEq,
  );
}

// An equalizer write must be impossible to deform: the source builders always
// emit the documented number of bands, so a short, long, NaN or absurd band
// array may change the values but never the frame length, the CAT:TYPE or the
// checksum position. Anything else would let a UI bug write an unverified
// shape to the device.
const EQ_SHAPES = {
  '02:81': 20,
  '02:81-dual': 32,
  '02:83': 32,
  '02:83-dual': 32,
  '03:87': 124,
};
const HOSTILE_BANDS = [
  [],
  [0],
  [12],
  Array(8).fill(NaN),
  Array(8).fill(Infinity),
  Array(8).fill(-Infinity),
  [1200, -1200, 0, 1e9, -1e9, 250, -250, 0],
  Array(64).fill(6),
];
for (const [command, expected] of Object.entries(EQ_SHAPES)) {
  for (const bands of HOSTILE_BANDS) {
    const frame = M.buildEq(command, 0x0001, bands);
    const label = `${command} with ${bands.length} band(s) [${
      bands.some((b) => !Number.isFinite(b)) ? 'non-finite' : 'finite'
    }]`;
    check(`${label}: frame length stays ${expected} bytes`, frame.length === expected);
    check(`${label}: CAT:TYPE stays ${command}`, `${frame[5].toString(16).padStart(2, '0')}:${frame[6].toString(16).padStart(2, '0')}` === command.split('-')[0]);
    check(`${label}: total_len matches the frame`, frame[7] | (frame[8] << 8) === frame.length);
    check(
      `${label}: every payload byte is a byte`,
      frame.slice(9, -1).every((b) => Number.isInteger(b) && b >= 0 && b <= 0xff),
    );
  }
}
check(
  'preset ids are little-endian 16-bit exactly as documented',
  (() => {
    const custom = M.buildEq('02:81', M.CUSTOM_EQ_PRESET_ID, Array(8).fill(0));
    const other = M.buildEq('02:81', 0x1234, Array(8).fill(0));
    return custom[9] === 0xfe && custom[10] === 0xfe && other[9] === 0x34 && other[10] === 0x12;
  })(),
);
// Wrong-shape writes to a profile that does use EQ must still be refused: the
// CAT:TYPE bytes are shared, so only the connected profile's documented length
// may pass.
const d1101 = bySku.get('D1101');
if (d1101 && d1101.eqCommand === '02:81-dual') {
  check('D1101: its 32-byte 02:81-dual frame is allowed', gateEq(d1101, M.buildEq('02:81-dual', 0x0001, Array(8).fill(0))));
  check('D1101: the 20-byte classic 02:81 frame is refused', !gateEq(d1101, M.buildEq('02:81', 0x0001, Array(8).fill(0))));
}
const d1202Eq = bySku.get('D1202');
if (d1202Eq) {
  check('D1202: its 124-byte 03:87 frame is allowed', gateEq(d1202Eq, M.buildEq('03:87', 0x0001, Array(8).fill(0))));
  check('D1202: a 32-byte 02:83 frame is refused', !gateEq(d1202Eq, M.buildEq('02:83', 0x0001, Array(8).fill(0))));
  check('D1202: a fabricated HearID frame is refused', !gateEq(d1202Eq, M.buildEq('03:87', 0x0001, Array(8).fill(0)).slice(0, 60)));
}

/* --------------------------------------------------- unsupported claims */

console.log('\n[claims] nothing beyond the evidence');
for (const profile of M.DEVICES) {
  const claim = M.marketEntryForSku(profile.sku);
  if (claim) {
    check(`${profile.sku}: physical validation is still pending (no hardware claim)`, claim.physicalValidation === 'pending');
  }
}
check('battery scales are only the documented 5 / 10 / 100 / null', M.DEVICES.every((d) => [5, 10, 100, null].includes(d.batteryMax)));
check(
  'catalog-only profiles never carry a battery scale or a command',
  M.DEVICES.filter((d) => !d.verified).every((d) => d.batteryMax === null && d.eqCommand === null && d.ancLayout === 'none'),
);

/* ------------------------------------------------------------------ done */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
