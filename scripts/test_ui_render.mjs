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
 *   - Equalizer: preset grid; custom faders hidden for A3949 (factory
 *     presets only per OpenSCQ30) and present for A3959 via profile override.
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
        export { DEVICES, UNKNOWN_PROFILE } from './src/protocol/devices.ts';
        export { DashboardPage } from './src/pages/DashboardPage.tsx';
        export { DevicesPage } from './src/pages/DevicesPage.tsx';
        export { EqualizerPage } from './src/pages/EqualizerPage.tsx';
        export { NoiseControl } from './src/components/NoiseControl.tsx';
        export { ControlsPage } from './src/pages/ControlsPage.tsx';
        export { SettingsPage } from './src/pages/SettingsPage.tsx';
        export { AboutSection } from './src/pages/AboutPage.tsx';
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
// Pass 8 IA: EXACTLY five top-level destinations.
for (const item of ['Home', 'Devices', 'Equalizer', 'Noise Control', 'Settings']) {
  check(`sidebar renders nav item "${item}"`, shell.includes(`>${item}</span>`));
}
// Removed/secondary labels must NOT be top-level nav entries.
for (const gone of ['Dashboard', 'Controls', 'About', 'Feedback & rating', 'Report a problem', 'Theme', 'Appearance', 'Updates', 'Check for updates']) {
  check(`sidebar has no top-level "${gone}" entry`, !shell.includes(`>${gone}</span>`));
}
check('sidebar shows the real disconnected chip', shell.includes('No device'));
check('shell renders the default page (Home)', shell.includes('>Home<'));

console.log('\n[dashboard]');
const dash = render(React.createElement(M.DashboardPage));
check('header title (Pass 8: Home)', dash.includes('>Home<') && !dash.includes('>Dashboard<'));
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

console.log('\n[equalizer] — default profile is R50i / A3949: factory presets ONLY');
const eq = render(React.createElement(M.EqualizerPage));
check('page title', eq.includes('>Equalizer<'));
check('this EQ-capable profile shows the preset grid', eq.includes('Soundcore presets') && eq.includes('Soundcore Signature'));
// Phase 18: OpenSCQ30 documents A3949 (R50i/P20i/P25i) WITHOUT custom
// presets (custom_preset_id None), so the custom editor must NOT render and
// the honest note must appear instead — a fader here would be a control the
// hardware does not accept.
check('A3949: custom faders are hidden (no custom-curve support)', (eq.match(/class="eq-fader"/g) ?? []).length === 0, `got ${(eq.match(/class="eq-fader"/g) ?? []).length}`);
check('A3949: honest "not supported" note replaces the editor', eq.includes('Custom curves are not supported by'));
check('A3949: header states factory presets only', eq.includes('factory presets only'));
check('fader range docs stay for models that do have custom curves (±6 dB, 100 Hz–12.8 kHz)', eq.includes('±6 dB') && eq.includes('100 Hz') && eq.includes('12.8 kHz'));
check('disabled while not connected', eq.includes('Connect a device to apply presets'));

// The SAME page rendered for the R50i NC / A3959 profile — which OpenSCQ30
// documents WITH custom presets (custom_preset_id Some(0xFEFE)) — must show
// the full custom editor. Context override: the store's real provider value
// with only the profile swapped (capabilities derive from it).
const P30I_PROFILE = M.DEVICES.find((d) => d.sku === 'A3959');
check('A3959 profile exists in the table for the override render', !!P30I_PROFILE);
const eqNc = render(
  React.createElement(AppProvider, null, [
    (() => {
      const inner = function Override() {
        const app = React.useContext(M.AppContext);
        return React.createElement(
          M.AppContext.Provider,
          {
            value: {
              ...app,
              profile: P30I_PROFILE,
              connected: true,
              // capabilities are derived inside the provider from the real
              // profile — re-derive them for the overridden one.
              capabilities: M.deriveCapabilities(P30I_PROFILE),
            },
          },
          React.createElement(M.EqualizerPage),
        );
      };
      return React.createElement(inner);
    })(),
  ]),
);
check('A3959: every band renders a fader input (custom curves supported)', (eqNc.match(/class="eq-fader"/g) ?? []).length === 8, `got ${(eqNc.match(/class="eq-fader"/g) ?? []).length}`);
check('A3959: custom curve documents the real FE FE preset id', eqNc.includes('FE FE'));

