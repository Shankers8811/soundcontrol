#!/usr/bin/env node
/**
 * Model capability + ANC state-machine matrix (the "each model gets only its
 * own verified commands" suite).
 *
 * This file is the regression net for the whole supported-model table. It
 * answers, in one place:
 *
 *   1. which capabilities each SKU is allowed to expose (pinned per model);
 *   2. the exact payload every layout produces for every user action (pinned
 *      byte-for-byte, so changing one protocol family cannot silently move
 *      another one's frames);
 *   3. the ANC state-transition matrix — Normal → Manual L1..L5 → Adaptive →
 *      Scene → Manual → Normal — asserting that no frame ever carries a stale
 *      mode selector from the previous control;
 *   4. per-model transparency / wind / surround / EQ gating at the *gate*
 *      (the wire path), not only in the UI;
 *   5. model routing, identification and cross-family frame-length isolation;
 *   6. rejection of invalid levels, scenes and EQ values before transmission.
 *
 * Every expectation is sourced. Where a layout's selector values come from an
 * upstream enum, the comment names the file it was read from (OpenSCQ30
 * per-device module). Nothing here is inferred from "both devices have ANC".
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

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-capability-'));
const bundlePath = join(dir, 'capability.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/protocol/modelRegistry.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/packets.ts';
        export * from './src/protocol/presets.ts';
        export * from './src/protocol/targets.ts';
        export * from './src/state/derive.ts';
        export { CUSTOM_EQ_PRESET_ID } from './src/protocol/presets.ts';
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

const bySku = new Map(M.DEVICES.map((p) => [p.sku, p]));
const payload = (frame) => (frame ? Array.from(frame.slice(9, frame.length - 1)) : null);
const payloadHex = (frame) => (frame ? payload(frame).join(',') : 'null');

/** The base intent the store produces when nothing else is set. */
const BASE = {
  mode: 'anc',
  level: 3,
  scene: 'indoor',
  transVocal: false,
  wind: false,
  adaptiveLevel: 5,
};
const frameFor = (layout, over = {}) => M.buildAnc(layout, { ...BASE, ...over });

/**
 * The sub-mode the store derives from a user action (`setAnc`):
 * an explicit scene pick ⇒ Multi-scene, the adaptive toggle ⇒ Adaptive,
 * anything else (level buttons, plain mode change) ⇒ Manual.
 */
const storeSubMode = (mode, scene) =>
  scene !== undefined ? 'multiscene' : mode === 'adaptive' ? 'adaptive' : 'manual';

/* ===================================================================== */
/* 1. Pinned per-layout frames (cross-model regression net)              */
/* ===================================================================== */

console.log('\n[frames] pinned payload per layout and action');

/**
 * Payload bytes (between the length field and the checksum) each layout must
 * produce. These are the exact bytes the builders are evidence-backed to emit;
 * if a change to one protocol family moves any of these lines, a different
 * model's wire format would change, which is precisely what must never happen
 * silently.
 *
 * Layout sources (OpenSCQ30): classic `common/structures/sound_modes.rs`,
 * a3035/a3040 their own modules, p30i `a3959`, l4nc `a3947`, l3pro `a3952`,
 * a3062 `a3062`, a3936 `a3936`, l4pro/a3954 `a3954/structures.rs`,
 * p40i `a3955`, l5 `a3957`, a3968 `a3968`, d1202 `d1202/structures.rs`.
 */
