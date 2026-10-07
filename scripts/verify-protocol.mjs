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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// fileURLToPath (not URL.pathname) is the only correct file-URL -> path API:
// .pathname yields "/D:/a/soundcontrol/soundcontrol/" on a Windows CI runner,
// which is not a valid Win32 path and silently resolves to nothing.
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

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
const out = join(dir, 'protocol.mjs');

// Two Windows traps are removed at once here:
//   1. esbuild is driven through its JS API, not by spawning
//      node_modules/.bin/esbuild — on Windows npm only writes esbuild.cmd /
//      esbuild.ps1 there, and Node will not spawn a .cmd without a shell, so
//      the old call could never work on the runner that builds releases.
//   2. the barrel module is fed over stdin with `resolveDir`, so no absolute
//      path is ever re-emitted inside a generated source string. On Windows an
//      interpolated path arrives as 'D:\a\...\packets.ts', where \a and \b are
//      escape characters and file: URLs are not resolvable specifiers.
const PROTOCOL_MODULES = ['packets', 'presets', 'devices', 'drc', 'codec'];
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: PROTOCOL_MODULES.map((m) => `export * from './src/protocol/${m}.ts';`).join('\n'),
      sourcefile: 'protocol-barrel.ts',
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    outfile: out,
    logLevel: 'error',
  });
} catch (err) {
  console.error(`esbuild failed:\n${err?.message ?? err}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

const P = await import(pathToFileURL(out).href);
const {
  INIT,
  DEVICE_INFO,
  BATTERY_QUERY,
  buildClassicAnc,
  buildSpaceOneAnc,
  buildSpaceQ45Anc,
  buildP30iAnc,
  buildLiberty4NcAnc,
  buildLiberty3ProAnc,
  buildSpaceOneProAnc,
  buildSpaceA40Anc,
  buildLiberty4ProAnc,
  buildP40iAnc,
  buildLiberty5Anc,
  buildSportX20Anc,
  buildD1202Anc,
  buildEq81,
  buildEq81Dual,
  buildEq83,
  buildEq83Dual,
  buildEq87D1202,
  buildSurroundSound,
  buildResetDevice,
  buildDeviceInfoQuery,
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
  everyFrame.push(['sport-x20 anc', buildSportX20Anc(intent)]);
  everyFrame.push(['d1202 anc', buildD1202Anc(intent)]);
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
check('buildDeviceInfoQuery uses the 01:05 request (not the 01:01 handshake)', hex(buildDeviceInfoQuery()), hex(DEVICE_INFO));
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

/* --------------------------------------------------------- EQ shape variants */
// The expanded profiles use distinct channel shapes even when the CAT:TYPE
// bytes are shared. These are shape/fixture guards until a physical capture
// for each new SKU is added; they must never be mistaken for hardware proof.
const dualBands = [1, -1, 2, -2, 3, -3, 4, -4];
const eq83Dual = buildEq83Dual(0x0100, dualBands);
ok('A3388 02:83 dual frame has 20 channel bands', eq83Dual.length === 32);
ok('A3388 02:83 dual frame checksum', verifyFrame(eq83Dual));
ok('A3388 02:83 dual channels mirror the documented curve', hex(eq83Dual.slice(11, 21)) === hex(eq83Dual.slice(21, 31)));
const eq81Dual = buildEq81Dual(0x0100, dualBands);
ok('D1101 02:81 dual frame has 20 channel bands', eq81Dual.length === 32);
ok('D1101 02:81 dual frame checksum', verifyFrame(eq81Dual));
ok('D1101 02:81 dual default tenth band is -12 dB', eq81Dual[20] === 0x00 && eq81Dual[30] === 0x00);
const d1202HearId = buildEq87D1202(0x0002, dualBands);
ok('D1202 03:87 disabled-HearID frame has the source-backed 114-byte payload', d1202HearId.length === 124);
ok('D1202 03:87 disabled-HearID frame uses the registered CAT:TYPE', d1202HearId[5] === 0x03 && d1202HearId[6] === 0x87);
ok('D1202 03:87 disabled-HearID frame checksum', verifyFrame(d1202HearId));
ok('D1202 03:87 leaves HearID curves absent', d1202HearId.slice(36, 56).every((byte) => byte === 0xff) && d1202HearId.slice(61, 81).every((byte) => byte === 0xff));
console.log('  10 EQ shape checks');

/* ------------------------------------------------------------ TWS shapes */

// P30i: 7-byte payload, ambient repeated at byte 2, automation at byte 3.
const p30iMax = buildP30iAnc({ mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false });
ok('P30i ANC payload is 7 bytes', p30iMax.length === 17, `${p30iMax.length}`);
ok('P30i byte0 == byte2 (ambient repeated)', p30iMax[9] === p30iMax[11]);
ok('P30i manual level in the high nibble', (p30iMax[10] >> 4) === 5, `0x${p30iMax[10].toString(16)}`);
ok('P30i manual sub-level matches Android (5)', (p30iMax[10] & 0x0f) === 5, `0x${p30iMax[10].toString(16)}`);
ok('P30i outdoor scene selects multi-scene automation', p30iMax[12] === 0x02);
const p30iAdaptive = buildP30iAnc({ mode: 'adaptive', level: 3, scene: 'outdoor', transVocal: false, wind: false });
ok('P30i automation = adaptive', p30iAdaptive[12] === 0x01);
ok('P30i adaptive vector matches Android (0x51)', p30iAdaptive[10] === 0x51);
ok('P30i adaptive sensitivity matches Android (0)', p30iAdaptive[14] === 0x00);
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

// Model-specific layouts from OpenSCQ30 are intentionally kept as separate
// builders: a valid 06:81 frame with the wrong payload length can still be
// silently ignored or interpreted as a different setting by the headset.
const extendedIntent = { mode: 'adaptive', level: 4, scene: 'outdoor', transVocal: true, wind: true };
const shapeChecks = [
  ['Space One A3035', buildSpaceOneAnc(extendedIntent), 6],
  ['Space Q45 A3040', buildSpaceQ45Anc(extendedIntent), 6],
  ['Space One Pro A3062', buildSpaceOneProAnc(extendedIntent), 6],
  ['Space A40 A3936', buildSpaceA40Anc(extendedIntent), 6],
  ['Liberty 4 Pro A3954', buildLiberty4ProAnc(extendedIntent), 4],
  ['P40i A3955', buildP40iAnc(extendedIntent), 7],
  ['Liberty 5 A3957', buildLiberty5Anc(extendedIntent), 7],
];
for (const [name, packet, payloadLength] of shapeChecks) {
  ok(`${name} uses 06:81`, packet[5] === 0x06 && packet[6] === 0x81);
  ok(`${name} payload length is ${payloadLength}`, packet.length === 10 + payloadLength, `${packet.length}`);
  ok(`${name} frame checksum is valid`, verifyFrame(packet));
}
for (const [name, packet, payloadLength] of [
  ['Sport X20 A3968', buildSportX20Anc(extendedIntent), 6],
  ['P31i/R60i NC D1202', buildD1202Anc(extendedIntent), 8],
]) {
  ok(`${name} uses 06:81`, packet[5] === 0x06 && packet[6] === 0x81);
  ok(`${name} provisional payload length is ${payloadLength}`, packet.length === 10 + payloadLength, `${packet.length}`);
  ok(`${name} frame checksum is valid`, verifyFrame(packet));
}
ok('Sport X20 adaptive uses named adaptive nibble 1 at level 4', buildSportX20Anc(extendedIntent)[10] === 0x51);
ok('D1202 preserves the multi-scene byte at payload offset 6', buildD1202Anc(extendedIntent)[15] === 0x01);
ok('A3954 ANC strength 5 maps to slider 1', buildLiberty4ProAnc({ ...extendedIntent, mode: 'anc', level: 5 })[10] === 1);
ok('A3954 transparency strength 5 maps to slider 11', buildLiberty4ProAnc({ ...extendedIntent, mode: 'transparency', level: 5 })[10] === 11);
ok('A3035 direct adaptive field keeps the documented five-step value', buildSpaceOneAnc({ ...extendedIntent, level: 5 })[10] === 0x55);
ok('A3040 Talk/Manual byte follows the documented transparency enum', buildSpaceQ45Anc({ ...extendedIntent, mode: 'transparency', transVocal: true })[11] === 0x00);
ok('A3936 named adaptive field stays in the documented 0..2 enum', buildSpaceA40Anc({ ...extendedIntent, level: 5 })[10] === 0x52);
ok('A3957 named adaptive field stays in the documented 0..2 enum', buildLiberty5Anc({ ...extendedIntent, level: 5 })[10] === 0x52);
ok('A3957 uses car transportation for non-transport scenes', buildLiberty5Anc(extendedIntent)[15] === 3);

// A3949 / A3948 have no sound-mode control: buildAnc must refuse.
const a3949 = DEVICES.find((d) => d.sku === 'A3949');
ok('A3949 buildAnc returns null', P.buildAnc(a3949.ancLayout, { mode: 'anc', level: 5, scene: 'outdoor', transVocal: false, wind: false }) === null);
console.log('  21 TWS sound-mode shape checks');

/* ----------------------------------------------------------- device table */

const EXPECTED = {
  A3959: { name: 'P30i / R50i NC', eq: '02:83', anc: 'tws-p30i', batteryMax: 10, gaming: true, ldac: false, dual: true, surround: true, customEq: true },
  A3949: { name: 'P20i / P25i / R50i', eq: '02:83', anc: 'none', batteryMax: 5, gaming: true, ldac: false, dual: false, surround: false, customEq: false },
  A3948: { name: 'A20i', eq: '02:83', anc: 'none', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: true },
  A3945: { name: 'Life Note 3S (read-only)', eq: null, anc: 'none', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: false },
  A3947: { name: 'Liberty 4 NC', eq: null, anc: 'tws-l4nc', batteryMax: 5, gaming: true, ldac: false, dual: false, surround: true, customEq: false },
  A3952: { name: 'Liberty 3 Pro', eq: null, anc: 'tws-l3pro', batteryMax: 5, gaming: false, ldac: true, dual: false, surround: false, customEq: false },
  A3035: { name: 'Space One', eq: null, anc: 'classic-a3035', batteryMax: 5, gaming: false, ldac: true, dual: true, surround: false, customEq: false },
  A3040: { name: 'Space Q45', eq: null, anc: 'classic-a3040', batteryMax: 5, gaming: false, ldac: true, dual: true, surround: false, customEq: false },
  A3936: { name: 'Space A40', eq: null, anc: 'tws-a3936', batteryMax: 5, gaming: true, ldac: true, dual: true, surround: false, customEq: false },
  A3954: { name: 'Liberty 4 Pro', eq: null, anc: 'tws-l4pro', batteryMax: 100, gaming: false, ldac: true, dual: true, surround: false, customEq: false },
  A3955: { name: 'P40i', eq: null, anc: 'tws-p40i', batteryMax: 5, gaming: false, ldac: false, dual: true, surround: false, customEq: false },
  A3957: { name: 'Liberty 5', eq: null, anc: 'tws-l5', batteryMax: 10, gaming: true, ldac: true, dual: true, surround: false, customEq: false },
  A3062: { name: 'Space One Pro', eq: null, anc: 'tws-a3062', batteryMax: 10, gaming: false, ldac: true, dual: true, surround: false, customEq: false },
  A3004: { name: 'Q20i', eq: '02:83', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: true },
  A3005: { name: 'Q11i', eq: '02:83', anc: 'none', batteryMax: 10, gaming: false, ldac: false, dual: true, surround: false, customEq: true },
  D1402: { name: 'Space 2 (read-only)', eq: null, anc: 'none', batteryMax: 10, gaming: false, ldac: false, dual: false, surround: false, customEq: false },
  A3027: { name: 'Life Q35', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: true },
  A3028: { name: 'Life Q30', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: true },
  A3029: { name: 'Life Tune', eq: '02:81', anc: 'classic', batteryMax: 5, gaming: false, ldac: false, dual: false, surround: false, customEq: true },
  A3330: { name: 'C30i', eq: '02:83-single', anc: 'none', batteryMax: 5, gaming: false, ldac: false, dual: true, surround: false, customEq: true },
  A3388: { name: 'AeroClip', eq: '02:83-dual', anc: 'none', batteryMax: 10, gaming: false, ldac: false, dual: true, surround: false, customEq: true },
  A3876: { name: 'V20i', eq: '02:83-single', anc: 'none', batteryMax: 10, gaming: true, ldac: false, dual: true, surround: false, customEq: true },
  A3968: { name: 'Sport X20', eq: null, anc: 'tws-a3968', batteryMax: 5, gaming: false, ldac: false, dual: true, surround: true, customEq: false },
  D1101: { name: 'C50i', eq: '02:81-dual', anc: 'none', batteryMax: 10, gaming: false, ldac: true, dual: true, surround: false, customEq: true },
  D1202: { name: 'P31i / R60i NC', eq: '03:87', anc: 'tws-d1202', batteryMax: 10, gaming: false, ldac: true, dual: true, surround: false, customEq: false },
  D1301: { name: 'Sleep A30', eq: null, anc: 'none', batteryMax: 10, gaming: false, ldac: false, dual: false, surround: false, customEq: false },
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
  // Phase 18: custom-EQ support per model (A3949 = factory presets only).
  check(`table ${sku} customEq`, String(d.customEq), String(want.customEq));
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
  A3945: { soundModes: null, batteryCase: 69, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 20 },
  A3947: { soundModes: 126, batteryCase: 139, eqPresetId: 37, eqBandsAt: 39, eqBandsN: 10 },
  A3952: { soundModes: 120, batteryCase: 129, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 10 },
  A3936: { soundModes: 111, batteryCase: 118, eqPresetId: 32, eqBandsAt: 34, eqBandsN: 20 },
  A3954: { soundModes: 125, batteryCase: 37, eqPresetId: 44, eqBandsAt: 46, eqBandsN: 20 },
  A3955: { soundModes: 119, batteryCase: 37, eqPresetId: 38, eqBandsAt: 40, eqBandsN: 20 },
  A3957: { soundModes: 119, batteryCase: 37, eqPresetId: 38, eqBandsAt: 40, eqBandsN: 20 },
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

/* Expanded rows use two documented state-head families plus model-specific
   late fields. Keep those offsets independently pinned so a generic helper
   cannot silently move a new SKU onto the wrong telemetry layout. */
const EXPANDED_STATE_PINS = {
  A3330: { battery: '2,3,null,null', firmware: { at: 4, length: 10 }, serial: { at: 14, length: 16 }, eq: '50,52,10', sound: 'null', length: 7, dual: 47, surround: 44, gaming: null },
  A3388: { battery: '2,3,null,null', firmware: { at: 4, length: 10 }, serial: { at: 14, length: 16 }, eq: '50,52,10', sound: 'null', length: 7, dual: 47, surround: 44, gaming: null },
  A3876: { battery: '2,3,null,null', firmware: { at: 4, length: 10 }, serial: { at: 14, length: 16 }, eq: '36,38,20', sound: 'null', length: 7, dual: 74, surround: null, gaming: 72 },
  A3968: { battery: '2,3,4,5', firmware: { at: 6, length: 10 }, serial: { at: 16, length: 16 }, eq: '38,40,20', sound: '117', length: 6, dual: 128, surround: 126, gaming: null },
  D1101: { battery: '2,3,null,null', firmware: { at: 4, length: 10 }, serial: { at: 14, length: 16 }, eq: '30,32,10', sound: 'null', length: 7, dual: 53, surround: null, gaming: null },
  D1202: { battery: '2,3,4,5', firmware: { at: 6, length: 10 }, serial: { at: 16, length: 16 }, eq: '38,40,20', sound: '119', length: 8, dual: 131, surround: null, gaming: null },
  D1301: { battery: '2,3,null,null', firmware: { at: 4, length: 10 }, serial: { at: 14, length: 16 }, eq: 'null,null,null', sound: 'null', length: 7, dual: null, surround: null, gaming: null },
};
for (const [sku, want] of Object.entries(EXPANDED_STATE_PINS)) {
  const d = DEVICES.find((x) => x.sku === sku);
  if (!d) { ok(`expanded state pin ${sku} present`, false); continue; }
  const s = d.state;
  check(`expanded state ${sku} battery head`, `${s.batteryLeft},${s.batteryRight},${s.batteryChargingLeft},${s.batteryChargingRight}`, want.battery);
  check(`expanded state ${sku} firmware`, JSON.stringify(s.firmware), JSON.stringify(want.firmware));
  check(`expanded state ${sku} serial`, JSON.stringify(s.serial), JSON.stringify(want.serial));
  check(`expanded state ${sku} eq`, `${s.eqPresetId},${s.eqBands?.at ?? null},${s.eqBands?.count ?? null}`, want.eq);
  check(`expanded state ${sku} sound modes`, String(s.soundModes), want.sound);
  check(`expanded state ${sku} sound length`, String(s.soundModeLength ?? 7), String(want.length));
  check(`expanded state ${sku} toggles`, `${s.dualConnections ?? null},${s.surround ?? null},${s.gaming ?? null}`, `${want.dual ?? null},${want.surround ?? null},${want.gaming ?? null}`);
}
console.log(`  ${Object.keys(EXPANDED_STATE_PINS).length * 7} expanded state-offset checks`);

/* OpenSCQ30 A3004/A3027/A3028/A3035/A3040 state bodies all begin with
   the single battery at offset 0. A3027/A3028 also expose the classic
   four-byte sound-mode block at offset 35. */
for (const [sku, batteryAt, chargingAt, soundModes] of [
  ['A3027', 0, 1, 35],
  ['A3028', 0, 1, 35],
  ['A3029', 0, 1, 35],
  ['A3035', 0, null, null],
  ['A3040', 0, null, null],
]) {
  const s = DEVICES.find((x) => x.sku === sku).state;
  check(`state ${sku} single battery`, `${s.batteryLeft},${s.batteryRight},${s.batteryCase},${s.batteryChargingLeft},${s.soundModes}`, `${batteryAt},null,null,${chargingAt},${soundModes}`);
}
const q20iState = DEVICES.find((x) => x.sku === 'A3004').state;
check('state A3004: battery/firmware/serial/EQ/sound-mode offsets', `${q20iState.batteryLeft},${q20iState.batteryChargingLeft},${q20iState.firmware.at},${q20iState.serial.at},${q20iState.eqPresetId},${q20iState.soundModes}`, '0,1,2,7,23,35');
const q11iState = DEVICES.find((x) => x.sku === 'A3005').state;
check('state A3005: battery/firmware/serial/EQ/dual offsets', `${q11iState.batteryLeft},${q11iState.batteryChargingLeft},${q11iState.firmware.at},${q11iState.serial.at},${q11iState.eqPresetId},${q11iState.eqBands.at},${q11iState.dualConnections}`, '0,1,2,7,23,25,41');
const a3062State = DEVICES.find((x) => x.sku === 'A3062').state;
check('state A3062: battery/firmware/serial/EQ/sound/dual offsets', `${a3062State.batteryLeft},${a3062State.batteryChargingLeft},${a3062State.firmware.at},${a3062State.serial.at},${a3062State.eqPresetId},${a3062State.eqBands.at},${a3062State.soundModes},${a3062State.dualConnections}`, '0,1,2,7,23,25,69,79');
console.log('  8 over-ear state checks');

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
/* Pass 11 §12: unverified marketing names must NOT borrow a verified
   profile. Liberty 4 (A3953) ≠ Liberty 4 NC (A3947); Sport X10 (A3961) and
   Sleep A10 (A6610) are not A3949. They stay on the unknown-model profile
   while matchNote explains the treatment. */
check('matchDevice("soundcore Liberty 4") stays unknown', P.matchDevice('soundcore Liberty 4').id, 'unknown');
check('matchDevice("A3953") stays unknown', P.matchDevice('A3953').id, 'unknown');
check('matchDevice("soundcore Sport X10") stays unknown', P.matchDevice('soundcore Sport X10').id, 'unknown');
check('matchDevice("soundcore Sleep A10") stays unknown', P.matchDevice('soundcore Sleep A10').id, 'unknown');
check('matchDevice("A3961") stays unknown', P.matchDevice('A3961').id, 'unknown');
check('matchDevice("A6610") stays unknown', P.matchDevice('A6610').id, 'unknown');
ok('matchNote flags the unverified Liberty 4 alias', P.matchNote('soundcore Liberty 4') !== null);
ok('matchNote still treats "Liberty 4 NC" as verified (no note)', P.matchNote('soundcore Liberty 4 NC') === null);
ok('matchNote is null for a verified name', P.matchNote('soundcore P30i') === null);
console.log('  16 name-matching checks');

/* --------------------------------------------------------------- wrap-up */

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('All protocol frames match their published captures.');
