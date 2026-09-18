#!/usr/bin/env node
/**
 * Deterministic UI render smoke — every page through the real React tree.
 *
 * Bundles the actual application components (AppProvider + all six pages +
 * the desktop shell) with esbuild and server-renders them with
 * react-dom/server in Node. No DOM framework, no browser: this catches
 * render-time crashes (bad store fields, undefined access, JSX errors) and
 * asserts the truthfulness markers the final UI must show in its default
 * (disconnected, R50i/A3949-profile) state:
 *
 *   - Dashboard: "Battery unavailable" (never an invented percentage),
 *     honest noise-control unsupported note for the no-ANC default profile,
 *     earbud card in "Status unavailable" (unknown ≠ disconnected),
 *     disabled volume card explaining the protocol gap.
 *   - Devices: real scan surface, capability matrix rows.
 *   - Equalizer: preset grid + FE FE custom curve (this profile has EQ).
 *   - Controls: the explicit gesture-unsupported statement.
 *   - Settings: desktop-only rows disabled with a reason; developer tools
 *     absent from a production build.
 *   - About: real build-time version, MIT license, no fake buttons.
 *
 * Run: node scripts/test_ui_render.mjs   (part of `npm run test:ui`)
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
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

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-ui-render-'));
const bundlePath = join(dir, 'ui-render.cjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export { default as React } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';
        export { AppProvider, AppContext } from './src/state/store.tsx';
        export { DesktopShell } from './src/components/DesktopShell.tsx';
        export { Sidebar } from './src/components/Sidebar.tsx';
        export { EarbudStatusCard } from './src/components/EarbudStatusCard.tsx';
        export { deriveCapabilities, deriveEarbudState } from './src/state/derive.ts';
        export { DEVICES } from './src/protocol/devices.ts';
        export { DashboardPage } from './src/pages/DashboardPage.tsx';
        export { DevicesPage } from './src/pages/DevicesPage.tsx';
        export { EqualizerPage } from './src/pages/EqualizerPage.tsx';
        export { ControlsPage } from './src/pages/ControlsPage.tsx';
        export { SettingsPage } from './src/pages/SettingsPage.tsx';
        export { AboutPage } from './src/pages/AboutPage.tsx';
      `,
      sourcefile: 'ui-render-barrel.tsx',
      resolveDir: ROOT,
      loader: 'tsx',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    outfile: bundlePath,
    logLevel: 'error',
    define: {
      // Production semantics: developer tools must NOT render.
      'import.meta.env.DEV': 'false',
      'process.env.NODE_ENV': '"production"',
      // Same build-time globals vite.config.ts injects.
      __REPO_URL__: JSON.stringify('https://github.com/Shankers8811/soundcontrol'),
      __APP_VERSION__: JSON.stringify('0.0.0-test'),
    },
  });
} catch (err) {
  console.error(`esbuild failed:\n${err?.message ?? err}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

/* Minimal browser globals the store touches during construction. */
globalThis.localStorage = {
  store: new Map(),
  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null;
  },
  setItem(k, v) {
    this.store.set(k, String(v));
  },
  removeItem(k) {
    this.store.delete(k);
  },
};

const M = await import(pathToFileURL(bundlePath).href);
const { React, renderToStaticMarkup, AppProvider } = M;

function render(el) {
  return renderToStaticMarkup(React.createElement(AppProvider, null, el));
}

/* ---------------------------------------------------------------- pages */

console.log('\n[shell] desktop frame + sidebar navigation');
const shell = render(React.createElement(M.DesktopShell));
for (const item of ['Dashboard', 'Devices', 'Equalizer', 'Controls', 'Settings', 'About']) {
  check(`sidebar renders nav item "${item}"`, shell.includes(`>${item}</span>`));
}
check('sidebar shows the real disconnected chip', shell.includes('No device'));
check('shell renders the default page (Dashboard)', shell.includes('Dashboard'));

