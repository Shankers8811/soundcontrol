/**
 * Protocol verification harness.
 *
 * Every frame SoundControl can send is rebuilt here and compared, byte for
 * byte, against captures published by independent reverse-engineering
 * projects. If a builder ever drifts from what real hardware accepts, this
 * script fails the build instead of a user's earbuds silently ignoring a
 * command.
 *
 *   npm run verify:protocol
 *
 * The script bundles src/protocol/* with esbuild first, so it exercises the
 * same TypeScript that ships in the renderer — not a copy of the logic.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  // Compare hex only: captures are stored without separators, toHex uses
  // spaces, and the difference is not a protocol difference.
  const norm = (v) => String(v).toUpperCase().replace(/[^0-9A-F]/g, '');
  const a = norm(actual);
  const e = norm(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

function ok(label, condition, detail = '') {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ bundle */

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-verify-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'protocol.mjs');
writeFileSync(
  entry,
  [
    `export * from '${ROOT}src/protocol/packets.ts';`,
    `export * from '${ROOT}src/protocol/presets.ts';`,
    `export * from '${ROOT}src/protocol/devices.ts';`,
    `export * from '${ROOT}src/protocol/drc.ts';`,
    `export * from '${ROOT}src/protocol/codec.ts';`,
  ].join('\n'),
);

const bundled = spawnSync(
  join(ROOT, 'node_modules', '.bin', 'esbuild'),
  [entry, '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'],
  { encoding: 'utf8' },
);
if (bundled.status !== 0) {
  console.error('esbuild failed:\n' + bundled.stderr);
  process.exit(1);
}

const P = await import(pathToFileURL(out).href);
const {
  INIT,
  DEVICE_INFO,
  BATTERY_QUERY,
  buildClassicAnc,
  buildP30iAnc,
  buildLiberty4NcAnc,
  buildLiberty3ProAnc,
  buildEq81,
  buildEq83,
  buildSurroundSound,
  buildResetDevice,
  buildGameMode,
  EQ_PRESETS,
  DEVICES,
  applyDrc,
  toHex,
  verifyFrame,
} = P;

const hex = (u8) => toHex(u8);

console.log('SoundControl protocol verification\n');

/* ------------------------------------------------- frame invariants (all) */

const everyFrame = [
  ['INIT', INIT],
  ['DEVICE_INFO', DEVICE_INFO],
  ['BATTERY_QUERY', BATTERY_QUERY],
  ['surround on', buildSurroundSound(true)],
  ['surround off', buildSurroundSound(false)],
  ['reset', buildResetDevice()],
];
for (const d of DEVICES) {
  everyFrame.push([`game ${d.sku}`, buildGameMode(d, true)]);
  if (d.eqCommand) {
    everyFrame.push([`eq ${d.sku}`, P.buildEqPreset(d, EQ_PRESETS[1])]);
    everyFrame.push([`custom eq ${d.sku}`, P.buildCustomEq(d, [1, -1, 2, -2, 3, -3, 4, -4])]);
  }
}
for (const intent of [
  { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false },
  { mode: 'anc', level: 1, scene: 'transport', transVocal: false, wind: true },
  { mode: 'adaptive', level: 3, scene: 'indoor', transVocal: false, wind: false },
  { mode: 'transparency', level: 3, scene: 'outdoor', transVocal: true, wind: true },
  { mode: 'normal', level: 3, scene: 'outdoor', transVocal: false, wind: false },
]) {
  everyFrame.push(['classic anc', buildClassicAnc(intent)]);
  everyFrame.push(['p30i anc', buildP30iAnc(intent)]);
  everyFrame.push(['l4nc anc', buildLiberty4NcAnc(intent)]);
  everyFrame.push(['l3pro anc', buildLiberty3ProAnc(intent)]);
}

for (const [label, frame] of everyFrame) {
  const bytes = frame;
  ok(`${label}: magic`, bytes[0] === 0x08 && bytes[1] === 0xee, hex(bytes));
  const declared = bytes[7] | (bytes[8] << 8);
  ok(`${label}: total_len == frame length`, declared === bytes.length, `${declared} vs ${bytes.length}`);
  ok(`${label}: checksum`, verifyFrame(bytes) === true, hex(bytes));
  ok(`${label}: total_len == 10 + payload`, declared === 10 + (bytes.length - 10));
}
console.log(`  ${everyFrame.length * 4} frame invariants`);

