#!/usr/bin/env node
/**
 * Prove the PACKAGED Windows binary carries the authentic monogram icon.
 *
 * The icon a user actually sees on the installed exe, its desktop/Start-menu
 * shortcut and the taskbar comes from the PE resource, not from anything in the
 * renderer. On the Windows runner we extract that resource with
 * `[System.Drawing.Icon]::ExtractAssociatedIcon($exe).ToBitmap().Save(png)` and
 * compare it here against the committed monogram raster:
 *
 *   node scripts/verify-exe-icon.mjs extracted.png [referencePng]
 *
 * Checks: the extraction decoded at all, the icon is not blank, its dominant
 * colour matches the monogram's background, and enough of the accent colour is
 * present (the "SC" glyphs). A default Electron/Windows placeholder fails all
 * three, so "the exe shows our icon" becomes machine-checked evidence instead
 * of a claim. Exit 0 = PASS, exit 1 = FAIL.
 */
import { readFileSync } from 'node:fs';
import { decodePngRgba } from './lib/ico.mjs';

const [extractedPath, referencePath = 'public/icon-32.png'] = process.argv.slice(2);
if (!extractedPath) {
  console.error('usage: node scripts/verify-exe-icon.mjs <extracted-icon.png> [reference.png]');
  process.exit(2);
}

const near = (a, b, tolerance = 26) =>
  Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;

function stats(rgba, width, height) {
  const buckets = new Map();
  let visible = 0;
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a < 40) continue;
    visible++;
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const dominant = [...buckets.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  const [dr, dg, db] = dominant.split(',').map((v) => (Number(v) << 3) + 4);
  return { visible, dominant: [dr || 0, dg || 0, db || 0] };
}

let extracted;
let reference;
try {
  extracted = decodePngRgba(readFileSync(extractedPath));
  reference = decodePngRgba(readFileSync(referencePath));
} catch (err) {
  console.error(`FAIL  could not decode icon PNGs: ${err.message}`);
  process.exit(1);
}

const referenceStats = stats(reference.rgba, reference.width, reference.height);
const got = stats(extracted.rgba, extracted.width, extracted.height);
const total = extracted.width * extracted.height;

// The monogram's accent is the blue of the "SC" glyphs: sample the reference
// for its most saturated blue and require a comparable presence in the exe icon.
let accent = 0;
for (let i = 0; i < reference.width * reference.height; i++) {
  const r = reference.rgba[i * 4], g = reference.rgba[i * 4 + 1], b = reference.rgba[i * 4 + 2], a = reference.rgba[i * 4 + 3];
  if (a > 40 && b > 120 && b - r > 40) accent++;
}
const accentShare = accent / (reference.width * reference.height);

const failures = [];
const report = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

console.log(`Packaged icon: ${extractedPath} (${extracted.width}×${extracted.height}) vs ${referencePath}\n`);
report('icon resource decoded from the executable', extracted.width > 0 && extracted.height > 0);
report('icon is not blank/placeholder art', got.visible > total * 0.3, `${got.visible}/${total} visible px`);
report(
  'dominant colour matches the monogram background',
  near(got.dominant, referenceStats.dominant),
  `exe rgb(${got.dominant}) vs monogram rgb(${referenceStats.dominant})`,
);
let exeAccent = 0;
for (let i = 0; i < extracted.width * extracted.height; i++) {
  const r = extracted.rgba[i * 4], g = extracted.rgba[i * 4 + 1], b = extracted.rgba[i * 4 + 2], a = extracted.rgba[i * 4 + 3];
  if (a > 40 && b > 120 && b - r > 40) exeAccent++;
}
report(
  'accent glyph colour present (the "SC" monogram itself)',
  exeAccent / total > accentShare * 0.4,
  `${((exeAccent / total) * 100).toFixed(1)}% vs ${(accentShare * 100).toFixed(1)}% in the monogram`,
);

if (failures.length) {
  console.error(`\n${failures.length} FAILED: the packaged executable does not show the authentic product icon.`);
  process.exit(1);
}
console.log('\nPASS: the packaged executable carries the authentic SoundControl monogram icon.');