const LAYOUT_PINS = {
  classic: {
    ancL3: '0,2,0,0',
    manualL1: '0,2,0,0',
    manualL5: '0,2,0,0',
    adaptive: '0,2,0,0',
    sceneTransport: '0,0,0,0',
    sceneIndoor: '0,2,0,0',
    transparency: '1,2,0,0',
    transVocal: '1,2,1,0',
    normal: '2,2,0,0',
    windOn: '0,2,0,0',
  },
  'classic-a3035': {
    ancL3: '0,48,0,0,0,1',
    manualL1: '0,16,0,0,0,1',
    manualL5: '0,80,0,0,0,1',
    adaptive: '0,83,0,1,0,1',
    sceneTransport: '0,48,0,0,0,1',
    sceneIndoor: '0,48,0,0,0,1',
    transparency: '1,80,1,0,0,5',
    transVocal: '1,80,1,0,0,5',
    normal: '2,80,2,0,0,1',
    windOn: '0,48,0,0,1,1',
  },
  'classic-a3040': {
    ancL3: '0,48,1,0,0,1',
    manualL1: '0,16,1,0,0,1',
    manualL5: '0,80,1,0,0,1',
    adaptive: '0,83,1,1,0,1',
    sceneTransport: '0,48,1,0,0,1',
    sceneIndoor: '0,48,1,0,0,1',
    transparency: '1,80,1,0,0,5',
    transVocal: '1,80,0,0,0,5',
    normal: '2,80,1,0,0,1',
    windOn: '0,48,1,0,1,1',
  },
  'tws-p30i': {
    ancL3: '0,53,0,0,0,255,2',
    manualL1: '0,21,0,0,0,255,2',
    manualL5: '0,85,0,0,0,255,2',
    adaptive: '0,53,0,1,0,255,2',
    sceneTransport: '0,53,0,2,0,255,0',
    sceneIndoor: '0,53,0,2,0,255,2',
    transparency: '1,53,1,0,0,255,2',
    transVocal: '1,53,1,0,0,255,2',
    normal: '2,53,2,0,0,255,2',
    windOn: '0,53,0,0,1,255,2',
  },
  'tws-l4nc': {
    ancL3: '0,48,0,0,0,0,2',
    manualL1: '0,16,0,0,0,0,2',
    manualL5: '0,80,0,0,0,0,2',
    adaptive: '0,50,0,1,0,0,2',
    sceneTransport: '0,48,0,2,0,0,0',
    sceneIndoor: '0,48,0,0,0,0,2',
    transparency: '1,48,0,0,0,0,2',
    transVocal: '1,48,1,0,0,0,2',
    normal: '2,48,0,0,0,0,2',
    windOn: '0,48,0,0,1,0,2',
  },
  'tws-l3pro': {
    ancL3: '0,48,0,0,0,0',
    manualL1: '0,16,0,0,0,0',
    manualL5: '0,80,0,0,0,0',
    adaptive: '0,49,0,1,0,0',
    sceneTransport: '0,48,0,0,0,0',
    sceneIndoor: '0,48,0,0,0,0',
    transparency: '1,48,0,0,0,0',
    transVocal: '1,48,1,0,0,0',
    normal: '2,48,0,0,0,0',
    windOn: '0,48,0,0,1,0',
  },
  'tws-a3062': {
    ancL3: '0,48,1,0,0,1',
    manualL1: '0,16,1,0,0,1',
    manualL5: '0,80,1,0,0,1',
    adaptive: '0,83,1,1,0,1',
    sceneTransport: '0,48,1,0,0,1',
    sceneIndoor: '0,48,1,0,0,1',
    transparency: '1,80,1,0,0,5',
    transVocal: '1,80,1,0,0,5',
    normal: '2,80,1,0,0,1',
    windOn: '0,48,1,0,1,1',
  },
  'tws-a3936': {
    ancL3: '0,48,0,0,0,0',
    manualL1: '0,16,0,0,0,0',
    manualL5: '0,80,0,0,0,0',
    adaptive: '0,81,0,1,0,2',
    sceneTransport: '0,48,0,0,0,0',
    sceneIndoor: '0,48,0,0,0,0',
    transparency: '1,80,0,0,0,0',
    transVocal: '1,80,1,0,0,0',
    normal: '2,80,0,0,0,0',
    windOn: '0,48,0,0,1,0',
  },
  'tws-l4pro': {
    ancL3: '0,3,0,0',
    manualL1: '0,5,0,0',
    manualL5: '0,1,0,0',
    adaptive: '0,3,0,0',
    sceneTransport: '0,3,0,0',
    sceneIndoor: '0,3,0,0',
    transparency: '1,9,0,0',
    transVocal: '1,9,0,0',
    normal: '2,6,0,0',
    windOn: '0,3,0,1',
  },
  'tws-p40i': {
    ancL3: '0,48,0,0,0,0,2',
    manualL1: '0,16,0,0,0,0,2',
    manualL5: '0,80,0,0,0,0,2',
    adaptive: '0,50,0,1,0,2,2',
    sceneTransport: '0,48,0,2,0,0,0',
    sceneIndoor: '0,48,0,2,0,0,2',
    transparency: '1,48,0,0,0,0,2',
    transVocal: '1,48,1,0,0,0,2',
    normal: '2,48,0,0,0,0,2',
    windOn: '0,48,0,0,1,0,2',
  },
  'tws-l5': {
    ancL3: '0,48,0,0,0,0,3',
    manualL1: '0,16,0,0,0,0,3',
    manualL5: '0,80,0,0,0,0,3',
    adaptive: '0,49,0,1,0,2,3',
    sceneTransport: '0,48,0,2,0,0,0',
    sceneIndoor: '0,48,0,0,0,0,3',
    transparency: '1,48,0,0,0,0,3',
    transVocal: '1,48,1,0,0,0,3',
    normal: '2,48,0,0,0,0,3',
    windOn: '0,48,0,0,1,0,3',
  },
  'tws-a3968': {
    ancL3: '0,48,0,0,0,255',
    manualL1: '0,16,0,0,0,255',
    manualL5: '0,80,0,0,0,255',
    adaptive: '0,81,0,1,0,255',
    sceneTransport: '0,48,0,0,0,255',
    sceneIndoor: '0,48,0,0,0,255',
    transparency: '1,80,0,0,0,255',
    transVocal: '1,80,1,0,0,255',
    normal: '2,80,0,0,0,255',
    windOn: '0,48,0,0,1,255',
  },
  'tws-d1202': {
    ancL3: '0,48,0,0,0,0,2,0',
    manualL1: '0,16,0,0,0,0,2,0',
    manualL5: '0,80,0,0,0,0,2,0',
    adaptive: '0,81,0,1,0,0,2,0',
    sceneTransport: '0,48,0,2,0,0,0,0',
    sceneIndoor: '0,48,0,2,0,0,2,0',
    transparency: '1,80,0,0,0,0,2,0',
    transVocal: '1,80,1,0,0,0,2,0',
    normal: '2,80,0,0,0,0,2,0',
    windOn: '0,48,0,0,1,0,2,0',
  },
};