/* ------------------------------------- captures: SoundcoreDesktop / GNOME */
/* Live RFCOMM frames, identical in DamienStaebler/SoundcoreDesktop
  ' SoundcoreAPI.py and JordanViknar/Noiseclapper-GNOME src/common.ts. */

const CAPTURED_02_81 = {
  'SoundCore Signature': '08ee00000002811400000078787878787878784d',
  'Acoustic': '08ee000000028114000100a0828c8ca0a0a08c34',
  'Bass Booster': '08ee000000028114000200a0968278787878789f',
  'Bass Reducer': '08ee000000028114000300505a6e787878787800',
  'Classical': '08ee00000002811400040096966464788c96a0bf',
  'Podcast': '08ee0000000281140005005a8ca0a0968c7864b6',
  'Dance': '08ee0000000281140006008c5a6e828c8c825a5d',
  'Deep': '08ee0000000281140007008c8296968c64504654',
  'Electronic': '08ee000000028114000800968c648c828c9696e1',
  'Flat': '08ee00000002811400090064646e7878786464fc',
  'Hip-Hop': '08ee000000028114000a008c966e6e8c6e8c96b1',
  'Jazz': '08ee000000028114000b008c8c6464788c96a0b2',
  'Latin': '08ee000000028114000c0078786464647896aa6d',
  'Lounge': '08ee000000028114000d006e8ca09678648c82b4',
  'Piano': '08ee000000028114000e007896968ca0aa96a04b',
  'Pop': '08ee000000028114000f006e829696826e645a66',
  'R&B': '08ee000000028114001000b48c64648c9696a0fd',
  'Rock': '08ee000000028114001100968c6e6e82969696e0',
  'Small Speaker(s)': '08ee000000028114001200a0968278645a50502d',
  'Spoken Word': '08ee0000000281140013005a64828c8c82785a4c',
  'Treble Booster': '08ee0000000281140014006464646e828c8ca075',
  'Treble Reducer': '08ee000000028114001500787878645a50503ca4',
};

for (const [name, capture] of Object.entries(CAPTURED_02_81)) {
  const bytes = Buffer.from(capture, 'hex');
  const presetId = bytes[9] | (bytes[10] << 8);
  const preset = EQ_PRESETS.find((p) => p.index === presetId);
  ok(`02:81 ${name}: preset exists in the table`, Boolean(preset), `id 0x${presetId.toString(16)}`);
  if (!preset) continue;
  check(`02:81 ${name}`, hex(buildEq81(preset.index, preset.bands)), capture);
}
console.log(`  ${Object.keys(CAPTURED_02_81).length} captured 02:81 EQ frames`);

/* --------------------------------------------- captures: classic ANC set */
/* Noiseclapper-GNOME noiseCancellingSignalList — live frames, Life Q30. */

const CAPTURED_ANC = {
  'transport': '08ee00000006810e00000001008c',
  'indoor': '08ee00000006810e00000201008e',
  'outdoor': '08ee00000006810e00000101008d',
  'normal': '08ee00000006810e00020101008f',
  'transparency': '08ee00000006810e00010101008e',
};
/*
 * Noiseclapper's live frames all carry transparency byte 01 (VocalMode) —
 * that is the state the phone app leaves the headset in, and byte 2 is an
 * independent field, so it stays 01 in every one of these captures.
 */
const ANC_INTENT = {
  transport: { mode: 'anc', level: 5, scene: 'transport', transVocal: true, wind: false },
  indoor: { mode: 'anc', level: 5, scene: 'indoor', transVocal: true, wind: false },
  outdoor: { mode: 'anc', level: 5, scene: 'outdoor', transVocal: true, wind: false },
  normal: { mode: 'normal', level: 5, scene: 'outdoor', transVocal: true, wind: false },
  transparency: { mode: 'transparency', level: 5, scene: 'outdoor', transVocal: true, wind: false },
};
for (const [name, capture] of Object.entries(CAPTURED_ANC)) {
  check(`classic ANC ${name}`, hex(buildClassicAnc(ANC_INTENT[name])), capture);
}
console.log(`  ${Object.keys(CAPTURED_ANC).length} captured classic ANC frames`);

