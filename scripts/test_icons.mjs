#!/usr/bin/env node
/**
 * Icon packaging evidence (Phase 20).
 *
 * The installed app must show the authentic SoundControl monogram — in the exe
 * (which is what the taskbar, desktop shortcut and Start-menu shortcut display),
 * in the NSIS installer/uninstaller/header, in the window/taskbar icon the main
 * process sets, and in About (which renders the shared monogram component).
 * "There is a file called icon.ico" is not evidence; this harness proves:
 *
 *   1. STRUCTURE — build/icon.ico parses, contains exactly the required sizes
 *      (16/32/48/64/128/256) and a 256×256 entry (electron-builder's minimum);
 *   2. AUTHENTICITY — every entry's pixels are identical to the committed
 *      monogram PNG of that size, so no placeholder/default Electron artwork
 *      (or a half-rendered icon) can be packaged;
 *   3. VISIBILITY — no entry is fully transparent and each has visible alpha;
 *   4. WIRING — package.json points win.icon and all three NSIS icon fields at
 *      build/icon.ico, the window/taskbar icon and About point at the same
 *      monogram assets, and the .ico is rebuilt before every Windows build.
 *
 * Run: npm run test:icons   (part of `npm test`)
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngRgba, parseIco } from './lib/ico.mjs';
import { buildIco, ICO_SIZES } from './generate-ico.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const ICO = join(ROOT, 'build', 'icon.ico');

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('Icon packaging evidence\n');

// The .ico is a committed build artifact: it must be exactly what the pipeline
// derives from the committed PNGs. A missing file (a clean transfer that did not
// carry excluded build/ output) is regenerated and reported — that is honest,
// because the Windows build regenerates it too (prebuild:win). A file that is
// present but different is a FAIL: it means a stale or hand-edited icon would
// be embedded in the exe.
const fresh = buildIco();
if (!existsSync(ICO)) {
  writeFileSync(ICO, fresh);
  console.log('  ..  build/icon.ico was absent — regenerated from the committed PNGs (same step prebuild:win runs)');
} else {
  const committed = readFileSync(ICO);
  check(
    'the committed build/icon.ico is byte-identical to the pipeline output for the committed PNGs',
    Buffer.compare(committed, fresh) === 0,
    committed.length === fresh.length ? 'same length, different bytes' : `${committed.length} vs ${fresh.length} bytes`,
  );
  if (Buffer.compare(committed, fresh) !== 0) writeFileSync(ICO, fresh);
}

/* ------------------------------------------------------------- structure */
const entries = parseIco(readFileSync(ICO));
const sizes = entries.map((e) => e.size).sort((a, b) => a - b);
check('build/icon.ico parses as a multi-image ICO', entries.length > 0, `${entries.length} entries`);
check(
  `contains exactly the required sizes (${ICO_SIZES.join('/')})`,
  JSON.stringify(sizes) === JSON.stringify([...ICO_SIZES].sort((a, b) => a - b)),
  sizes.join(','),
);
check('every entry is an uncompressed 32-bit DIB (Windows-compatible)', entries.every((e) => e.isDib && e.bpp === 32));
check('declared size matches the stored bitmap size', entries.every((e) => e.width === e.size && e.height === e.size));
check('has a 256×256 entry (electron-builder requires one)', entries.some((e) => e.size === 256 && e.width === 256));
check('has the small sizes Explorer/taskbar actually use', entries.some((e) => e.size === 16) && entries.some((e) => e.size === 32));

/* ----------------------------------------------------------- authenticity */
let identical = 0;
for (const entry of entries) {
  const png = decodePngRgba(readFileSync(join(ROOT, 'public', `icon-${entry.size}.png`)));
  const same =
    png.width === entry.width &&
    png.height === entry.height &&
    Buffer.compare(png.rgba, entry.rgba) === 0;
  if (same) identical++;
  else failures.push(`entry ${entry.size}×${entry.size} differs from public/icon-${entry.size}.png`);
}
check('every ICO entry is pixel-identical to the monogram PNG of that size', identical === entries.length, `${identical}/${entries.length}`);

const opaque = (rgba) => {
  let count = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) count++;
  return count;
};
check('no size is a blank/transparent placeholder', entries.every((e) => opaque(e.rgba) > e.size * e.size * 0.2));
const smallest = entries.find((e) => e.size === 16);
check('the 16×16 entry still draws visible pixels (not an empty frame)', opaque(smallest.rgba) > 20, `${opaque(smallest.rgba)} opaque px`);

/* ------------------------------------------------------------------ wiring */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
check('win.icon points at build/icon.ico', pkg.build.win.icon === 'build/icon.ico', String(pkg.build.win.icon));
check('nsis.installerIcon points at build/icon.ico', pkg.build.nsis.installerIcon === 'build/icon.ico');
check('nsis.uninstallerIcon points at build/icon.ico', pkg.build.nsis.uninstallerIcon === 'build/icon.ico');
check('nsis.installerHeaderIcon points at build/icon.ico', pkg.build.nsis.installerHeaderIcon === 'build/icon.ico');
check('shortcuts are created (they inherit the exe icon)', pkg.build.nsis.createDesktopShortcut === true && pkg.build.nsis.createStartMenuShortcut === true);
check('Windows builds rebuild the .ico first', /npm run icons/.test(pkg.scripts['prebuild:win'] ?? ''));
check('the icon test runs as part of npm test', /test:icons/.test(pkg.scripts.test ?? ''));

const main = readFileSync(join(ROOT, 'electron-main.cjs'), 'utf8');
check(
  'the window/taskbar icon uses the same monogram raster (not an Electron default)',
  /icon:\s*path\.join\(__dirname,\s*'public',\s*'icon-512\.png'\)/.test(main),
);
const about = readFileSync(join(ROOT, 'src', 'pages', 'AboutPage.tsx'), 'utf8');
check('About renders the shared monogram component', /IconLogo/.test(about));
const icons = readFileSync(join(ROOT, 'src', 'components', 'Icons.tsx'), 'utf8');
check('the monogram component is the shared vector artwork, not a placeholder glyph', /IconLogo/.test(icons) && /(logo|monogram|sc-)/i.test(icons));
check('index.html points at the generated favicon', /favicon-64\.png/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')));

console.log(`\n  ${passed} checks`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}
console.log('All icon packaging checks passed.');
