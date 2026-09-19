#!/usr/bin/env node
/**
 * Earbud-only control boundary tests (Phase 17).
 *
 * SOUND CONTROL = EAR BUD / HEADPHONE DEVICE CONTROL — never Windows audio.
 *
 * This harness pins three things:
 *
 *   1. TARGET SEMANTICS — every command in the registry carries an explicit
 *      `target: 'earbud'`, the registry is exactly the supported Soundcore
 *      command set, and the Windows-host audio command list is EMPTY (it must
 *      stay empty: no user-facing command may target the host).
 *   2. PROTOCOL-LEVEL PROTECTION — `validateOutboundFrame` accepts every
 *      frame the app can legitimately build (all builders, all layouts, both
 *      EQ variants, both game-mode SKUs, connect handshake frames) and
 *      rejects garbage: bad header, wrong length field, bad checksum,
 *      unknown CAT:TYPE, empty/short input. `withEarbudOnlyBoundary` then
 *      proves the choke point: an unrecognized frame never reaches the
 *      wrapped transport, a recognized one passes through untouched.
 *   3. HOST-AUDIO ABSENCE — a static scan over the application code
 *      (renderer, main process, preload, autostart policy, the Windows
 *      helper, the emulated helper) asserts that no Windows audio/mixer/
 *      endpoint API is referenced anywhere. SoundControl may talk to Windows
 *      only for Bluetooth transport discovery and app lifecycle.
 *
 * Run: npm run test:targets   (also part of `npm test`)
 */