const ACTION_INTENTS = {
  ancL3: {},
  manualL1: { level: 1 },
  manualL5: { level: 5 },
  adaptive: { mode: 'adaptive', subMode: 'adaptive' },
  sceneTransport: { subMode: 'multiscene', scene: 'transport' },
  sceneIndoor: { subMode: 'multiscene', scene: 'indoor' },
  transparency: { mode: 'transparency' },
  transVocal: { mode: 'transparency', transVocal: true },
  normal: { mode: 'normal' },
  windOn: { wind: true },
};

for (const [layout, expected] of Object.entries(LAYOUT_PINS)) {
  for (const [action, over] of Object.entries(ACTION_INTENTS)) {
    const frame = frameFor(layout, over);
    eq(`${layout} · ${action}: payload is pinned`, payloadHex(frame), expected[action]);
  }
}

/* ===================================================================== */
/* 2. The mode selector: exact value per action, never stale             */
/* ===================================================================== */

console.log('\n[selector] per-layout mode-selector value for every action');

/**
 * Byte 3 of each layout is *not* the same field across models. Only the
 * layouts whose own structure defines a Manual/Adaptive/MultiScene (or
 * Manual/Adaptive/Transportation) selector may be asserted as such:
 *
 *   tws-p30i  `a3959/structures/sound_modes.rs`  Manual 0 / Adaptive 1 / MultiScene 2
 *   tws-p40i  `a3955/structures/sound_modes.rs`  Manual 0 / Adaptive 1 / MultiScene 2
 *   tws-d1202 `d1202/structures.rs`              Manual 0 / Adaptive 1 / MultiScene 2
 *   tws-l4nc  `a3947/structures.rs`              Manual 0 / Adaptive 1 / Transportation 2
 *   tws-l5    `a3957/...`                        Manual 0 / Adaptive 1 / scene 2
 *
 * Everything else encodes a plain adaptive flag (0/1) or has no automation
 * byte at all — those are asserted against their own pinned frames above.
 */
