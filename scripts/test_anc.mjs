#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = resolve(fileURLToPath(import.meta.url), '../..');
const dir = mkdtempSync(join(tmpdir(), 'a3959-anc-'));
try {
  const out = join(dir, 'test.mjs');
  await build({ stdin: { contents: [
    'protocol/packets', 'protocol/p30i', 'protocol/p30iSequence', 'protocol/ancExchange', 'protocol/diagnosticPrivacy',
    'protocol/devices', 'protocol/modelRegistry', 'protocol/codec', 'protocol/responses', 'state/derive',
  ].map(p => `export * from './src/${p}.ts';`).join('\n'), resolveDir: root, loader: 'ts' }, outfile: out, bundle: true, platform: 'node', format: 'esm' });
  const m = await import(pathToFileURL(out).href);
  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/a3959-anc.json'), 'utf8'));
  const before = Uint8Array.from(fixture.observedFixture);
  let count = 0;
  for (const v of fixture.vectors) {
    const pkt = m.buildP30iAnc({ ...v.intent, p30iState: before });
    assert.equal(m.toHex(pkt), v.expected, v.name);
    assert.equal(pkt.length, 17); assert.equal(pkt[7], 17); assert.equal(pkt[8], 0);
    assert(m.verifyFrame(pkt)); assert.equal(pkt[13] & 2, 0, 'never write wind detected');
    assert.equal(pkt[10] & 15, before[1] & 15, 'adaptive strength preserved');
    assert.equal(pkt[14], before[5], 'sensitivity preserved');
    let writes = 0;
    const transport = { kind: 'bridge', label: 'synthetic', write: async () => { writes++; }, close: async () => {} };
    await m.withDeviceBoundary(transport, () => m.matchDevice('P30i')).write(pkt);
    await assert.rejects(() => m.withDeviceBoundary(transport, () => m.matchDevice('R50i')).write(pkt));
    await assert.rejects(() => m.withDeviceBoundary(transport, () => m.matchDevice('unknown')).write(pkt));
    assert.equal(writes, 1);
    const path = m.planP30iAnc(before, pkt.slice(9, -1));
    assert(m.p30iReportMatches(path.at(-1).slice(9, -1), pkt.slice(9, -1)));
    let prev = before;
    for (const frame of path) {
      assert(m.verifyFrame(frame));
      const p = frame.slice(9, -1);
      const diff = [p[0] !== prev[0], p[3] !== prev[3], p[1] >> 4 !== prev[1] >> 4,
        p[6] !== prev[6], (p[4] & 1) !== (prev[4] & 1)];
      assert(diff.filter(Boolean).length <= 1, 'one logical field per step');
      if (diff[1]) assert.equal(prev[0], 0, 'automation requires NC');
      if (diff[2]) { assert.equal(prev[0], 0); assert.equal(prev[3], 0); }
      if (diff[3]) { assert.equal(prev[0], 0); assert.equal(prev[3], 2); }
      if (diff[4]) assert.notEqual(prev[0], 2, 'wind requires NC or transparency');
      prev = p;
    }
    count++;
  }
  const detected = m.frame(6, 0x81, [0,0x51,0,0,2,0,1]);
  await assert.rejects(() => m.withDeviceBoundary({ kind: 'bridge', label: 'test', write: async () => { throw new Error('must not reach wire'); }, close: async () => {} }, () => m.matchDevice('P30i')).write(detected), /read-only/);
  // Test the independently parsed inbound shape, not just outbound round trips.
  const report = [0, 0x42, 1, 1, 3, 10, 2];
  assert.deepEqual(m.parseSoundModes(report, 'tws-p30i'), {
    mode: 'adaptive', level: 4, automation: 1, adaptiveStrength: 2, adaptiveSensitivity: 10, wind: true, scene: 'indoor',
  });
  assert.equal(m.parseSoundModes(report.slice(0, 5), 'tws-p30i'), null);
  // Byte 5 (read-only adaptive sensitivity) is deliberately NOT range-checked:
  // a recorded real A3959 reports 0xFF there. Semantic bytes stay strict.
  for (const [i, invalid] of [[0,3],[1,0x60],[1,0x16],[2,3],[3,3],[4,4],[6,3]]) {
    const bad = [...report]; bad[i] = invalid;
    assert.equal(m.parseSoundModes(bad, 'tws-p30i'), null);
  }
  assert(!m.p30iReportMatches(Uint8Array.from(report), Uint8Array.from([2,0x42,2,1,1,10,2])));
  const exchange = new m.AncExchange();
  await assert.rejects(exchange.run(async () => {}, () => false, 'no reply', 5), /timeout/);
  await assert.rejects(exchange.run(async () => { throw new Error('write failed'); }, () => true, 'send'), /write failed/);
  const reply = Uint8Array.from(report);
  const wait = exchange.run(async () => { exchange.receive(reply); }, f => f[0] === 0, 'reply before write completion');
  assert.equal(await wait, reply);
  const cancelled = exchange.run(async () => {}, () => false, 'cancel');
  exchange.cancel(); await assert.rejects(cancelled, /session changed/);
  // Out-of-order / unrelated reports cannot finish an outstanding read.
  let done = false;
  const w = exchange.run(async () => {}, f => f[0] === 9, 'match', 100).then(() => { done = true; });
  exchange.receive(reply); await Promise.resolve(); assert(!done);
  exchange.receive(Uint8Array.of(9)); await w;
  const serialReply = m.frame(1, 5, [...Buffer.from('01.6001.60PRIVATE-SERIAL!!')]);
  serialReply[0] = 9;
  assert(m.diagnosticFrame(serialReply).includes('XX')); assert(!m.diagnosticFrame(serialReply).includes('50 52 49 56'));

  /* ------------------------------------------------------------------ */
  /* RECORDED HARDWARE EVIDENCE — OpenSCQ30 device-faker A3959 recording */
  /* ------------------------------------------------------------------ */
  const rec = JSON.parse(readFileSync(join(root, 'tests/fixtures/a3959-recorded-state.json'), 'utf8'));
  const payload = Uint8Array.from(rec.payload);
  assert.equal(payload.length, 91, 'recorded A3959 state payload is 91 bytes');
  assert.equal(rec.payload[16], 0x58, 'serial redacted in the committed fixture');
  const dualFw = Buffer.from(payload.slice(rec.offsets.dualFirmware, rec.offsets.dualFirmware + 10)).toString('latin1');
  assert.equal(dualFw.slice(0, 5), rec.provenance.firmwareAscii, 'left-bud firmware from the recording');
  assert.equal(dualFw.slice(5, 10), rec.provenance.firmwareAscii, 'right-bud firmware from the recording');
  assert(m.dualFirmwareAtLeast(dualFw, '01.60'), 'recorded firmware 01.64 passes the A3959 gaming gate');
  const block = payload.slice(rec.offsets.soundModes, rec.offsets.soundModes + 7);
  assert.equal(m.toHex(block), '00 55 00 00 01 FF 01', 'recorded sound-mode block');

  // The regression that mattered most: Phase 19 rejected this real device
  // (byte 5 = 0xFF) and therefore never sent an ANC frame at all.
  assert(m.validP30iSoundModes(block), 'a real recorded state must be commandable');
  assert(!m.p30iSensitivityInDocumentedRange(block), '0xFF is outside the documented 0..10 range (diagnostic only)');
  assert.deepEqual(m.parseSoundModes(block, 'tws-p30i'), {
    mode: 'anc', level: 5, automation: 0, adaptiveStrength: 5, adaptiveSensitivity: 255, wind: true, scene: 'outdoor',
  });

  // Offset map: pin every trailing field against the recording's own labels.
  const states = m.DEVICES.find((d) => d.sku === 'A3959').state;
  assert.equal(states.soundModes, rec.offsets.soundModes);
  assert.equal(states.dualConnections, rec.offsets.dualConnections);
  assert.equal(states.surround, rec.offsets.surroundSound);
  assert.equal(states.gaming, rec.offsets.gamingMode, 'gaming byte must be 78 (auto_power_off is 2 bytes)');
  assert.equal(payload[rec.offsets.dualConnections], 0x01);
  assert.equal(payload[rec.offsets.surroundSound], 0x00);
  assert.equal(payload[rec.offsets.autoPowerOff], 0x01);
  assert.equal(payload[rec.offsets.autoPowerOff + 1], 0x00);
  assert.equal(payload[rec.offsets.lowBatteryPrompt], 0x01);
  assert.equal(payload[rec.offsets.gamingMode], 0x00);
  assert.equal(m.requiredStateLength(states), 79, 'A3959 needs 79 payload bytes to read the gaming byte at 78');
  const toggles = m.parseDeviceToggles(payload, states);
  assert.deepEqual(toggles, { gaming: false, surround: false, dual: true }, 'recorded toggles (firmware 01.64 passes the 01.60 gate)');

  // State-preserving re-encode off the recorded block.
  for (const intent of [
    { mode: 'anc', level: 5, wind: true, scene: 'outdoor' },
    { mode: 'transparency', level: 3, wind: true, scene: 'indoor' },
    { mode: 'normal', level: 1, wind: false, scene: 'transport' },
    { mode: 'adaptive', level: 5, wind: true, scene: 'outdoor' },
  ]) {
    const pkt = m.buildP30iAnc({ ...intent, transVocal: false, p30iState: block });
    const p = pkt.slice(9, -1);
    assert.equal(p[1] & 15, block[1] & 15, 'recorded adaptive strength preserved');
    assert.equal(p[5], block[5], 'read-only sensitivity passed through verbatim (0xFF stays 0xFF)');
    assert.equal(p[4] & 2, 0, 'never write the wind-detected bit');
    assert(m.verifyFrame(pkt));
  }

  /* --------------------------- sequence behaviour --------------------------- */
  // Ordering, abort-on-timeout and "a write is not a confirmation" are the
  // properties Task 5/6 ask for; they are proved with fakes, not hardware.
  const base = Uint8Array.from([0, 0x55, 0, 0, 1, 0xFF, 1]);
  const target = Uint8Array.from([1, 0x55, 1, 0, 1, 0xFF, 1]);

  async function runSeq(overrides = {}) {
    const events = [];
    const deps = {
      // A device that actually applies the request reports `target` afterwards.
      readState: async (phase) => { events.push(`read:${phase}`); return Uint8Array.from(phase === 'post' ? target : base); },
      buildTarget: () => Uint8Array.from(target),
      write: async (frame) => { events.push(`write:${m.toHex(frame.slice(9, -1))}`); },
      awaitReply: async () => { events.push('reply'); },
      settled: () => true,
      meta: () => ({ channel: 15, session: 'synthetic' }),
      log: (line) => events.push(`log:${line.split(' ')[0]}`),
      ...overrides,
    };
    const result = await m.runP30iAncAction(
      deps,
      { mode: 'transparency', level: 5, scene: 'outdoor', wind: true, label: 'test' },
      m.planP30iAnc,
      m.p30iReportMatches,
    );
    return { events, result };
  }

  const ok = await runSeq();
  assert.deepEqual(ok.events.filter((e) => !e.startsWith('log:')), [
    'read:pre',
    `write:${m.toHex(m.planP30iAnc(base, target)[0].slice(9, -1))}`,
    'reply',
    'read:post',
  ], 'pre-read → write → reply → read-back, with no invented delays');
  assert(ok.events.some((e) => e.startsWith('log:ANC_ACTION')), 'ANC_ACTION logged');
  assert.equal(ok.result.confirmed, true);
  assert.equal(ok.result.steps, 1);

  // A reply timeout must abort the sequence (no silent success, no retry storm).
  let wroteAfterFailure = 0;
  await assert.rejects(
    () => runSeq({ awaitReply: async () => { throw new Error('06:81 reply timeout'); }, write: async () => { wroteAfterFailure++; } }),
    /timeout/,
  );
  assert.equal(wroteAfterFailure, 1, 'a failed reply stops the sequence after the step that timed out');

  // A failing pre-read means NOTHING is written at all.
  let writesWithFailedRead = 0;
  await assert.rejects(
    () => runSeq({ readState: async () => { throw new Error('01:01 A3959 state timeout'); }, write: async () => { writesWithFailedRead++; } }),
    /timeout/,
  );
  assert.equal(writesWithFailedRead, 0, 'no frame is ever sent without a fresh validated device state');

  // Losing the session mid-sequence stops before the next write.
  await assert.rejects(
    () => runSeq({ settled: () => false }),
    /session changed/,
  );

  // Device report that does not match the request is never called confirmed.
  const mismatch = await runSeq({ readState: async (phase) => (phase === 'post' ? Uint8Array.from([2, 0x55, 2, 0, 1, 0xFF, 1]) : Uint8Array.from(base)) });
  assert.equal(mismatch.result.confirmed, false, 'a mismatching device report is not a confirmation');
  console.log(`ANC: ${count} exact synthetic vectors + recorded A3959 hardware payload (offsets 64..70, 91-byte layout, 0xFF passthrough) + model gates, transition dependencies, sequence ordering/abort semantics, independent inbound parsing, read-only bits, cancellation, privacy checks passed. PHYSICAL RESULT: NOT TESTED.`);
} finally { rmSync(dir, { recursive: true, force: true }); }