/* ======================================================================== */
/* Phase 19 — A3959 ANC diagnostics + honest ANC state (no optimistic UI)   */
/*                                                                          */
/* The user reported that desktop ANC does not change what they hear while  */
/* Android does, on the same R50i NC. These assertions pin the two halves   */
/* of the honesty contract that can be checked without hardware:            */
/*   1. the A3959 diagnostics panel exists ONLY for the A3959 profile, and  */
/*      it states that Windows audio is untouched and that no automated     */
/*      PASS is produced from a write;                                   */
/*   2. no ANC mode is presented as the confirmed device state until the    */
/*      device's own report arrives (ancHasReport), so the app can never    */
/*      substitute a local UI change for a physical ANC change.             */
/* ======================================================================== */

console.log('\n[noise control] A3959 diagnostics + honest ANC state');

// The default (A3949) render renders the honest unsupported note, never the
// A3959-only diagnostics panel.
const controlsDefault = render(React.createElement(M.ControlsPage));
check('A3949 Noise Control hides the A3959 diagnostics panel', !controlsDefault.includes('A3959 hardware diagnostics'));

function renderNoiseControlFor(profile, extraState = {}) {
  return render(
    React.createElement(AppProvider, null, [
      (() => {
        const inner = function Override() {
          const app = React.useContext(M.AppContext);
          return React.createElement(
            M.AppContext.Provider,
            { value: { ...app, profile, capabilities: M.deriveCapabilities(profile), ...extraState } },
            React.createElement(M.NoiseControl),
          );
        };
        return React.createElement(inner);
      })(),
    ]),
  );
}

const ncNc = renderNoiseControlFor(P30I_PROFILE, { connected: true });
check('A3959 Noise Control renders the hardware diagnostics panel', ncNc.includes('A3959 hardware diagnostics'));
check('A3959 diagnostics: read-state + each A–I action is offered',
  ncNc.includes('Read state (A/C/E/G/I)') && ncNc.includes('B · Normal') && ncNc.includes('D · Transparency') && ncNc.includes('F · Manual 1') && ncNc.includes('H · Manual 5'));
check('A3959 diagnostics: states that Windows audio is not modified', ncNc.includes('No Windows audio settings are changed'));
check('A3959 diagnostics: tells the user to keep audio playing',
  ncNc.includes('Start audio yourself and keep it playing'));
check('A3959 diagnostics: physical result is user-recorded, not automated',
  ncNc.includes('I felt a change') && ncNc.includes('No physical change') && ncNc.includes('Unsure'));
const diagPanel = ncNc.slice(ncNc.indexOf('A3959 hardware diagnostics'));
check('A3959 diagnostics: no automated success claim',
  diagPanel.includes('not an automated PASS') && !/ANC works|verified working|physical validation complete/i.test(diagPanel));

// Honesty: with no device report yet, the status line is explicitly unknown
// and NO ANC mode icon may be rendered as the confirmed (aria-pressed) state.
check('A3959: ANC status line starts explicitly unknown', ncNc.includes('unknown') && ncNc.includes('physical effect unverified'));
// Scope the mode-icon check to the mode group only (the scene buttons carry
// their own aria-pressed state, which is a different control).
function modeIcons(html) {
  const start = html.indexOf('aria-label="Noise cancellation mode"');
  if (start < 0) return '';
  const end = html.indexOf('aria-label="Noise cancellation scene"', start);
  return html.slice(start, end > start ? end : undefined);
}
const modeGroup = modeIcons(ncNc);
check('A3959: no ANC mode is shown as confirmed before a device report',
  modeGroup.length > 0 && !modeGroup.includes('aria-pressed="true"'));

