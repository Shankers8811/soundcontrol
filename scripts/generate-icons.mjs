#!/usr/bin/env node
/**
 * Render every shipped icon raster from the single vector source
 * assets/icon/sc-monogram.svg — so all sizes stay pixel-consistent.
 *
 *   node scripts/generate-icons.mjs
 *
 * Requires @resvg/resvg-js at generation time only (native SVG renderer,
 * exact gradients/strokes; ImageMagick's converter blurs small sizes):
 *
 *   npm i --no-save @resvg/resvg-js
 *
 * It is intentionally NOT a package.json dependency: the generated PNGs are
 * committed (like the previous icon assets), so CI, packaging and installs
 * never need the rasterizer. Outputs (all under public/):
 *
 *   icon-512/256/128/64/48/32/16.png  — app, exe, installer, taskbar,
 *                                       shortcut, tray source, favicon
 *   favicon-64.png                    — browser tab icon (index.html)
 *   build/icon.ico                    — Windows exe / shortcut / taskbar /
 *                                       NSIS installer icon, built from the
 *                                       PNGs above by scripts/generate-ico.mjs
 *                                       (no extra dependency)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SOURCE = join(ROOT, 'assets', 'icon', 'sc-monogram.svg');

const SIZES = [512, 256, 128, 64, 48, 32, 16];

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error(
    'generate-icons: @resvg/resvg-js is not installed.\n' +
      'Run `npm i --no-save @resvg/resvg-js` once, then re-run this script.\n' +
      '(Generation-time tool only — the committed PNGs are the shipped assets.)',
  );
  process.exit(1);
}

const svg = readFileSync(SOURCE, 'utf8');

for (const size of SIZES) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    // Keep alpha so Windows can mask rounded corners cleanly.
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  const file = join(ROOT, 'public', `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`  wrote public/icon-${size}.png (${png.length} bytes)`);
}

// The tab favicon is the 64px render under its historical name (index.html
// and electron packaging reference it); identical bytes, no duplicate source.
const favicon = readFileSync(join(ROOT, 'public', 'icon-64.png'));
writeFileSync(join(ROOT, 'public', 'favicon-64.png'), favicon);
console.log('  wrote public/favicon-64.png (copy of icon-64.png)');

// Windows needs a real multi-size .ico for the exe, shortcuts, taskbar and the
// NSIS installer; build it from the PNGs just rendered. `npm run icons` does
// only this step, so CI can rebuild the .ico without the SVG rasterizer.
const { buildIco, ICO_SIZES } = await import('./generate-ico.mjs');
const { writeFileSync, mkdirSync } = await import('node:fs');
const { join } = await import('node:path');
mkdirSync(join(ROOT, 'build'), { recursive: true });
const ico = buildIco();
writeFileSync(join(ROOT, 'build', 'icon.ico'), ico);
console.log(`  wrote build/icon.ico (${ICO_SIZES.join(', ')} — ${ico.length} bytes)`);
console.log('done — commit the PNGs and build/icon.ico; no runtime dependency added.');
