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
    'protocol/packets', 'protocol/p30i', 'protocol/ancExchange', 'protocol/diagnosticPrivacy',
    'protocol/devices', 'protocol/modelRegistry', 'protocol/codec', 'state/derive',
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
  for (const [i, invalid] of [[0,3],[1,0x60],[1,0x16],[2,3],[3,3],[4,4],[5,11],[6,3]]) {
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
  console.log(`ANC: ${count} exact synthetic vectors + model gates, transition dependencies, independent inbound parsing, read-only bits, timeout/failure/cancellation, privacy checks passed. PHYSICAL RESULT: NOT TESTED.`);
} finally { rmSync(dir, { recursive: true, force: true }); }
