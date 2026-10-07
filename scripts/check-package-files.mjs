#!/usr/bin/env node
/**
 * Packaging guard (runs as the last step of `npm run build`, and therefore of
 * the Windows release build).
 *
 * The Windows installer must contain exactly what the app needs at runtime:
 * the bundled renderer, the three main-process files, the Python bridge, the
 * shipped assets and the bundled Python runtime — nothing else. `package.json`
 * declares that as an electron-builder `files` whitelist with negations.
 *
 * This guard evaluates the same whitelist against the real tree (after
 * `vite build`, so `dist/` exists) and fails when a pattern stops doing what
 * it says. It exists because a negation that looks right can silently miss:
 * `!public/*.webp` excluded the *source* path while the same assets were
 * packaged from the copied `dist/` path, so three unused legacy rasters
 * shipped despite the documented exclusion.
 *
 * No dev-only or unreferenced payload may be packaged:
 *   - source maps and legacy .webp rasters (excluded by `!**\/*.map` /
 *     `!**\/*.webp`, preserved here as the check),
 *   - the test suite, the device emulator and developer scripts,
 *   - node_modules, logs, environment files or anything secret-shaped.
 *
 * Run: node scripts/check-package-files.mjs   (wired into `npm run build`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const patterns = pkg.build?.files ?? [];

/**
 * Paths are compared in POSIX form on every platform: `path.join()` yields
 * backslashes on Windows, which silently broke every pattern comparison there
 * (`dist/**\/*` did not match `dist\\index.html`).
 */
const norm = (p) => p.replace(/\\/g, '/');

/** Minimal evaluator for the whitelist shapes actually used here. */
const matches = (pattern, rel) => {
  rel = norm(rel);
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  let hit;
  if (body.endsWith('/**/*') || body.endsWith('/**')) {
    const base = body.replace(/\/\*\*(\/\*)?$/, '');
    hit = rel.startsWith(`${base}/`);
  } else if (body.startsWith('**/')) {
    // '**/*.map' matches any path ending in '.map' — strip the glob star.
    hit = rel.endsWith(body.slice(3).replace(/^\*/, ''));
  } else if (body.includes('*.')) {
    const [dir, ext] = body.split('*.');
    hit = (dir === '' ? !rel.includes('/') : rel.startsWith(dir)) && rel.endsWith(`.${ext}`);
  } else {
    hit = rel === body;
  }
  return { hit, negated };
};

const packaged = (rel) => {
  let included = false;
  for (const p of patterns) {
    const { hit, negated } = matches(p, rel);
    if (!hit) continue;
    included = !negated;
  }
  return included;
};

// Payload that must never reach a user's machine, even when a whitelist
// pattern happens to cover it.
const FORBIDDEN = [
  { re: /\.map$/, why: 'source map' },
  { re: /\.webp$/, why: 'legacy webp raster' },
  { re: /\.log$/, why: 'log file' },
  { re: /^scripts\//, why: 'developer/test script' },
  { re: /(^|\/)node_modules\//, why: 'node_modules' },
  { re: /(^|\/)\.(git|github)\//, why: 'source-control metadata' },
  { re: /(emulated_bridge|test_ui_|test_bridge|test_startup|test_main_lifecycle)/, why: 'test/emulator payload' },
  { re: /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$/, why: 'credential material' },
];

const forbiddenHit = (rel) => FORBIDDEN.find(({ re }) => re.test(norm(rel)));

/** The verdict that matters: the whitelist includes it and nothing forbids it. */
const wouldShip = (rel) => packaged(rel) && !forbiddenHit(rel);

const walk = (rel, out) => {
  rel = norm(rel);
  const abs = join(ROOT, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return out;
  }
  if (st.isFile()) {
    out.push(rel);
    return out;
  }
  for (const entry of readdirSync(abs)) walk(`${rel}/${entry}`, out);
  return out;
};

// Every candidate file the whitelist could reach, plus package.json, which
// electron-builder always packs and which no pattern needs to list.
const candidates = new Set(['package.json']);
for (const p of patterns) {
  if (p.startsWith('!')) continue;
  const base = p.replace(/\/\*\*(\/\*)?$/, '').replace(/\/\*\.\w+$/, '');
  for (const f of walk(base, [])) candidates.add(f);
}

// package.json ships implicitly — electron-builder always packs the manifest.
const packagedFiles = [...candidates].filter((f) => f === 'package.json' || packaged(f));
// The violation scan is about payload, not the manifest itself.
const checkedFiles = packagedFiles.filter((f) => f !== 'package.json');

const violations = [];
for (const file of checkedFiles) {
  const hit = forbiddenHit(file);
  if (hit) violations.push(`${file} (${hit.why})`);
}

if (process.argv.includes('--self-test')) {
  // Regression coverage for the Windows path bug: these inputs use backslashes,
  // exactly what path.join() produced on the runner that broke the build.
  const cases = [
    ['dist\\index.html', true, 'rendered entry point is packaged'],
    ['dist\\assets\\index-abc.js', true, 'built bundle is packaged'],
    ['dist\\assets\\index-abc.js.map', false, 'source map is not packaged'],
    ['dist\\device-earbuds.webp', false, 'legacy raster in dist is not packaged'],
    ['public\\device-earbuds.webp', false, 'legacy raster in public is not packaged'],
    ['electron-main.cjs', true, 'main process file is packaged'],
    ['soundcore_bridge.py', true, 'bridge is packaged'],
    ['scripts\\check-package-files.mjs', false, 'build tooling is not packaged'],
    ['scripts\\test_ui_state.mjs', false, 'tests are not packaged'],
    ['node_modules\\foo\\index.js', false, 'node_modules is not packaged'],
    ['dist\\emulated_bridge.py', false, 'emulator is not packaged'],
  ];
  let failed = 0;
  for (const [file, expected, why] of cases) {
    const actual = wouldShip(file);
    if (actual !== expected) {
      console.error(`self-test FAIL: ${file} -> ${actual}, expected ${expected} (${why})`);
      failed += 1;
    }
  }
  if (failed) process.exit(1);
  console.log(`Packaging guard self-test passed: ${cases.length}/${cases.length} cases (Windows-style paths included).`);
  process.exit(0);
}

const required = ['package.json', 'electron-main.cjs', 'preload.cjs', 'autostart.cjs', 'soundcore_bridge.py', 'dist/index.html'];
const missing = required.filter((f) => !packagedFiles.includes(f));

if (violations.length || missing.length) {
  if (violations.length) {
    console.error('Packaging violations — these would ship in the Windows installer:');
    for (const v of violations) console.error(`  - ${v}`);
  }
  if (missing.length) console.error(`Packaging whitelist misses required runtime files: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(
  `Packaging whitelist clean: ${packagedFiles.length} app files, no maps / legacy rasters / tests / emulator / secrets, ` +
    `required runtime files present (${required.length}).`,
);