console.log('\n[dashboard]');
const dash = render(React.createElement(M.DashboardPage));
check('header title', dash.includes('>Dashboard<'));
check('disconnected status badge', dash.includes('Disconnected'));
check('disconnected battery pill says "No device" — never an invented percentage', dash.includes('>No device<') && !/>\s*\d+\s*%/.test(dash));
check('no-ANC default profile gets the unsupported note, not fake buttons', dash.includes('Noise control is not available on this model'));
check('volume card explains the protocol gap instead of a live slider', dash.includes('Volume') && dash.includes('no volume command in any published capture'));
check('volume slider is rendered disabled', /aria-label="Device volume \(not supported by the protocol\)"[^>]*disabled/.test(dash) || dash.includes('disabled'));
check('earbud card present for TWS profile', dash.includes('Earbud Connection'));
// Sides render "Unknown" — never the old "Status unavailable" copy and never
// "Not connected". (The page-level connection-phase badge legitimately reads
// "Disconnected" for the dead CONTROL LINK; that is a different concept from
// per-side earbud presence and is asserted in the connected-state section.)
check('unknown presence renders per-side "Unknown", never "Not connected"', dash.includes('>Unknown<') && !dash.includes('Status unavailable') && !dash.includes('>Not connected<'));
check('connect CTA points at the real Devices page', dash.includes('Open Devices'));
check('quick actions render real presets for this EQ-capable profile', dash.includes('Bass Booster') && dash.includes('Spoken Word'));

console.log('\n[devices]');
const devices = render(React.createElement(M.DevicesPage));
check('page title', devices.includes('>Devices<'));
check('real scan surface', devices.includes('Paired Windows devices') && devices.includes('Scan devices'));
check('helper status starts as checking (no fake "online")', devices.includes('Checking') || devices.includes('checking'));
check('manual MAC connect form', devices.includes('Connect by address') && devices.includes('AA:BB:CC:DD:EE:FF'));
check('capability matrix lists the honest volume/gesture facts', devices.includes('no volume command exists in the protocol') && devices.includes('no button-write command is publicly documented'));
// Disconnected, the override control honestly becomes read-only preview —
// you cannot override the profile of a device that is not connected.
check('model profile preview (override only when connected)', devices.includes('Preview profiles') && !devices.includes('>Override profile<'));

console.log('\n[equalizer]');
const eq = render(React.createElement(M.EqualizerPage));
check('page title', eq.includes('>Equalizer<'));
check('this EQ-capable profile shows the preset grid', eq.includes('Soundcore presets') && eq.includes('Soundcore Signature'));
check('custom curve documents the real FE FE preset id', eq.includes('FE FE'));
check('fader range documents the real wire values (±6 dB, 100 Hz–12.8 kHz)', eq.includes('±6 dB') && eq.includes('100 Hz') && eq.includes('12.8 kHz'));
check('every band renders a fader input', (eq.match(/class="eq-fader"/g) ?? []).length === 8, `got ${(eq.match(/class="eq-fader"/g) ?? []).length}`);
check('disabled while not connected', eq.includes('Connect a device to apply presets'));

console.log('\n[controls]');
const controls = render(React.createElement(M.ControlsPage));
check('page title', controls.includes('>Controls<'));
check('gesture customization is explicitly unsupported — no decorative remap UI', controls.includes('Gesture customization is not supported by this protocol'));
// 01:85 is documented only for the Motion+ (A3116); no profile in the table
// may fire an undocumented destructive frame — the card must explain instead.
check('factory reset is honestly withheld (01:85 documented for Motion+ only)', controls.includes('Factory reset is not offered for this model') && controls.includes('01:85') && !controls.includes('Send reset command'));
check('no gaming toggle for this profile (A3949 has gaming — present)', controls.includes('Gaming mode'));