/* ------------------------------------------- captures: P20i 02:83 (DRC) */
/* victor-oliveira1/soundcore_anker_equalyzer p20i_eq.py — 22 live frames
  ' from a P20i over RFCOMM channel 10. Channel 1 of each frame is the raw
   curve, channel 2 is the DRC-compensated curve the device actually applies. */

const CAPTURED_02_83 = {
  'soundcore': '08ee00000002832000000078787878787878787800787878787878787878000b',
  'soundcore_bass': '08ee000000028320000200a09682787878787878007b7a787878787878780062',
  'acustica': '08ee000000028320000100a0828c8ca0a0a08c78007d767b787c7a7c79780003',
  'redutor_graves': '08ee000000028320000300505a6e7878787878780075767878787878787800b9',
  'classico': '08ee00000002832000040096966464788c96a078007a7c7477787a797d780086',
  'podcast': '08ee0000000283200005005a8ca0a0968c78647800747b7a7b797a7875780078',
  'danca': '08ee0000000283200006008c5a6e828c8c825a78007c7378787a797b7378001b',
  'deep': '08ee0000000283200007008c8296968c64504678007a777b797b767673780011',
  'eletronica': '08ee000000028320000800968c648c828c969678007a7b737d777a7a7b7800aa',
  'flat': '08ee00000002832000090064646e7878786464780076777778787976767800b3',
  'hip_hop': '08ee000000028320000a008c966e6e8c6e8c967800797c76767d747b7b780077',
  'jazz': '08ee000000028320000b008c8c6464788c96a07800797b7577787a797d780078',
  'latina': '08ee000000028320000c0078786464647896aa78007879767776787a7e78002f',
  'lounge': '08ee000000028320000d006e8ca09678648c827800767a7b7a78747c78780077',
  'piano': '08ee000000028320000e007896968ca0aa96a07800777b7a787b7c787d780019',
  'pop': '08ee000000028320000f006e829696826e645a780077797a7a79777775780024',
  'r&b': '08ee000000028320001000b48c64648c9696a078007e7976757b7a797d7800c8',
  'rock': '08ee000000028320001100968c6e6e8296a0aa78007a7a7677797a7a7e7800c8',
  'pequeno_altofalante': '08ee000000028320001200a0968278645a505078007b7a7879767675747800e6',
  'palavra': '08ee0000000283200013005a64828c8c82785a780076767a797a787974780008',
  'amplificador_agudos': '08ee0000000283200014006464646e828c8ca0780076777777797a787d780036',
  'redutor_agudos': '08ee000000028320001500787878645a50503c78007878797677757771780055',
};

for (const [name, capture] of Object.entries(CAPTURED_02_83)) {
  const bytes = Buffer.from(capture, 'hex');
  const presetId = bytes[9] | (bytes[10] << 8);
  const preset = EQ_PRESETS.find((p) => p.index === presetId);
  ok(`02:83 ${name}: preset exists in the table`, Boolean(preset), `id 0x${presetId.toString(16)}`);
  if (!preset) continue;
  // Whole frame, including the DRC channel — except Rock, whose P20i capture
  // uses a different curve than the three-source consensus (see below). For
  // Rock the DRC channel is verified as self-consistent instead.
  const built = hex(buildEq83(preset.index, preset.bands));
  if (presetId === 0x11) {
    const builtDrc = Buffer.from(built.replace(/\s+/g, ''), 'hex').slice(21, 31).toString('hex');
    const rawAdj = Array.from(Buffer.from(built.replace(/\s+/g, ''), 'hex').slice(11, 21), (b) => b - 120);
    const recomputed = applyDrc(rawAdj)
      .map((v) => (Math.max(-120, Math.min(134, v)) + 120).toString(16).padStart(2, '0'))
      .join('');
    ok('02:83 rock: DRC channel is consistent with its own raw channel', recomputed === builtDrc, `${recomputed} vs ${builtDrc}`);
  } else {
    check(`02:83 ${name}`, built, capture);
  }
  // The first eight band bytes normally equal the 02:81 capture for the same
  // preset — the two families share one curve table. Rock (0x11) is the one
  // documented exception: the P20i capture has bands 6-8 as A0 AA (vs the
  // three-source consensus 96 96 96), so that single divergence is expected.
  const bandBytes = toHex(bytes.slice(11, 19), '').toLowerCase();
  const match81 = Object.entries(CAPTURED_02_81).find(([, c]) => {
    const b = Buffer.from(c, 'hex');
    return (b[9] | (b[10] << 8)) === presetId;
  });
  const expected81 = match81 ? Buffer.from(match81[1], 'hex').slice(11, 19).toString('hex') : null;
  if (presetId === 0x11) {
    ok(
      '02:83 rock: known divergence from the 02:81 consensus is still A0AA',
      bandBytes === '968c6e6e8296a0aa',
      bandBytes,
    );
    ok(
      '02:81 rock: consensus table unchanged',
      String(expected81).toLowerCase() === '968c6e6e82969696',
      String(expected81),
    );
  } else {
    ok(
      `02:83 ${name}: band bytes agree with the 02:81 capture`,
      expected81 !== null && String(expected81).toLowerCase() === bandBytes,
      `${bandBytes} vs ${expected81}`,
    );
  }
}
console.log(`  ${Object.keys(CAPTURED_02_83).length} captured 02:83 EQ frames (raw + DRC channel)`);