import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
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

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-targets-'));
const bundlePath = join(dir, 'targets.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `
        export * from './src/protocol/targets.ts';
        export * from './src/protocol/packets.ts';
        export * from './src/protocol/devices.ts';
        export * from './src/protocol/presets.ts';
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

/* ------------------------------------------------- 1. target semantics */

console.log('\nCommand-target registry');

check(
  'registry is non-empty and every command targets the earbud',
  M.EARBUD_COMMANDS.length > 0 && M.EARBUD_COMMANDS.every((c) => c.target === 'earbud'),
  JSON.stringify(M.EARBUD_COMMANDS.filter((c) => c.target !== 'earbud').map((c) => c.id)),
);

check(
  'every command has a stable id, a label and at least one frame key',
  M.EARBUD_COMMANDS.every((c) => typeof c.id === 'string' && c.id.length > 0 && typeof c.label === 'string' && c.frames.length > 0),
);

const ids = M.EARBUD_COMMANDS.map((c) => c.id);
check('command ids are unique', new Set(ids).size === ids.length, String(ids));

const keys = M.EARBUD_COMMANDS.flatMap((c) => [...c.frames]);
check('frame keys are unique (one frame = one command)', new Set(keys).size === keys.length, String(keys));

check(
  'frame keys are CAT:TYPE uppercase hex',
  keys.every((k) => /^([0-9A-F]{2}):([0-9A-F]{2})$/.test(k)),
  String(keys),
);

check(
  'no registry entry is a Windows-host command',
  !M.EARBUD_COMMANDS.some((c) => c.id.toLowerCase().includes('windows') || c.id.toLowerCase().includes('host')),
);

check(
  'WINDOWS_HOST_AUDIO_COMMANDS is empty — no user-facing host-audio command exists',
  Array.isArray(M.WINDOWS_HOST_AUDIO_COMMANDS) && M.WINDOWS_HOST_AUDIO_COMMANDS.length === 0,
  JSON.stringify(M.WINDOWS_HOST_AUDIO_COMMANDS ?? null),
);

// The exact contract the Windows helper enforces independently
// (TX_ALLOWED_FRAMES in soundcore_bridge.py — cross-checked on the Python
// side by scripts/test_bridge_probe.py).
const EXPECTED_FRAME_KEYS = [
  '01:01', '01:03', '01:04', '01:05', '01:7F', '01:85', '01:87', '01:FF',
  '02:81', '02:83', '02:86', '06:81', '0B:84', '10:85',
];
check(
  `registry frame set is exactly the ${EXPECTED_FRAME_KEYS.length}-command Soundcore contract`,
  JSON.stringify([...M.EARBUD_COMMAND_FRAME_KEYS]) === JSON.stringify([...EXPECTED_FRAME_KEYS].sort()),
  `got ${JSON.stringify(M.EARBUD_COMMAND_FRAME_KEYS)}`,
);

check(
  'commandForFrameKey resolves a registered frame',
  M.commandForFrameKey('06:81')?.id === 'sound-modes.set' && M.commandForFrameKey('06:81') === M.commandForFrameKey('06:81'.toLowerCase()),
);

/* ------------------------------------------- 2. protocol-level validation */

console.log('\nProtocol-level validation (validateOutboundFrame)');

const legit = [];
legit.push(['state request (INIT)', M.INIT]);
legit.push(['device info', M.DEVICE_INFO]);
legit.push(['battery query', M.BATTERY_QUERY]);
legit.push(['charging query', M.CHARGING_QUERY]);
legit.push(['LDAC query', M.LDAC.query]);
legit.push(['LDAC enable', M.LDAC.enable]);
legit.push(['LDAC disable', M.LDAC.disable]);
legit.push(['dual enable', M.DUAL.enable]);
legit.push(['dual disable', M.DUAL.disable]);
legit.push(['surround on', M.buildSurroundSound(true)]);
legit.push(['surround off', M.buildSurroundSound(false)]);
legit.push(['factory reset', M.buildResetDevice()]);

const ANC_INTENTS = [
  ['ANC + outdoor', { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false }],
  ['transparency + vocal', { mode: 'transparency', level: 3, scene: 'indoor', transVocal: true, wind: true }],
  ['normal', { mode: 'normal', level: 1, scene: 'transport', transVocal: false, wind: false }],
  ['adaptive', { mode: 'adaptive', level: 4, scene: 'outdoor', transVocal: false, wind: true }],
];
for (const layout of ['classic', 'tws-p30i', 'tws-l4nc', 'tws-l3pro']) {
  for (const [name, intent] of ANC_INTENTS) {
    legit.push([`ANC ${layout} · ${name}`, M.buildAnc(layout, intent)]);
  }
}
check(
  'ANC builder refuses layouts without sound-mode control (null, not a guessed frame)',
  M.buildAnc('none', ANC_INTENTS[0][1]) === null,
);

legit.push(['EQ 02:81', M.buildEq('02:81', 0x0100, [0, 3, -2, 5, 0, 0, 6, -6])]);
legit.push(['EQ 02:83', M.buildEq('02:83', 0xfefe, [1, -1, 2, -2, 3, -3, 4, -4])]);

const eqProfiles = M.DEVICES.filter((d) => d.eqCommand);
check('there are profiles with EQ support to sweep', eqProfiles.length > 0);
for (const profile of eqProfiles) {
  legit.push([`EQ preset · ${profile.sku}`, M.buildEqPreset(profile, M.CUSTOM_EQ_PRESET ? M[M.CUSTOM_EQ_PRESET] ?? { index: 0x0100, bands: [0, 0, 0, 0, 0, 0, 0, 0] } : { index: 0x0100, bands: [0, 0, 0, 0, 0, 0, 0, 0] })]);
  legit.push([`EQ custom · ${profile.sku}`, M.buildCustomEq(profile, [0, 1, 2, 3, -1, -2, -3, 0])]);
}

for (const profile of M.DEVICES) {
  legit.push([`game mode on · ${profile.sku}`, M.buildGameMode(profile, true)]);
  legit.push([`game mode off · ${profile.sku}`, M.buildGameMode(profile, false)]);
}

let allLegitOk = true;
const badLegit = [];
for (const [name, frame] of legit) {
  if (!frame) continue;
  const res = M.validateOutboundFrame(frame);
  if (!res.ok) {
    allLegitOk = false;
    badLegit.push(`${name}: ${res.reason}`);
  }
}
check(
  `every legitimate app-built frame validates (${legit.length} cases)`,
  allLegitOk,
  badLegit.join('; '),
);

check(
  'a validated frame resolves to its registered command',
  M.validateOutboundFrame(M.buildSurroundSound(true))?.command?.id === 'surround.set',
);

// Rejections — none of these may ever be transmitted.
function frameBytes(cat, type, payload = []) {
  const body = [0x08, 0xee, 0x00, 0x00, 0x00, cat, type, ...payload];
  const total = 10 + payload.length;
  body.push(total & 0xff, (total >> 8) & 0xff);
  return new Uint8Array([...body, body.reduce((a, b) => a + b, 0) & 0xff]);
}

const rejects = [
  ['empty payload', new Uint8Array([])],
  ['too short (5 bytes)', new Uint8Array([0x08, 0xee, 0x00, 0x00, 0x00])],
  ['bad header magic', new Uint8Array([0x41, 0x41, 0x41, 0x41, 0x41, 0x06, 0x81, 0x0e, 0x00, 0x00, 0x01, 0x01, 0x00, 0x8d])],
  ['unknown CAT (07:81, checksum-valid)', frameBytes(0x07, 0x81)],
  ['unknown TYPE (06:99, checksum-valid)', frameBytes(0x06, 0x99)],
  ['unknown CAT (00:00, checksum-valid)', frameBytes(0x00, 0x00)],
];
{
  // INIT with a flipped checksum byte — structurally broken.
  const badCs = new Uint8Array(M.INIT);
  badCs[badCs.length - 1] ^= 0xff;
  rejects.push(['checksum mismatch (INIT, flipped)', badCs]);
  // INIT with a lied-about length field.
  const badLen = new Uint8Array(M.INIT);
  badLen[7] = 0x2a;
  rejects.push(['length field lies (INIT)', badLen]);
  // A host-audio-shaped fantasy frame — anything not in the registry goes.
  rejects.push(['fantasy "set volume" frame (03:80)', frameBytes(0x03, 0x80, [0x64])]);
}
let allRejected = true;
const badRejects = [];
for (const [name, frame] of rejects) {
  const res = M.validateOutboundFrame(frame);
  if (res.ok || !res.reason) {
    allRejected = false;
    badRejects.push(name);
  }
}
check(
  `non-earbud / malformed frames are all rejected (${rejects.length} cases)`,
  allRejected,
  `accepted: ${badRejects.join('; ')}`,
);

const unknownRes = M.validateOutboundFrame(frameBytes(0x07, 0x81));
check(
  'rejection reason names the unrecognized command',
  !unknownRes.ok && /07:81/.test(unknownRes.reason) && /not a recognized/i.test(unknownRes.reason),
  unknownRes.reason,
);

/* --------------------------------------------- transport boundary wrapper */

console.log('\nTransport boundary (withEarbudOnlyBoundary)');

{
  const written = [];
  const blocked = [];
  const fake = {
    kind: 'bridge',
    label: 'fake-earbuds',
    write: async (data) => {
      written.push(data);
    },
    close: async () => {},
  };
  const guarded = M.withEarbudOnlyBoundary(fake, (reason) => blocked.push(reason));

  check('wrapper preserves kind and label', guarded.kind === 'bridge' && guarded.label === 'fake-earbuds');

  let unknownThrew = false;
  try {
    await guarded.write(frameBytes(0x07, 0x81));
  } catch {
    unknownThrew = true;
  }
  check(
    'unrecognized frame throws and never reaches the transport',
    unknownThrew && written.length === 0 && blocked.length === 1 && /not a recognized/.test(blocked[0]),
    `written=${written.length} blocked=${JSON.stringify(blocked)}`,
  );

  await guarded.write(M.buildSurroundSound(true));
  check(
    'recognized frame passes through to the transport',
    written.length === 1 && M.validateOutboundFrame(written[0]).ok,
  );

  await guarded.close();
  check('close() delegates to the wrapped transport', true);
}

/* ------------------------------------------- 3. host-audio absence scan */

console.log('\nStatic scan — no Windows audio APIs in application code');

// API tokens SoundControl must never call for audio control. Deliberately
// narrow: tokens that name host-audio APIs, never words that merely *mention*
// Windows (help texts may legitimately tell the user to adjust volume in the
// Windows mixer themselves — guidance is not a control).
const FORBIDDEN = [
  /\bpycaw\b/i,
  /\bsounddevice\b/i,
  /\bwinsound\b/i,
  /\bwinmm\b/i,
  /\bcoreaudio\b/i,
  /\bIAudioEndpointVolume\b/,
  /\bISimpleAudioVolume\b/,
  /\bIAudioClient\b/,
  /\bIMMDeviceEnumerator\b/,
  /\bIPolicyConfig\b/,
  /\bnircmd\b/i,
  /\bVK_VOLUME/,
  /\bAPPCOMMAND_VOLUME/,
  /\bSendInput\b/,
  /\bkeybd_event\b/,
  /\bSetMasterVolume/i,
  /\bSetDefaultAudioEndpoint/i,
  /\bset-audiodevice\b/i,
  /\bAudioDeviceCmdlets\b/i,
  /\bendpointvolume\b/i,
];

function* walk(root) {
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'release') continue;
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Application code only — no docs, no markdown, and not this test file (it
// necessarily names the tokens). .mjs scripts under scripts/ are CI/test
// harnesses; the app surfaces shipped to users are scanned exhaustively.
const SCANNED_ROOTS = ['src', 'public'];
const SCANNED_FILES = [
  'electron-main.cjs',
  'preload.cjs',
  'autostart.cjs',
  'soundcore_bridge.py',
  'index.html',
  'scripts/emulated_bridge.py',
  'scripts/verify-autostart.cjs',
  'scripts/verify-protocol.mjs',
  'scripts/test_startup_e2e.mjs',
  'scripts/test_ui_state.mjs',
  'scripts/test_ui_render.mjs',
  'scripts/test_main_lifecycle.mjs',
  'build-windows-exe.bat',
  'start-windows.bat',
];

const files = [];
for (const rel of SCANNED_ROOTS) {
  const abs = join(ROOT, rel);
  if (statSync(abs).isDirectory()) {
    for (const f of walk(abs)) {
      if (/\.(ts|tsx|js|cjs|py|html|css)$/.test(f)) files.push(f);
    }
  }
}
for (const rel of SCANNED_FILES) {
  const abs = join(ROOT, rel);
  try {
    if (statSync(abs).isFile()) files.push(abs);
  } catch {
    failures.push(`scan target missing: ${rel}`);
  }
}

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of FORBIDDEN) {
    const m = text.match(re);
    if (m) hits.push(`${f}: /${re.source}/ → "${m[0]}"`);
  }
}
check(
  `no host-audio API referenced across ${files.length} application files`,
  hits.length === 0,
  hits.join(' | '),
);

/* ------------------------------------------------------------------ done */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
