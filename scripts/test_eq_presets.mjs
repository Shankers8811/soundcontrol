#!/usr/bin/env node
/**
 * Named custom-EQ preset library — pure-logic tests.
 *
 * Covers `src/lib/eqPresets.ts`, which backs parity build-order item 1
 * ("Save multiple named custom EQ presets"). Everything here is deterministic:
 * no browser, no Bluetooth, no device. The store is the only production writer,
 * and it calls exactly these functions.
 *
 * Covered:
 *   1. band normalization (clamp, quantize, reject non-numbers)
 *   2. name normalization and case-insensitive de-duplication
 *   3. add / rename / retune / delete transitions
 *   4. the library cap failing closed instead of evicting user work
 *   5. tolerant storage parsing (garbage, duplicate ids, corrupt bands)
 *   6. per-model filtering and the "foreign preset" flag
 *
 * Run: npm run test:eqpresets   (also part of `npm test`)
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

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-eqpresets-'));
const bundlePath = join(dir, 'eqpresets.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/lib/eqPresets.ts';
        export * from './src/types.ts';
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

const EIGHT = [0, 0, 0, 0, 0, 0, 0, 0];
const CURVE = [3, 2.5, 1, 0, -1, -2.5, -3, 0];

/* ------------------------------------------------- 1. band normalization */
console.log('\nnormalization');
check('clamps above the maximum', M.normalizeBand(9) === 6);
check('clamps below the minimum', M.normalizeBand(-9) === -6);
check('quantizes to the half-dB grid', M.normalizeBand(0.3) === 0.5, String(M.normalizeBand(0.3)));
check('quantizes 1.24 down to 1', M.normalizeBand(1.24) === 1);
check('keeps exact values intact', M.normalizeBand(-2.5) === -2.5);
check('rejects NaN', M.normalizeBand(Number.NaN) === null);
check('rejects a numeric string', M.normalizeBand('1') === null);
check('rejects Infinity', M.normalizeBand(Number.POSITIVE_INFINITY) === null);
check('accepts a full 8-band array', Array.isArray(M.normalizeBands(CURVE)) && M.normalizeBands(CURVE).length === 8);
check('rejects a 7-band array', M.normalizeBands(CURVE.slice(0, 7)) === null);
check('rejects a non-array', M.normalizeBands('0,0,0') === null);
check('band count matches EQ_HZ', M.EQ_BAND_COUNT === M.EQ_HZ.length);

/* ------------------------------------------------------- 2. name handling */
console.log('\nnames');
check('trims surrounding whitespace', M.normalizeName('  Bass  ') === 'Bass');
check('collapses inner whitespace', M.normalizeName('My   deep\u00a0bass') === 'My deep bass');
check('caps the length', M.normalizeName('x'.repeat(80)).length === M.MAX_PRESET_NAME_LENGTH);
check('empty becomes Untitled preset', M.normalizeName('   ') === 'Untitled preset');
check('non-string becomes Untitled preset', M.normalizeName(42) === 'Untitled preset');
check('appends 2 on collision', M.uniqueName('Bass', ['Bass']) === 'Bass 2');
check('appends 3 when 2 is taken', M.uniqueName('Bass', ['Bass', 'Bass 2']) === 'Bass 3');
check('collision is case-insensitive', M.uniqueName('bass', ['BASS']) === 'bass 2');
check('no collision leaves the name alone', M.uniqueName('Bass', ['Rock']) === 'Bass');
check('suffix respects the length cap', M.uniqueName('y'.repeat(60), ['y'.repeat(60)]).length <= M.MAX_PRESET_NAME_LENGTH);

/* -------------------------------------------------- 3. add / edit / delete */
console.log('\nlibrary transitions');
const a1 = M.addPreset([], { name: '  Deep  ', bands: CURVE, modelId: 'A3949', now: 1000 });
check('add succeeds', a1.ok === true);
check('name is normalized on save', a1.ok && a1.preset.name === 'Deep');
check('bands are normalized on save', a1.ok && a1.preset.bands.every((b) => b >= -6 && b <= 6));
check('model id is recorded', a1.ok && a1.preset.modelId === 'A3949');
check('timestamps are set', a1.ok && a1.preset.createdAt === 1000 && a1.preset.updatedAt === 1000);
check('ids are unique across saves', a1.ok && M.addPreset(a1.presets, { name: 'Two', bands: EIGHT, now: 1001 }).preset.id !== a1.preset.id);

const a2 = a1.ok ? M.addPreset(a1.presets, { name: 'deep', bands: EIGHT, modelId: 'A3949', now: 1001 }) : null;
check('duplicate name is de-duplicated on add', a2?.ok === true && a2.preset.name === 'deep 2');

check('add rejects a short band array', M.addPreset([], { name: 'x', bands: [0, 1] }).ok === false);
check('add rejects a non-numeric band', M.addPreset([], { name: 'x', bands: [0, 0, 0, 0, 0, 0, 0, 'a'] }).ok === false);

let full = [];
for (let i = 0; i < M.MAX_STORED_PRESETS; i++) {
  const r = M.addPreset(full, { name: `p${i}`, bands: EIGHT, now: i });
  full = r.ok ? r.presets : full;
}
check(`library holds exactly ${M.MAX_STORED_PRESETS}`, full.length === M.MAX_STORED_PRESETS);
const overflow = M.addPreset(full, { name: 'one too many', bands: EIGHT });
check('cap fails closed', overflow.ok === false && /full/i.test(overflow.error ?? ''));
check('cap never evicts an existing entry', overflow.ok === false);