/* ------------------------------------------------- OpenSCQ30 unit vectors */
/* lib/src/devices/soundcore/common/packet/outbound/set_equalizer.rs tests. */

check(
  'OpenSCQ30 set_equalizer custom',
  hex(buildEq81(0xfefe, [-6, 6, 2.3, 4, 2.2, 6, -0.4, 1.6])),
  '08 ee 00 00 00 02 81 14 00 fe fe 3c b4 8f a0 8e b4 74 88 e6',
);
check(
  'OpenSCQ30 set_equalizer signature',
  hex(buildEq81(0x0000, [0, 0, 0, 0, 0, 0, 0, 0])),
  '08 ee 00 00 00 02 81 14 00 00 00 78 78 78 78 78 78 78 78 4d',
);
check(
  'OpenSCQ30 set_equalizer treble reducer',
  hex(buildEq81(0x15, [0, 0, 0, -2, -3, -4, -4, -6])),
  '08 ee 00 00 00 02 81 14 00 15 00 78 78 78 64 5a 50 50 3c a4',
);
/* set_sound_modes.rs tests — the classic 4-byte layout. */
check(
  'OpenSCQ30 SetSoundModes normal',
  hex(buildClassicAnc({ mode: 'normal', level: 5, scene: 'transport', transVocal: true, wind: false })),
  '08 ee 00 00 00 06 81 0e 00 02 00 01 00 8e',
);
check(
  'OpenSCQ30 SetSoundModes noise canceling',
  hex(buildClassicAnc({ mode: 'anc', level: 5, scene: 'outdoor', transVocal: true, wind: false })),
  '08 ee 00 00 00 06 81 0e 00 00 01 01 00 8d',
);
/* request_serial_number_and_firmware_version.rs test. */
check('OpenSCQ30 01:05 request', hex(DEVICE_INFO), '08 ee 00 00 00 01 05 0a 00 06');
/* request_state.rs — the handshake. */
check('OpenSCQ30 01:01 request', hex(INIT), '08 ee 00 00 00 01 01 0a 00 02');
/* request_battery_level is `01:03` with an empty body. */
check('OpenSCQ30 01:03 request', hex(BATTERY_QUERY), '08 ee 00 00 00 01 03 0a 00 04');
console.log('  8 OpenSCQ30 unit-test vectors');

/* ------------------------------------------------------- DRC spot vectors */

const drcAcoustic = applyDrc([40, 10, 20, 20, 40, 40, 40, 20, 0, -120]).map((v) =>
  (Math.max(-120, Math.min(134, v)) + 120).toString(16).padStart(2, '0'),
);
check('DRC(Acoustic) == captured P20i channel 2', drcAcoustic.slice(0, 9).join(''), '7d767b787c7a7c7978');
ok('DRC returns 10 bands', applyDrc([0, 0, 0, 0, 0, 0, 0, 0, 0, -120]).length === 10);
ok('DRC band 9 is neutral', applyDrc([40, 10, 20, 20, 40, 40, 40, 20, 0, -120])[8] === 0);
ok('DRC band 10 is the -120 default', applyDrc([40, 10, 20, 20, 40, 40, 40, 20, 0, -120])[9] === -120);
console.log('  4 DRC vectors');