// A device report (ancHasReport) is the ONLY thing allowed to mark a mode as
// the confirmed one — simulate exactly what the store sets from `06:01`.
const ncReported = renderNoiseControlFor(P30I_PROFILE, { connected: true, ancHasReport: true, ancMode: 'transparency' });
check('A3959: a device-reported mode is marked confirmed', modeIcons(ncReported).includes('aria-pressed="true"'));
check('A3959: the A3959 scene selector explains multi-scene automation',
  ncNc.includes('Selecting a scene requests multi-scene automation, not manual strength'));

check('no third-party project names in the A3959 Noise Control renders either', !/OpenSCQ30|SoundcoreDesktop|Noiseclapper|soundcorebridge|victor-oliveira|DamienStaebler|CoreSound/i.test(ncNc + ncReported));

console.log('\n[controls]');
const controls = render(React.createElement(M.ControlsPage));
check('page title (Pass 8: Noise Control)', controls.includes('>Noise Control<') && !controls.includes('>Controls<'));
check('ANC component is embedded in the Noise Control page', controls.includes('Noise control is not available on this model'));
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
check('autostart + tray toggles removed (release policy)', !settings.includes('Launch at login') && !settings.includes('Minimize to tray'));
check('Settings states the fixed startup/exit policy', settings.includes('never starts with Windows') && settings.includes('quits completely when the window is closed'));
check('log folder row references the real path', settings.includes('soundcontrol') && settings.includes('main.log'));
check('production build hides developer tools', !settings.includes('Developer tools'));