const base = a2?.ok ? a2.presets : a1.ok ? a1.presets : [];
const target = base[0];
const renamed = M.renamePreset(base, target.id, 'Stage', 2000);
check('rename succeeds', renamed.ok === true);
check('rename updates the name', renamed.ok && renamed.preset.name === 'Stage');
check('rename bumps updatedAt', renamed.ok && renamed.preset.updatedAt === 2000);
check('rename keeps the id', renamed.ok && renamed.preset.id === target.id);
check('rename keeps the bands', renamed.ok && JSON.stringify(renamed.preset.bands) === JSON.stringify(target.bands));
check('rename of an unknown id fails', M.renamePreset(base, 'nope', 'x').ok === false);
const collision = M.renamePreset(base, target.id, base[1]?.name ?? 'x');
check('rename onto an existing name is de-duplicated', collision.ok === true && collision.preset.name !== base[1]?.name);

const retuned = M.updatePresetBands(base, target.id, [1, 1, 1, 1, 1, 1, 1, 1], 3000);
check('retune replaces the curve', retuned.ok === true && retuned.preset.bands.every((b) => b === 1));
check('retune keeps the name', retuned.ok && retuned.preset.name === target.name);
check('retune bumps updatedAt', retuned.ok && retuned.preset.updatedAt === 3000);
check('retune rejects bad bands', M.updatePresetBands(base, target.id, [1, 2, 3]).ok === false);
check('retune of an unknown id fails', M.updatePresetBands(base, 'nope', EIGHT).ok === false);

const deleted = M.deletePreset(base, target.id);
check('delete removes exactly one entry', deleted.length === base.length - 1);
check('delete removes the right entry', !deleted.some((p) => p.id === target.id));
check('delete of an unknown id is a no-op', M.deletePreset(base, 'nope').length === base.length);

/* ------------------------------------------------------ 5. storage parsing */
console.log('\nstorage parsing');
check('null parses to an empty list', M.parseStoredPresets(null).length === 0);
check('garbage parses to an empty list', M.parseStoredPresets('{not json').length === 0);
check('a non-array parses to an empty list', M.parseStoredPresets('{"a":1}').length === 0);
check('a wrong-shape entry is dropped', M.sanitizePresetList([{ id: 'a', name: 'x', bands: [1, 2] }]).length === 0);
check('a valid entry survives', M.sanitizePresetList([{ id: 'a', name: 'x', bands: EIGHT }]).length === 1);
check('a missing name is repaired to Untitled preset', M.sanitizePresetList([{ id: 'a', bands: EIGHT }])[0]?.name === 'Untitled preset');
const dup = M.sanitizePresetList([
  { id: 'same', name: 'first', bands: EIGHT },
  { id: 'same', name: 'second', bands: EIGHT },
]);
check('duplicate ids keep the first occurrence', dup.length === 1 && dup[0].name === 'first');
check('missing modelId becomes null', M.sanitizePresetList([{ id: 'a', bands: EIGHT }])[0]?.modelId === null);
check('out-of-range bands are clamped on load', M.sanitizePresetList([{ id: 'a', bands: [99, 99, 99, 99, 99, 99, 99, 99] }])[0].bands.every((b) => b === 6));
check('the cap applies to loaded lists too', M.sanitizePresetList(Array.from({ length: 200 }, (_, i) => ({ id: `i${i}`, bands: EIGHT }))).length === M.MAX_STORED_PRESETS);

const roundTrip = M.parseStoredPresets(M.serializePresets(base));
check('serialize/parse round-trips the count', roundTrip.length === base.length);
check('serialize/parse round-trips the bands', JSON.stringify(roundTrip[0]?.bands) === JSON.stringify(base[0]?.bands));
check('serialize/parse round-trips the names', roundTrip[0]?.name === base[0]?.name);

/* ----------------------------------------------------- 6. model filtering */
console.log('\nmodel scoping');
const mixed = [
  { id: 'x1', name: 'R50i curve', bands: EIGHT, modelId: 'A3949', createdAt: 1, updatedAt: 1 },
  { id: 'x2', name: 'Q30 curve', bands: EIGHT, modelId: 'A3035', createdAt: 2, updatedAt: 2 },
  { id: 'x3', name: 'Generic', bands: EIGHT, modelId: null, createdAt: 3, updatedAt: 3 },
];
check('exact model + generic are offered', M.presetsForModel(mixed, 'A3949').map((p) => p.id).join(',') === 'x1,x3');
check('another model is excluded', !M.presetsForModel(mixed, 'A3949').some((p) => p.id === 'x2'));
check('unknown model offers everything', M.presetsForModel(mixed, null).length === 3);
check('foreign flag is true for another model', M.isForeignPreset(mixed[1], 'A3949') === true);
check('foreign flag is false for the same model', M.isForeignPreset(mixed[0], 'A3949') === false);
check('foreign flag is false for a generic preset', M.isForeignPreset(mixed[2], 'A3949') === false);
check('foreign flag is false when no model is known', M.isForeignPreset(mixed[1], null) === false);

check('sort is newest-first', M.sortPresets(mixed).map((p) => p.id).join(',') === 'x3,x2,x1');

/* --------------------------------------------------------------- summary */
rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