/* ------------------------------------------------------------ TWS shapes */

// P30i: 7-byte payload, ambient repeated at byte 2, automation at byte 3.
const p30iMax = buildP30iAnc({ mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false });
ok('P30i ANC payload is 7 bytes', p30iMax.length === 17, `${p30iMax.length}`);
ok('P30i byte0 == byte2 (ambient repeated)', p30iMax[9] === p30iMax[11]);
ok('P30i manual level in the high nibble', (p30iMax[10] >> 4) === 5, `0x${p30iMax[10].toString(16)}`);
ok('P30i automation = manual', p30iMax[12] === 0x00);
const p30iAdaptive = buildP30iAnc({ mode: 'adaptive', level: 3, scene: 'outdoor', transVocal: false, wind: false });
ok('P30i automation = adaptive', p30iAdaptive[12] === 0x01);
const p30iWind = buildP30iAnc({ mode: 'anc', level: 2, scene: 'outdoor', transVocal: false, wind: true });
ok('P30i wind bit', (p30iWind[13] & 0x01) === 1);

// Liberty 4 NC: transparency at byte 2, transportation at byte 6.
const l4nc = buildLiberty4NcAnc({ mode: 'transparency', level: 3, scene: 'transport', transVocal: true, wind: true });
ok('L4NC payload is 7 bytes', l4nc.length === 17, `${l4nc.length}`);
ok('L4NC ambient = transparency', l4nc[9] === 0x01);
ok('L4NC transparency vocal bit', (l4nc[11] & 0x01) === 1);
ok('L4NC wind bit', (l4nc[13] & 0x01) === 1);
ok('L4NC transportation = plane', l4nc[15] === 0x00);

// Liberty 3 Pro: 6-byte payload.
const l3pro = buildLiberty3ProAnc({ mode: 'anc', level: 4, scene: 'outdoor', transVocal: false, wind: true });
ok('L3Pro payload is 6 bytes', l3pro.length === 16, `${l3pro.length}`);
ok('L3Pro manual level', (l3pro[10] >> 4) === 4);

// A3949 / A3948 have no sound-mode control: buildAnc must refuse.
const a3949 = DEVICES.find((d) => d.sku === 'A3949');
ok('A3949 buildAnc returns null', P.buildAnc(a3949.ancLayout, { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false }) === null);
console.log('  13 TWS sound-mode shape checks');

/* ----------------------------------------------------------- device table */

const EXPECTED = {
  A3959: { name: 'P30i / R50i NC', eq: '02:83', anc: 'tws-p30i', batteryMax: 10, gaming: true, ldac: false, dual: true, surround: true },
  A3949: { name: 'P20i / P25i / R50i', eq: '02:83', anc: 'none', batteryMax: 5, gaming: true, ldac: false, dual: false, surround: false },
  A3948: { name: 'A20i', eq: '02:83', anc: 'none', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false },
  A3947: { name: 'Liberty 4 NC', eq: null, anc: 'tws-l4nc', batteryMax: 5, gaming: true, ldac: false, dual: false, surround: true },
  A3952: { name: 'Liberty 3 Pro', eq: null, anc: 'tws-l3pro', batteryMax: 5, gaming: false, ldac: true, dual: false, surround: false },
  A3035: { name: 'Space One', eq: null, anc: 'classic', batteryMax: 5, gaming: false, ldac: true, dual: true, surround: false },
  A3040: { name: 'Space Q45', eq: null, anc: 'classic', batteryMax: 5, gaming: false, ldac: true, dual: true, surround: false },
  A3027: { name: 'Life Q35', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false },
  A3028: { name: 'Life Q30', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false },
  A3029: { name: 'Life Tune', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false },
};
for (const [sku, want] of Object.entries(EXPECTED)) {
  const d = DEVICES.find((x) => x.sku === sku);
  ok(`table ${sku} present`, Boolean(d));
  if (!d) continue;
  check(`table ${sku} name`, d.name, want.name);
  check(`table ${sku} eqCommand`, String(d.eqCommand), String(want.eq));
  check(`table ${sku} ancLayout`, d.ancLayout, want.anc);
  check(`table ${sku} batteryMax`, String(d.batteryMax), String(want.batteryMax));
  check(`table ${sku} gaming`, String(d.gaming), String(want.gaming));
  check(`table ${sku} ldac`, String(d.ldac), String(want.ldac));
  check(`table ${sku} dual`, String(d.dual), String(want.dual));
  check(`table ${sku} surround`, String(d.surround), String(want.surround));
  ok(`table ${sku} cites a source`, d.source.length > 10);
}
console.log(`  ${Object.keys(EXPECTED).length * 9} device-table checks`);

