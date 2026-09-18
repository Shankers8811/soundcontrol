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

/** Minimal evaluator for the whitelist shapes actually used here. */
const matches = (pattern, rel) => {
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

const walk = (rel, out) => {
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
  for (const entry of readdirSync(abs)) walk(join(rel, entry), out);
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

const forbidden = [
  { re: /\.map$/, why: 'source map' },
  { re: /\.webp$/, why: 'legacy webp raster' },
  { re: /\.log$/, why: 'log file' },
  { re: /^scripts\//, why: 'developer/test script' },
  { re: /(^|\/)node_modules\//, why: 'node_modules' },
  { re: /(^|\/)\.(git|github)\//, why: 'source-control metadata' },
  { re: /(emulated_bridge|test_ui_|test_bridge|test_startup|test_main_lifecycle)/, why: 'test/emulator payload' },
  { re: /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$/, why: 'credential material' },
];
const violations = [];
for (const file of checkedFiles) {
  for (const { re, why } of forbidden) {
    if (re.test(file)) violations.push(`${file} (${why})`);
  }
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