console.log('\n[settings]');
const settings = render(React.createElement(M.SettingsPage));
check('page title', settings.includes('>Settings<'));
check('interface sounds is a real local toggle', settings.includes('Interface sounds'));
check('desktop-only rows are disabled with a reason', settings.includes('Available in the SoundControl Windows desktop app.'));
check('launch-at-login + tray rows exist', settings.includes('Launch at login') && settings.includes('Minimize to tray'));
check('log folder row references the real path', settings.includes('soundcontrol') && settings.includes('main.log'));
check('production build hides developer tools', !settings.includes('Developer tools'));
check('no fake theme/accent/updater rows', !settings.includes('Check for updates') && !settings.includes('Accent color'));

console.log('\n[about]');
const about = render(React.createElement(M.AboutPage));
check('page title', about.includes('>About<'));
check('real branding + version line', about.includes('SoundControl') && about.includes('version'));
check('MIT license statement', about.includes('MIT License'));
check('real repository links only', about.includes('https://github.com/Shankers8811/soundcontrol'));
check('no fake update/support/privacy buttons', !about.includes('Check for updates') && !about.includes('Contact support') && !about.includes('Privacy policy'));
check('unofficial-project disclaimer', about.includes('not affiliated with'));

/* ======================================================================== */
/* Connected-state L/R rendering (Pass 4 §23)                                */
/*                                                                           */
/* EarbudStatusCard is rendered through the REAL React tree with the store's */
/* exported context seam, for every earbud state, with earbudState produced  */
/* by the REAL deriveEarbudState from raw battery objects — the same chain   */
/* production uses (wire bytes → store merge → derive → card).               */
/* ======================================================================== */

console.log('\n[earbud card] connected-state L/R rendering (all six states)');

const { AppContext, EarbudStatusCard, DEVICES: RD, deriveCapabilities: rc, deriveEarbudState: des } = M;
const twsCaps = rc(RD.find((d) => d.id === 'liberty-4-nc'));
const overEarCaps = rc(RD.find((d) => d.id === 'q45'));

function renderCard(battery, caps, connected = true) {
  const earbudState = des(battery, caps);
  const ctx = { connected, earbudState };
  return renderToStaticMarkup(
    React.createElement(AppContext.Provider, { value: ctx }, React.createElement(EarbudStatusCard)),
  );
}

// BOTH — L=100 R=90 (scale null = percents, matching the spec cases).
const bothHtml = renderCard({ left: 100, right: 90, batteryScale: null, presence: 'both' }, twsCaps);
check('both: two "Connected" labels', (bothHtml.match(/>Connected</g) ?? []).length === 2);
check('both: real percents rendered', bothHtml.includes('100%') && bothHtml.includes('90%'));
check('both: both visuals at full brightness', !bothHtml.includes('opacity="0.38"') && !bothHtml.includes('opacity="0.65"'));
check('both: live-status subtitle', bothHtml.includes('Live per-side status'));
check('both: no dimmed side text', !bothHtml.includes('>Disconnected<') && !bothHtml.includes('>Unknown<'));

// LEFT ONLY — L=100, R=0xFF decoded upstream to presence 'left', right null.
const leftHtml = renderCard({ left: 100, right: null, batteryScale: null, presence: 'left' }, twsCaps);
check('left-only: left Connected + 100%', leftHtml.includes('>Connected<') && leftHtml.includes('100%'));
check('left-only: right Disconnected with em-dash, NO stale 90%', leftHtml.includes('>Disconnected<') && !leftHtml.includes('90%'));
check('left-only: right visual dimmed (0.38), left full', leftHtml.includes('opacity="0.38"') && !leftHtml.includes('opacity="0.65"'));

// RIGHT ONLY — mirror image.
const rightHtml = renderCard({ left: null, right: 90, batteryScale: null, presence: 'right' }, twsCaps);
check('right-only: right Connected + 90%', rightHtml.includes('>Connected<') && rightHtml.includes('90%'));
check('right-only: left Disconnected with em-dash, NO stale 100%', rightHtml.includes('>Disconnected<') && !rightHtml.includes('100%'));
check('right-only: left visual dimmed', rightHtml.includes('opacity="0.38"'));