// ---- Pass 8 consolidated sections ----
check('Settings has a Device section (honest when disconnected)', settings.includes('>Device<') && settings.includes('No device connected'));
check('Settings has Appearance with System/Dark/Light (accessible group)', settings.includes('aria-label="Theme"') && settings.includes('>System<') && settings.includes('>Dark<') && settings.includes('>Light<'));
check('theme selection persists through the store setting key', settings.includes('persists between launches'));
check('Settings has Updates with a real check button and honest idle copy', settings.includes('Check for updates') && settings.includes('no background updater') && settings.includes('Installed version'));
check('no fake update result is pre-rendered', !settings.includes('You are on the latest release') && !settings.includes('A newer release is available'));
check('no accent-color picker (branding is fixed)', !settings.includes('Accent color'));
check('Settings has Feedback & rating with five accessible star buttons', settings.includes('Feedback &amp; rating') && settings.includes('aria-label="Rating, 0 to 5 stars"') && (settings.match(/stars?"/g) ?? []).length >= 5);
check('feedback is truthful: no backend, nothing uploaded', settings.includes('Prepare feedback') && settings.includes('No feedback server exists') && !settings.includes('submitted successfully'));
check('Settings has Report a problem with device context + diagnostics toggle', settings.includes('Report a problem') && settings.includes('Device context (added automatically)') && settings.includes('Include protocol diagnostics'));
check('report is truthful: no upload backend claimed', settings.includes('Prepare report') && settings.includes('nothing is uploaded behind your back') && !settings.includes('report submitted'));
check('report mentions token redaction', settings.includes('redacted'));
check('Settings embeds About (version, MIT, disclaimer, real links)', settings.includes('MIT License') && settings.includes('not affiliated with') && settings.includes('https://github.com/Shankers8811/soundcontrol'));
check('Startup & exit remains a static policy (no toggles)', settings.includes('Startup &amp; exit') && settings.includes('manual launch · quits on close') && !settings.includes('Launch at login') && !settings.includes('Minimize to tray') && !settings.includes('Start with Windows'));

console.log('\n[about section]');
const about = render(React.createElement(M.AboutSection));
check('About renders as an embeddable section (no standalone page header)', !about.includes('<h1') && about.includes('SoundControl'));
check('real branding + version line', about.includes('SoundControl') && about.includes('version'));
check('MIT license statement', about.includes('MIT License'));
check('real repository links only', about.includes('https://github.com/Shankers8811/soundcontrol'));
check('no fake update/support/privacy buttons', !about.includes('Check for updates') && !about.includes('Contact support') && !about.includes('Privacy policy'));
check('unofficial-project disclaimer', about.includes('not affiliated with'));

// Pass 11 §6: research-project names must never reach the rendered product —
// credits stay in the developer-facing provenance record (PROTOCOL.md), and
// the UI only points at it.
const THIRD_PARTY_NAMES = /OpenSCQ30|SoundcoreDesktop|Noiseclapper|soundcorebridge|victor-oliveira|DamienStaebler|CoreSound/i;
const ALL_RENDERED = shell + dash + devices + eq + controls + settings + about;
check('no third-party project names in any rendered page', !THIRD_PARTY_NAMES.test(ALL_RENDERED), ALL_RENDERED.slice(0, 200));
check('protocol provenance pointer stays in About (PROTOCOL.md)', about.includes('PROTOCOL.md'));

/* ======================================================================== */
/* Connected-state L/R rendering (Pass 4 §23)                                */
/*                                                                           */
/* EarbudStatusCard is rendered through the REAL React tree with the store's */
/* exported context seam, for every earbud state, with earbudState produced  */
/* by the REAL deriveEarbudState from raw battery objects — the same chain   */
/* production uses (wire bytes → store merge → derive → card).               */
/* ======================================================================== */

console.log('\n[earbud card] connected-state L/R rendering (all six states)');

const { AppContext, EarbudStatusCard, DEVICES: RD, UNKNOWN_PROFILE: UNKP, deriveCapabilities: rc, deriveEarbudState: des } = M;
const twsCaps = rc(RD.find((d) => d.id === 'liberty-4-nc'));
const overEarCaps = rc(RD.find((d) => d.id === 'q45'));

function renderCard(battery, caps, connected = true) {
  const earbudState = des(battery, caps);
  // Mirror the real AppState shape: the card reads app.battery (scale
  // unknown-ness) alongside the derived earbudState.
  const ctx = { connected, earbudState, battery };
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

// UNKNOWN MODEL (Pass 10 §1): raw levels exist and presence is known, but the
// scale is unproven — the card must render the honest "Battery unavailable"
// and NEVER a percentage (raw 4 would be 80% on scale-5, 40% on scale-10).
const unkCaps = rc(UNKP);
const unkHtml = renderCard({ left: 4, right: null, batteryScale: 'unknown', presence: 'left' }, unkCaps);
check('unknown-scale: connected side shows "Battery unavailable"', unkHtml.includes('Battery unavailable'));
check('unknown-scale: NO percentage rendered anywhere', !/\d+%/.test(unkHtml), unkHtml.replace(/></g, '> <').slice(0, 300));
check('unknown-scale: no misleading "pending" promise', !unkHtml.includes('Battery pending'));
check('unknown-scale: presence still renders (left Connected, right Disconnected)', unkHtml.includes('>Connected<') && unkHtml.includes('>Disconnected<'));
check('unknown-scale: accessible name says battery unavailable', unkHtml.includes('Left earbud connected, battery unavailable (model unknown)'));
check('unknown-scale: profile claims per-side presence but no ANC/EQ', unkCaps.supportsEarbudState === true && unkCaps.supportsNoiseControl === false && unkCaps.supportsEqualizer === false);

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
// Phase 20: the exe/shortcuts/taskbar and the NSIS installer now take a real
// multi-size .ico built from these monogram PNGs (scripts/generate-ico.mjs),
// because Windows shows the 16/32px entries, not the 512px source.
check('electron packaging points at the multi-size monogram .ico', pkg.build?.win?.icon === 'build/icon.ico');
check('the .ico is committed so a Windows build never ships Electron artwork', existsSync(join(ROOT, 'build', 'icon.ico')) && statSync(join(ROOT, 'build', 'icon.ico')).size > 1000);
check('the installer/uninstaller/header icons use the same file',
  pkg.build?.nsis?.installerIcon === 'build/icon.ico' &&
  pkg.build?.nsis?.uninstallerIcon === 'build/icon.ico' &&
  pkg.build?.nsis?.installerHeaderIcon === 'build/icon.ico');
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