const SELECTOR_LAYOUTS = {
  // Three-value MultiScene selector with a separate scene byte.
  'tws-p30i': { manual: 0, adaptive: 1, scenes: { transport: 2, outdoor: 2, indoor: 2 } },
  'tws-p40i': { manual: 0, adaptive: 1, scenes: { transport: 2, outdoor: 2, indoor: 2 } },
  'tws-d1202': { manual: 0, adaptive: 1, scenes: { transport: 2, outdoor: 2, indoor: 2 } },
  // Transportation selector: only the transport scene uses value 2; the
  // outdoor/indoor scenes are not exposed for these profiles and keep 0.
  'tws-l4nc': { manual: 0, adaptive: 1, scenes: { transport: 2, outdoor: 0, indoor: 0 } },
  'tws-l5': { manual: 0, adaptive: 1, scenes: { transport: 2, outdoor: 0, indoor: 0 } },
};

for (const [layout, selector] of Object.entries(SELECTOR_LAYOUTS)) {
  check(
    `${layout}: manual level writes the Manual selector (${selector.manual})`,
    frameFor(layout, { level: 1, subMode: 'manual' })[12] === selector.manual &&
      frameFor(layout, { level: 5, subMode: 'manual' })[12] === selector.manual,
  );
  check(
    `${layout}: adaptive writes the Adaptive selector (${selector.adaptive})`,
    frameFor(layout, { mode: 'adaptive', subMode: 'adaptive' })[12] === selector.adaptive,
  );
  check(
    `${layout}: each scene writes its own documented selector value`,
    Object.entries(selector.scenes).every(
      ([scene, want]) => frameFor(layout, { subMode: 'multiscene', scene })[12] === want,
    ),
  );
}

// The transition matrix: every step must state its own selector, so a stale
// value from the previous control can never be re-sent.
const TRANSITIONS = [
  ['Normal → Manual L1', storeSubMode('normal'), { mode: 'normal' }, { mode: 'anc', level: 1 }],
  ['Manual L1 → L2', storeSubMode('anc'), { mode: 'anc', level: 1 }, { mode: 'anc', level: 2 }],
  ['Manual L2 → L3', storeSubMode('anc'), { mode: 'anc', level: 2 }, { mode: 'anc', level: 3 }],
  ['Manual L3 → L4', storeSubMode('anc'), { mode: 'anc', level: 3 }, { mode: 'anc', level: 4 }],
  ['Manual L4 → L5', storeSubMode('anc'), { mode: 'anc', level: 4 }, { mode: 'anc', level: 5 }],
  ['Manual L5 → Adaptive', storeSubMode('adaptive'), { mode: 'anc', level: 5 }, { mode: 'adaptive' }],
  ['Adaptive → Manual L1', storeSubMode('anc'), { mode: 'adaptive' }, { mode: 'anc', level: 1 }],
  ['Manual L1 → Scene', storeSubMode('anc', 'transport'), { mode: 'anc', level: 1 }, { mode: 'anc', scene: 'transport' }],
  ['Scene → Manual L1', storeSubMode('anc'), { mode: 'anc', scene: 'indoor' }, { mode: 'anc', level: 1 }],
  ['Scene → Adaptive', storeSubMode('adaptive'), { mode: 'anc', scene: 'outdoor' }, { mode: 'adaptive' }],
  ['Adaptive → Scene', storeSubMode('anc', 'indoor'), { mode: 'adaptive' }, { mode: 'anc', scene: 'indoor' }],
  ['Manual L3 → Normal', storeSubMode('normal'), { mode: 'anc', level: 3 }, { mode: 'normal' }],
];