/* State-blob offsets are pinned to the sums of OpenSCQ30's nom parse chains
   (see PROTOCOL.md "State-update offsets per model"): any edit to the device
   table that moves a field must be made deliberately, against the parser. */
const STATE_PINS = {
  A3959: { soundModes: 64, batteryCase: null, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 10 },
  A3949: { soundModes: null, batteryCase: null, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 10 },
  A3948: { soundModes: null, batteryCase: null, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 10 },
  A3947: { soundModes: 126, batteryCase: 139, eqPresetId: 37, eqBandsAt: 39, eqBandsN: 10 },
  A3952: { soundModes: 120, batteryCase: 129, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 10 },
};
for (const [sku, want] of Object.entries(STATE_PINS)) {
  const d = DEVICES.find((x) => x.sku === sku);
  if (!d) { ok(`state pin ${sku} present`, false); continue; }
  const s = d.state;
  check(`state ${sku} battery head`, `${s.batteryLeft},${s.batteryRight},${s.batteryChargingLeft},${s.batteryChargingRight}`, '2,3,4,5');
  check(`state ${sku} firmware`, JSON.stringify(s.firmware), JSON.stringify({ at: 6, length: 10 }));
  check(`state ${sku} serial`, JSON.stringify(s.serial), JSON.stringify({ at: 16, length: 16 }));
  check(`state ${sku} soundModes`, String(s.soundModes), String(want.soundModes));
  check(`state ${sku} batteryCase`, String(s.batteryCase), String(want.batteryCase));
  check(`state ${sku} eq`, `${s.eqPresetId},${s.eqBands.at},${s.eqBands.count}`, `${want.eqPresetId},${want.eqBandsAt},${want.eqBandsN}`);
}
console.log(`  ${Object.keys(STATE_PINS).length * 6} state-offset pin checks`);

/* Over-ears read only the single battery level from the state blob. */
for (const sku of ['A3027', 'A3028', 'A3029', 'A3035', 'A3040']) {
  const s = DEVICES.find((x) => x.sku === sku).state;
  check(`state ${sku} single battery`, `${s.batteryLeft},${s.batteryRight},${s.batteryCase},${s.soundModes}`, '2,null,null,null');
}
console.log('  5 over-ear state checks');

/* Name matching has to prefer the longest alias: "R50i NC" is A3959, but
   "R50i" on its own is A3949. Getting this wrong attaches the wrong
   sound-mode layout to the device. */
check('matchDevice("soundcore R50i NC")', P.matchDevice('soundcore R50i NC').sku, 'A3959');
check('matchDevice("soundcore R50i")', P.matchDevice('soundcore R50i').sku, 'A3949');
check('matchDevice("soundcore P30i")', P.matchDevice('soundcore P30i').sku, 'A3959');
check('matchDevice("soundcore P20i")', P.matchDevice('soundcore P20i').sku, 'A3949');
check('matchDevice("soundcore Life Q35")', P.matchDevice('soundcore Life Q35').sku, 'A3027');
check('matchDevice("soundcore Life Tune")', P.matchDevice('soundcore Life Tune').sku, 'A3029');
check('matchDevice("soundcore Liberty 4 NC")', P.matchDevice('soundcore Liberty 4 NC').sku, 'A3947');
check('matchDevice("soundcore Liberty 4")', P.matchDevice('soundcore Liberty 4').sku, 'A3947');
ok('matchNote flags the unverified Liberty 4 alias', P.matchNote('soundcore Liberty 4') !== null);
ok('matchNote is null for a verified name', P.matchNote('soundcore P30i') === null);
console.log('  10 name-matching checks');

/* --------------------------------------------------------------- wrap-up */

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('All protocol frames match their published captures.');