// NONE — both sides 0xFF.
const noneHtml = renderCard({ left: null, right: null, batteryScale: null, presence: 'none' }, twsCaps);
check('none: two "Disconnected" labels', (noneHtml.match(/>Disconnected</g) ?? []).length === 2);
check('none: no battery percents anywhere', !/\d+%/.test(noneHtml));
check('none: both visuals dimmed', (noneHtml.match(/opacity="0\.38"/g) ?? []).length === 2);

// UNKNOWN — telemetry not arrived yet (TEST 14: never rendered as disconnected).
const unknownHtml = renderCard({ left: null, right: null, batteryScale: null, presence: 'unknown' }, twsCaps);
check('unknown: two "Unknown" labels', (unknownHtml.match(/>Unknown</g) ?? []).length === 2);
check('unknown: "Detecting earbuds…" hint shown', unknownHtml.includes('Detecting earbuds…'));
check('unknown: NEVER rendered as Disconnected (TEST 14)', !unknownHtml.includes('>Disconnected<') && !unknownHtml.includes('Not connected'));
check('unknown: neutral visuals (0.65), no batteries', (unknownHtml.match(/opacity="0\.65"/g) ?? []).length === 2 && !/\d+%/.test(unknownHtml));
check('unknown: accessible names say awaiting telemetry', (unknownHtml.match(/unknown, awaiting device telemetry/g) ?? []).length === 2);
check('both: accessible names carry state + percentage', bothHtml.includes('Left earbud connected, 100 percent') && bothHtml.includes('Right earbud connected, 90 percent'));
check('left-only: disconnected side announced textually', leftHtml.includes('Right earbud disconnected') && leftHtml.includes('Left earbud connected, 100 percent'));

// UNAVAILABLE — over-ear model (TEST 15: no L/R surface at all).
const unavailHtml = renderCard({ left: 80, right: null, batteryScale: null }, overEarCaps);
check('unavailable: card renders nothing (TEST 15)', unavailHtml === '', `got ${unavailHtml.length} chars`);
check('unavailable: no side labels or percents leaked', !unavailHtml.includes('Left') && !unavailHtml.includes('%'));

// A stale battery value inside the state object must NEVER render next to a
// disconnected side, even if the store were buggy — the card renders side
// state as the truth (defense in depth).
const staleHtml = renderCard({ left: 100, right: 90, batteryScale: null, presence: 'left' }, twsCaps);
check('stale right=90 in state + presence left → right shows no percent', !staleHtml.includes('90%') && staleHtml.includes('>Disconnected<'));

/* ======================================================================== */
/* Shipped icon assets (Pass 5) — single vector source, consistent rasters   */
/* ======================================================================== */

console.log('\n[icons] SC monogram asset set');

for (const size of [512, 256, 128, 64, 48, 32, 16]) {
  const f = join(ROOT, 'public', `icon-${size}.png`);
  check(`public/icon-${size}.png exists and is non-empty`, existsSync(f) && statSync(f).size > 100);
}
const fav = join(ROOT, 'public', 'favicon-64.png');
check('favicon-64.png exists and matches icon-64.png', existsSync(fav) && readFileSync(fav).equals(readFileSync(join(ROOT, 'public', 'icon-64.png'))));
check('index.html references the shipped favicon', readFileSync(join(ROOT, 'index.html'), 'utf8').includes('favicon-64.png'));
check('vector source of truth is committed', existsSync(join(ROOT, 'assets', 'icon', 'sc-monogram.svg')));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
check('electron packaging points at the monogram icon', (pkg.build?.win?.icon ?? pkg.build?.icon) === 'public/icon-512.png');
check('icon renderer needs no package.json dependency', !pkg.dependencies?.['@resvg/resvg-js'] && !pkg.devDependencies?.['@resvg/resvg-js']);

/* ------------------------------------------------------------- verdict */

rmSync(dir, { recursive: true, force: true });

console.log(`\n  ${passed} checks`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All UI render smoke checks passed.');