for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  const layout = profile.ancLayout;
  const sub = M.ANC_SUB_FEATURES[layout];
  const selector = SELECTOR_LAYOUTS[layout];
  const label = `${profile.sku}/${layout}`;

  for (const [name, subMode, before, after] of TRANSITIONS) {
    const step = {
      ...BASE,
      ...before,
      ...after,
      subMode: after.scene !== undefined ? 'multiscene' : subMode,
    };
    const frame = M.buildAnc(layout, step);
    if (!frame) {
      check(`${label}: ${name} builds a frame`, false, 'builder returned null');
      continue;
    }
    const parsed = M.parseSoundModes(payload(frame), layout);
    // Requesting adaptive on a layout with no adaptive field must degrade to
    // the plain ANC frame — an unsupported value is never invented.
    const expectedMode = after.mode === 'adaptive' && !sub.adaptive ? 'anc' : after.mode;
    check(
      `${label}: ${name} parses back as ${expectedMode}`,
      parsed !== null && parsed.mode === expectedMode,
      parsed ? JSON.stringify(parsed) : 'null',
    );
    if (selector && (sub.adaptive || subMode !== 'adaptive')) {
      const want =
        after.scene !== undefined
          ? selector.scenes[after.scene]
          : subMode === 'adaptive'
            ? selector.adaptive
            : selector.manual;
      check(
        `${label}: ${name} writes this model's ${subMode} selector (${want})`,
        frame[12] === want,
        `byte3=0x${frame[12].toString(16)}`,
      );
    }
    if (sub.level && after.level !== undefined) {
      const nibble = (frame[10] >> 4) & 0x0f;
      check(
        `${label}: ${name} encodes the manual strength ${after.level} in its own field`,
        layout === 'tws-l4pro' ? frame[10] === 6 - after.level : nibble === after.level,
        `byte1=0x${frame[10].toString(16)}`,
      );
    }
  }
}

/* ===================================================================== */
/* 3. Per-model capability table (pinned)                                */
/* ===================================================================== */

console.log('\n[capability] pinned capability record per SKU');

const CAPABILITY_PINS = {
  A3330: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83-single', custom: true, set: 'c30i' },
  A3388: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83-dual', custom: true, set: 'type2' },
  A3876: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83-single', custom: true, set: 'v20i' },
  A3968: { layout: 'tws-a3968', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: true, eq: '-', custom: false, set: 'standard' },
  D1101: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:81-dual', custom: true, set: 'c50i' },
  D1202: { layout: 'tws-d1202', level: true, scenes: true, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '03:87', custom: false, set: 'type2' },
  A3959: { layout: 'tws-p30i', level: true, scenes: true, adaptive: true, tmode: false, tvocal: false, wind: true, surround: true, eq: '02:83', custom: true, set: 'type2' },
  A3949: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83', custom: false, set: 'type2' },
  A3948: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83', custom: true, set: 'type2' },
  A3947: { layout: 'tws-l4nc', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: true, eq: '-', custom: false, set: 'standard' },
  A3952: { layout: 'tws-l3pro', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3936: { layout: 'tws-a3936', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3954: { layout: 'tws-l4pro', level: true, scenes: false, adaptive: false, tmode: true, tvocal: false, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3955: { layout: 'tws-p40i', level: true, scenes: true, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3957: { layout: 'tws-l5', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3062: { layout: 'tws-a3062', level: true, scenes: false, adaptive: true, tmode: true, tvocal: false, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3004: { layout: 'classic', level: false, scenes: false, adaptive: false, tmode: true, tvocal: false, wind: false, surround: false, eq: '02:83', custom: true, set: 'standard' },
  A3005: { layout: 'none', level: false, scenes: false, adaptive: false, tmode: false, tvocal: false, wind: false, surround: false, eq: '02:83', custom: true, set: 'standard' },
  A3035: { layout: 'classic-a3035', level: true, scenes: false, adaptive: true, tmode: true, tvocal: false, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3040: { layout: 'classic-a3040', level: true, scenes: false, adaptive: true, tmode: true, tvocal: true, wind: true, surround: false, eq: '-', custom: false, set: 'standard' },
  A3027: { layout: 'classic', level: false, scenes: true, adaptive: false, tmode: true, tvocal: false, wind: false, surround: false, eq: '02:81', custom: true, set: 'standard' },
  A3028: { layout: 'classic', level: false, scenes: true, adaptive: false, tmode: true, tvocal: false, wind: false, surround: false, eq: '02:81', custom: true, set: 'standard' },
  A3029: { layout: 'classic', level: false, scenes: true, adaptive: false, tmode: true, tvocal: false, wind: false, surround: false, eq: '02:81', custom: true, set: 'standard' },
  A3030: { layout: 'classic', level: false, scenes: true, adaptive: false, tmode: true, tvocal: false, wind: false, surround: false, eq: '02:81', custom: true, set: 'standard' },
};

for (const [sku, expected] of Object.entries(CAPABILITY_PINS)) {
  const profile = bySku.get(sku);
  check(`${sku}: exists in the device table`, Boolean(profile));
  if (!profile) continue;
  const caps = M.deriveCapabilities(profile);
  const actual = {
    layout: profile.ancLayout,
    level: caps.ancSub.level,
    scenes: caps.ancSub.scenes,
    adaptive: caps.ancSub.adaptive,
    tmode: caps.supportsTransparencyMode,
    tvocal: caps.ancSub.transVocal,
    wind: caps.ancSub.wind,
    surround: caps.supportsSurround,
    eq: profile.eqCommand ?? '-',
    custom: caps.supportsCustomEq,
    set: profile.presetSet ?? 'standard',
  };
  eq(`${sku}: capability record`, actual, expected);
}

check(
  'every ANC-capable profile states ambientTransparency explicitly (no silent default)',
  M.DEVICES.filter((p) => p.ancLayout !== 'none').every((p) => typeof p.ambientTransparency === 'boolean'),
  M.DEVICES.filter((p) => p.ancLayout !== 'none' && typeof p.ambientTransparency !== 'boolean')
    .map((p) => p.sku)
    .join(','),
);
check(
  'A3959 is the only ANC-capable model without a documented transparency mode',
  M.DEVICES.filter((p) => p.ancLayout !== 'none' && p.ambientTransparency === false).map((p) => p.sku).join(',') === 'A3959',
);

/* ===================================================================== */
/* 4. Transparency: UI capability AND gate rejection                     */
/* ===================================================================== */

console.log('\n[transparency] per-model capability + wire-path refusal');

for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  // A 17-byte frame is only meaningful for the 7-byte layouts; build one with
  // the profile's own layout so the length gate is not what refuses it.
  const frame = M.buildAnc(profile.ancLayout, { ...BASE, mode: 'transparency' });
  const gate = M.gateCommandForProfile('sound-modes.set', frame, profile);
  if (profile.ambientTransparency === true) {
    check(`${profile.sku}: transparency frame is allowed by the gate`, gate.ok, gate.reason ?? '');
  } else {
    check(
      `${profile.sku}: transparency frame is REFUSED by the gate (no documented transparency mode)`,
      gate.ok === false && /transparency mode/.test(gate.reason ?? ''),
      gate.reason ?? 'allowed',
    );
  }
}

// The store-level derivation the UI reads must agree with the profile flag.
for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  eq(
    `${profile.sku}: UI transparency capability matches the profile flag`,
    M.deriveCapabilities(profile).supportsTransparencyMode,
    profile.ambientTransparency === true,
  );
}

/* ===================================================================== */
/* 5. EQ: per-model preset table and gate                                */
/* ===================================================================== */

console.log('\n[eq] per-model factory preset tables and preset-id gate');

for (const profile of M.DEVICES.filter((p) => p.eqCommand !== null)) {
  const presets = M.presetsForProfile(profile);
  check(`${profile.sku}: has at least one factory preset`, presets.length > 0);
  const command = profile.eqCommand.split('-')[0];
  for (const preset of presets) {
    const frame = M.buildEq(profile.eqCommand, preset.index, preset.bands);
    const gate = M.gateCommandForProfile(
      command === '02:81' ? 'equalizer.set' : command === '03:87' ? 'equalizer.set-hearid' : 'equalizer.set-drc',
      frame,
      profile,
    );
    check(
      `${profile.sku}: preset ${preset.name} (0x${preset.index.toString(16)}) writes over ${profile.eqCommand}`,
      gate.ok,
      gate.reason ?? '',
    );
  }
  // An id this model does not define must be refused.
  const foreignId = [0x0000, 0x0001, 0x0002, 0x0003, 0x0011, 0x0014, 0x0015, 0x001e].find(
    (id) => !presets.some((p) => p.index === id),
  );
  if (foreignId !== undefined) {
    const frame = M.buildEq(profile.eqCommand, foreignId, Array(8).fill(0));
    const gate = M.gateCommandForProfile(
      command === '02:81' ? 'equalizer.set' : command === '03:87' ? 'equalizer.set-hearid' : 'equalizer.set-drc',
      frame,
      profile,
    );
    check(
      `${profile.sku}: undefined preset 0x${foreignId.toString(16)} is REFUSED`,
      gate.ok === false && /defines/.test(gate.reason ?? ''),
      gate.reason ?? 'allowed',
    );
  }
}

// Preset tables are per-model facts, not UI preferences.
eq('A3959 preset ids come from the type-2 table', M.presetsForProfile(bySku.get('A3959')).length, 22);
check(
  'A3959 Rock carries the type-2 +4/+5 dB tail',
  M.presetsForProfile(bySku.get('A3959')).find((p) => p.index === 0x11).wire.slice(6, 8).join(',') === '160,170',
);
// A3949 uses the same `common_settings_type_2()` table (OpenSCQ30 a3949.rs),
// so it shares the re-tuned Rock; a classic 02:81 model uses
// `common_settings()` and keeps the +3/+3 dB tail.
check(
  'A3949 shares the type-2 Rock tail (+4/+5 dB) with A3959',
  M.presetsForProfile(bySku.get('A3949')).find((p) => p.index === 0x11).wire.slice(6, 8).join(',') === '160,170',
);
check(
  'A3027 (standard table) keeps the +3/+3 dB Rock tail',
  M.presetsForProfile(bySku.get('A3027')).find((p) => p.index === 0x11).wire.slice(6, 8).join(',') === '150,150',
);
eq('A3330 defines one preset', M.presetsForProfile(bySku.get('A3330')).map((p) => p.index), [0x00]);
eq('D1101 defines six presets', M.presetsForProfile(bySku.get('D1101')).map((p) => p.index), [0x00, 0x02, 0x04, 0x05, 0x14, 0x1e]);
eq('A3876 uses its own names for the same ids', M.presetsForProfile(bySku.get('A3876')).find((p) => p.index === 0x01).name, 'Balanced');
eq('A3876 has its own Spoken Word/Podcast assignment', M.presetsForProfile(bySku.get('A3876')).find((p) => p.index === 0x13).name, 'Podcast');
check(
  'the standard table keeps Dance at 0x06 and Spoken Word at 0x13',
  M.presetsForProfile(bySku.get('A3027')).find((p) => p.index === 0x06).name === 'Dance' &&
    M.presetsForProfile(bySku.get('A3027')).find((p) => p.index === 0x13).name === 'Spoken Word',
);

/* ===================================================================== */
/* 6. Routing, identification and cross-family isolation                 */
/* ===================================================================== */

console.log('\n[routing] identification, aliases and cross-layout isolation');

eq('R50i resolves to the A3949 profile', M.matchDevice('soundcore R50i').sku, 'A3949');
eq('R50i NC resolves to the A3959 profile', M.matchDevice('R50i NC').sku, 'A3959');
eq('P30i resolves to A3959', M.matchDevice('P30i').sku, 'A3959');
eq('A3959 model string resolves to A3959', M.matchDevice('A3959').sku, 'A3959');
eq('A3030 (Life Tune Pro) resolves to its own profile with the Life Tune layout', M.matchDevice('Life Tune Pro').ancLayout, 'classic');
eq('A3029 (Life Tune) resolves to the A3028 layout family', M.matchDevice('Life Tune').ancLayout, 'classic');
check(
  'A3027/A3030 share one layout but stay separate profiles',
  bySku.get('A3027').id !== bySku.get('A3030').id && bySku.get('A3027').ancLayout === bySku.get('A3030').ancLayout,
);

// Every profile refuses another family's frame by length.
const layoutLengths = new Map();
for (const layout of Object.keys(LAYOUT_PINS)) {
  layoutLengths.set(layout, M.buildAnc(layout, { ...BASE, mode: 'anc', subMode: 'manual' }).length);
}
for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  for (const [otherLayout, frame] of Object.entries(LAYOUT_PINS)) {
    if (otherLayout === profile.ancLayout) continue;
    const length = layoutLengths.get(otherLayout);
    const expectedOwn = layoutLengths.get(profile.ancLayout);
    if (length === expectedOwn) continue; // same length ⇒ the gate cannot tell them apart
    const otherFrame = M.buildAnc(otherLayout, { ...BASE, mode: 'anc', subMode: 'manual' });
    const gate = M.gateCommandForProfile('sound-modes.set', otherFrame, profile);
    check(
      `${profile.sku}: refuses the ${otherLayout} frame (${length}B vs its own ${expectedOwn}B)`,
      gate.ok === false,
      gate.reason ?? 'allowed',
    );
    void frame;
  }
}

/* ===================================================================== */
/* 7. Invalid values never reach the wire                                */
/* ===================================================================== */

console.log('\n[invalid] levels, scenes and EQ values are refused before transmission');

const BAD_LEVELS = [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  const sub = M.ANC_SUB_FEATURES[profile.ancLayout];
  if (!sub.level) continue;
  check(
    `${profile.sku}: invalid ANC levels are refused (${BAD_LEVELS.slice(0, 4).join(', ')}…)`,
    BAD_LEVELS.every((level) => M.buildAnc(profile.ancLayout, { ...BASE, level }) === null),
  );
}
for (const profile of M.DEVICES.filter((p) => p.ancLayout !== 'none')) {
  check(
    `${profile.sku}: an unknown scene is refused`,
    M.buildAnc(profile.ancLayout, { ...BASE, scene: 'bogus' }) === null &&
      M.buildAnc(profile.ancLayout, { ...BASE, mode: 'bogus' }) === null,
  );
}

const HOSTILE_BANDS = [[], [12], Array(8).fill(Number.NaN), Array(64).fill(6), [1e9, -1e9, 0, 0, 0, 0, 0, 0]];
for (const profile of M.DEVICES.filter((p) => p.eqCommand !== null)) {
  const command = profile.eqCommand.split('-')[0];
  const shape = profile.eqCommand === '02:81' ? 20 : profile.eqCommand === '03:87' ? 124 : 32;
  check(
    `${profile.sku}: hostile band arrays keep the documented frame shape`,
    HOSTILE_BANDS.every((bands) => {
      const frame = M.buildEq(profile.eqCommand, M.presetsForProfile(profile)[0].index, bands);
      return frame.length === shape && frame[5] === Number(`0x${command.split(':')[0]}`) && frame[6] === Number(`0x${command.split(':')[1]}`);
    }),
  );
}

/* ------------------------------------------------------------------ done */

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
