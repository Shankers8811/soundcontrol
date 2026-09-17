#!/usr/bin/env node
/**
 * Startup-race / bridge-lifecycle e2e harness — deterministic, no Windows,
 * no Bluetooth hardware, no Electron binary required.
 *
 *   npm run test:e2e        (scripts/emulated_bridge.py provides the helper)
 *
 * What is emulated, and with which real code:
 *
 *   Electron main process   → the readiness-probe loop below is a faithful
 *                             port of probeBridge/waitForBridgeReady from
 *                             electron-main.cjs (HTTP /health + Bearer token,
 *                             200ms cadence, 12s budget, child-exit check).
 *   Python helper           → the REAL soundcore_bridge.py server (token
 *                             auth, origin allowlist, WS JSON protocol,
 *                             channel probe), with only the RFCOMM socket
 *                             layer and the Windows PnP scan replaced by
 *                             deterministic fakes (scripts/emulated_bridge.py).
 *   Renderer                → the REAL src/transports/bridge.ts, bundled with
 *                             esbuild and executed here with minimal DOM
 *                             stubs (location, window.electronAPI token IPC).
 *
 * Scenarios:
 *   1. cold-start race      — helper binds after 3.5s while the renderer is
 *                             already connecting; the connect must survive it
 *                             (the old 2.5s one-shot timer failed here), then
 *                             tx→rx, deliberate disconnect (no false "link
 *                             down"), reconnect, and an unexpected helper
 *                             death (must report the dropped link).
 *   2. token mismatch       — must reject promptly with an auth-specific
 *                             error, not a generic "helper not running".
 *   3. helper never starts  — must reject after the full 15s budget with a
 *                             "did not become ready" error (runs in real
 *                             time on purpose: it tests the shipped constant).
 *   4. HTTP/WS surface      — hello carries the device list, scan works,
 *                             /scan without token → 401, foreign origin → 403,
 *                             local dev origin → 200, WS handshake with a bad
 *                             token → refused.
 *
 * Limitation (documented for CI): the RFCOMM layer, PowerShell enumeration
 * and Electron itself are fakes/ports; physical Bluetooth behaviour can only
 * be verified on a Windows machine with real hardware (see the smoke-windows
 * workflow for the packaged-app launch test).
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// fileURLToPath is the only correct file-URL → path conversion on Windows CI.
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const EMULATOR = join(ROOT, 'scripts', 'emulated_bridge.py');
const PYTHON = process.env.SOUNDCONTROL_E2E_PYTHON || 'python3';

// src/transports/bridge.ts hardcodes the helper port (loopback only).
const BRIDGE_PORT = 8765;
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;

// Mirrors electron-main.cjs: waitForBridgeReady(child, budgetMs = 12000).
const ELECTRON_READINESS_BUDGET_MS = 12000;
// What scenario 1 waits before the emulated helper binds. Must exceed the
// old 2500ms renderer timer (the regression this harness guards) and stay
// well inside both readiness budgets.
const COLD_START_DELAY_S = 3.5;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof WebSocket === 'undefined' || typeof fetch !== 'function') {
  console.error('This harness needs Node >= 21 (global WebSocket + fetch).');
  process.exit(1);
}

/* ------------------------------------------------------- renderer bundling */

const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-e2e-'));
const bundlePath = join(dir, 'renderer-bridge.mjs');
try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: `export * from './src/transports/bridge.ts';`,
      sourcefile: 'renderer-bridge-barrel.ts',
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: bundlePath,
    logLevel: 'error',
  });
} catch (err) {
  console.error(`esbuild failed:\n${err?.message ?? err}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

// Minimal DOM the renderer bridge module expects. `sessionToken` is what the
// stubbed IPC hands out — per scenario, mimicking electron-main.cjs minting a
// fresh secret and preload.cjs exposing it via getBridgeToken().
let sessionToken = null;
globalThis.location = { protocol: 'file:', hostname: '' };
globalThis.window = {
  electronAPI: {
    isElectron: true,
    platform: 'win32',
    version: 'e2e',
    getBridgeToken: async () => sessionToken,
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

let importSeq = 0;
async function freshRenderer() {
  // A new query per import gives a fresh module instance, so the renderer's
  // token cache (and everything else) starts clean for each scenario.
  importSeq += 1;
  return await import(`${pathToFileURL(bundlePath).href}?scenario=${importSeq}`);
}

/* ------------------------------------------------------ helper management */

function spawnHelper({ token, startupDelay = 0 }) {
  const child = spawn(
    PYTHON,
    [EMULATOR, '--host', '127.0.0.1', '--port', String(BRIDGE_PORT), '--startup-delay', String(startupDelay)],
    {
      // Same channel Electron uses for the real helper: env, never argv.
      env: { ...process.env, SOUNDCONTROL_BRIDGE_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.logs = [];
  child.stdout.on('data', (d) => child.logs.push(`[out] ${String(d).trim()}`));
  child.stderr.on('data', (d) => child.logs.push(`[err] ${String(d).trim()}`));
  child.exited = new Promise((r) => child.once('exit', r));
  return child;
}

async function killHelper(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  await Promise.race([child.exited, sleep(3000)]);
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    await Promise.race([child.exited, sleep(1000)]);
  }
}

/** Port-level probe; resolves with the HTTP status or null (nothing listening). */
async function probeHealth(token, timeoutMs = 1200) {
  try {
    const res = await fetch(`${BRIDGE_BASE}/health`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status;
  } catch {
    return null;
  }
}

/** Faithful port of electron-main.cjs waitForBridgeReady. */
async function waitForHelperReady(child, token, budgetMs = ELECTRON_READINESS_BUDGET_MS) {
  const started = Date.now();
  const deadline = started + budgetMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return { ready: false, elapsed: Date.now() - started, exited: true };
    }
    if ((await probeHealth(token, 800)) === 200) {
      return { ready: true, elapsed: Date.now() - started, exited: false };
    }
    await sleep(200);
  }
  return { ready: false, elapsed: Date.now() - started, exited: false };
}

function rawHttpRequest(path, { token = null, origin = null } = {}) {
  return new Promise((resolvePromise, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin; // fetch forbids Origin; http does not
    const req = http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path, headers, timeout: 3000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolvePromise({ status: res.statusCode, body }));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('http timeout'));
    });
    req.on('error', reject);
  });
}

function openRawWs(token, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}/ws?token=${encodeURIComponent(token)}`);
    const t = setTimeout(() => {
      try { ws.close(); } catch { /* */ }
      reject(new Error('raw ws: open timed out'));
    }, timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(t);
      resolvePromise(ws);
    });
    ws.addEventListener('error', () => {
      clearTimeout(t);
      reject(new Error('raw ws: handshake refused'));
    });
  });
}

function nextMessage(ws, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    const t = setTimeout(() => {
      ws.removeEventListener('message', onMsg);
      reject(new Error('ws message timed out'));
    }, timeoutMs);
    const onMsg = (ev) => {
      clearTimeout(t);
      ws.removeEventListener('message', onMsg);
      resolvePromise(JSON.parse(String(ev.data)));
    };
    ws.addEventListener('message', onMsg);
  });
}

/* ------------------------------------------------------------ frame tools */

/** The `01:0A` state request every supported device answers (see PROTOCOL.md). */
const STATE_REQUEST = Uint8Array.from(
  '08EE00000001010A0002'.match(/../g).map((h) => parseInt(h, 16)),
);

function frameIsValid(data) {
  if (data.length < 10 || data[0] !== 0x09 || data[1] !== 0xff) return false;
  let sum = 0;
  for (let i = 0; i < data.length - 1; i++) sum = (sum + data[i]) & 0xff;
  return sum === data[data.length - 1];
}

function waitForRx(rxLog, timeoutMs = 4000) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const t = setInterval(() => {
      if (rxLog.length) {
        clearInterval(t);
        resolvePromise(rxLog[0]);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(t);
        reject(new Error('no rx frame arrived'));
      }
    }, 25);
  });
}

const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/* =========================================================== scenario 0 */

async function scenarioConstants() {
  console.log('\nScenario 0: startup budget constants');
  const mod = await freshRenderer();
  check('renderer exports BRIDGE_STARTUP_TIMEOUT_MS', typeof mod.BRIDGE_STARTUP_TIMEOUT_MS === 'number');
  check(
    'renderer budget is 15s (was 2.5s — the startup race)',
    mod.BRIDGE_STARTUP_TIMEOUT_MS === 15000,
    `got ${mod.BRIDGE_STARTUP_TIMEOUT_MS}`,
  );
  check(
    'renderer budget outlasts the 12s Electron-side helper readiness budget',
    mod.BRIDGE_STARTUP_TIMEOUT_MS > ELECTRON_READINESS_BUDGET_MS,
    `${mod.BRIDGE_STARTUP_TIMEOUT_MS} vs ${ELECTRON_READINESS_BUDGET_MS}`,
  );
}

/* =========================================================== scenario 1 */

async function scenarioColdStartRace() {
  console.log(`\nScenario 1: cold-start race (helper binds after ${COLD_START_DELAY_S}s)`);
  const token = randomToken();
  sessionToken = token;
  const helper = spawnHelper({ token, startupDelay: COLD_START_DELAY_S });
  const mod = await freshRenderer();
  try {
    const rxLog = [];
    const sysLog = [];
    const downLog = [];

    // Fire both sides of the race concurrently, exactly as a real launch does:
    // Electron polls readiness while the renderer already tries to connect.
    const started = Date.now();
    const [readiness, conn] = await Promise.all([
      waitForHelperReady(helper, token),
      mod.connectBridge(
        'AA:BB:CC:DD:EE:FF',
        (data) => rxLog.push(data),
        'Soundcore Liberty 4 NC',
        80,
        (text, isError) => sysLog.push({ text, isError }),
        (reason) => downLog.push(reason),
      ).then(
        (result) => ({ ok: true, result, elapsed: Date.now() - started }),
        (err) => ({ ok: false, message: err?.message ?? String(err), elapsed: Date.now() - started }),
      ),
    ]);

    check(
      'Electron-side readiness probe saw the helper inside its 12s budget',
      readiness.ready && readiness.elapsed >= COLD_START_DELAY_S * 1000 - 500 && readiness.elapsed < ELECTRON_READINESS_BUDGET_MS,
      JSON.stringify(readiness),
    );
    check(
      'renderer connected through the cold-start window (old 2.5s timer died here)',
      conn.ok,
      conn.message ?? '',
    );
    if (!conn.ok) return;
    check(
      `renderer waited out the un-listening window (≥${COLD_START_DELAY_S * 1000 - 500}ms)`,
      conn.elapsed >= COLD_START_DELAY_S * 1000 - 500,
      `${conn.elapsed}ms`,
    );
    check(
      'renderer connected inside its 15s budget',
      conn.elapsed < mod.BRIDGE_STARTUP_TIMEOUT_MS,
      `${conn.elapsed}ms`,
    );
    check('bridge reported the DSP channel', sysLog.some((s) => /DSP answered on channel 4/.test(s.text)), JSON.stringify(sysLog));

    // Protocol transmission: tx a real state request, expect a valid 09 FF reply.
    rxLog.length = 0;
    await conn.result.transport.write(STATE_REQUEST);
    let frame = null;
    try {
      frame = await waitForRx(rxLog);
    } catch (err) {
      check('tx → rx round trip over emulated RFCOMM', false, String(err.message));
    }
    check('tx → rx round trip over emulated RFCOMM', frame !== null);
    check('rx frame is a checksum-valid 09 FF device frame', frame !== null && frameIsValid(frame));

    // Deliberate disconnect must NOT look like a dropped link, and the helper
    // must stay alive for the next connect.
    await conn.result.transport.close();
    await sleep(600);
    check('deliberate disconnect does not report a link failure', downLog.length === 0, JSON.stringify(downLog));
    check('helper survives a renderer disconnect', (await probeHealth(token)) === 200);

    // Reconnect against the same helper session (same callbacks: the dropped-
    // link check below kills the helper while this second link is the live one).
    rxLog.length = 0;
    const t2 = Date.now();
    const conn2 = await mod.connectBridge(
      'AA:BB:CC:DD:EE:FF',
      (d) => rxLog.push(d),
      'Soundcore Liberty 4 NC',
      80,
      (text, isError) => sysLog.push({ text, isError }),
      (reason) => downLog.push(reason),
    );
    check('reconnect succeeds promptly against a warm helper', Date.now() - t2 < 3000, `${Date.now() - t2}ms`);
    await conn2.transport.write(STATE_REQUEST);
    let frame2 = null;
    try {
      frame2 = await waitForRx(rxLog);
    } catch {
      /* checked below */
    }
    check('reconnected link carries protocol traffic', frame2 !== null && frameIsValid(frame2));

    // Unexpected helper death must be reported to the app (onDown), instead of
    // leaving the UI "Connected" until a write fails.
    await conn2.transport.write(STATE_REQUEST).catch(() => {});
    helper.kill('SIGTERM');
    const deadline = Date.now() + 5000;
    while (!downLog.length && Date.now() < deadline) await sleep(50);
    check(
      'unexpected helper exit reports a dropped link',
      downLog.length === 1 && /closed unexpectedly/.test(downLog[0]),
      JSON.stringify(downLog),
    );
  } finally {
    await killHelper(helper);
  }
}

/* =========================================================== scenario 2 */

async function scenarioTokenMismatch() {
  console.log('\nScenario 2: renderer presents the wrong session token');
  const helperToken = randomToken();
  const helper = spawnHelper({ token: helperToken });
  try {
    const readiness = await waitForHelperReady(helper, helperToken);
    check('helper with token A is ready', readiness.ready, JSON.stringify(readiness));

    sessionToken = 'deadbeef'.repeat(8); // wrong token B, as if from a stale session
    const mod = await freshRenderer();
    const started = Date.now();
    let message = null;
    try {
      const conn = await mod.connectBridge('AA:BB:CC:DD:EE:FF', () => {});
      await conn.transport.close();
    } catch (err) {
      message = err?.message ?? String(err);
    }
    const elapsed = Date.now() - started;
    check('wrong token rejects instead of hanging', message !== null, 'connect unexpectedly succeeded');
    check(
      'wrong-token error names the token (not "helper not running")',
      typeof message === 'string' && /token/i.test(message) && !/not become ready/i.test(message),
      message ?? '',
    );
    check('wrong token fails fast (no 15s spin)', elapsed < 5000, `${elapsed}ms`);
    check('helper is unharmed by the rejected session', (await probeHealth(helperToken)) === 200);
  } finally {
    sessionToken = null;
    await killHelper(helper);
  }
}

/* =========================================================== scenario 3 */

async function scenarioHelperNeverStarts() {
  console.log('\nScenario 3: helper never starts (runs the real 15s budget)');
  const pre = await probeHealth(null);
  check('port is free before the scenario', pre === null, `probe returned ${pre}`);
  if (pre !== null) return;

  sessionToken = randomToken();
  const mod = await freshRenderer();
  const started = Date.now();
  let message = null;
  try {
    const conn = await mod.connectBridge('AA:BB:CC:DD:EE:FF', () => {});
    await conn.transport.close();
  } catch (err) {
    message = err?.message ?? String(err);
  }
  const elapsed = Date.now() - started;
  check('connect rejects when no helper ever appears', message !== null, 'connect unexpectedly succeeded');
  check(
    'error says the helper did not become ready (points at main.log)',
    typeof message === 'string' && /did not become ready/i.test(message) && /main\.log/.test(message),
    message ?? '',
  );
  check(
    'retried for the full 15s budget before giving up',
    elapsed >= mod.BRIDGE_STARTUP_TIMEOUT_MS - 1000 && elapsed < mod.BRIDGE_STARTUP_TIMEOUT_MS + 5000,
    `${elapsed}ms`,
  );
  sessionToken = null;
}

/* =========================================================== scenario 4 */

async function scenarioHttpWsSurface() {
  console.log('\nScenario 4: hello/scan/auth/origin surface of the real bridge server');
  const token = randomToken();
  const helper = spawnHelper({ token });
  try {
    const readiness = await waitForHelperReady(helper, token);
    check('helper ready', readiness.ready, JSON.stringify(readiness));

    // Authenticated WebSocket: hello must carry the (emulated) device list.
    const ws = await openRawWs(token);
    const hello = await nextMessage(ws);
    check('handshake delivers a hello message', hello?.type === 'hello', JSON.stringify(hello));
    check(
      'hello carries the device list',
      Array.isArray(hello?.devices) &&
        hello.devices.length === 1 &&
        hello.devices[0].mac === 'AA:BB:CC:DD:EE:FF' &&
        hello.devices[0].name === 'Soundcore Liberty 4 NC' &&
        hello.devices[0].battery === 80,
      JSON.stringify(hello?.devices),
    );
    check('hello reports the helper pid', typeof hello?.pid === 'number');

    ws.send(JSON.stringify({ type: 'scan' }));
    const rescan = await nextMessage(ws);
    check('ws scan request returns a fresh hello', rescan?.type === 'hello' && rescan.devices?.length === 1);
    ws.close();

    // HTTP surface: token and origin policy (regression guards — these must
    // never be weakened to make a test pass).
    const scan = await rawHttpRequest('/scan', { token });
    check('/scan with token → 200 + devices', scan.status === 200 && JSON.parse(scan.body).devices?.length === 1, `${scan.status}`);
    const noToken = await rawHttpRequest('/scan');
    check('/scan without token → 401', noToken.status === 401, `${noToken.status}`);
    const evil = await rawHttpRequest('/health', { token, origin: 'https://evil.example' });
    check('foreign origin → 403 even with a valid token', evil.status === 403, `${evil.status}`);
    const dev = await rawHttpRequest('/health', { token, origin: 'http://localhost:5173' });
    check('local dev origin → 200', dev.status === 200, `${dev.status}`);
    const fileUa = await rawHttpRequest('/health', {
      token,
      origin: 'null',
    });
    // Origin: null without an Electron user-agent marker must be rejected.
    check('Origin null without desktop UA → 403', fileUa.status === 403, `${fileUa.status}`);

    // WS handshake with a bad token must be refused (HTTP 401 under the hood).
    let refused = false;
    try {
      const bad = await openRawWs('wrong'.repeat(13), 3000);
      bad.close();
    } catch {
      refused = true;
    }
    check('ws handshake with bad token → refused', refused);
  } finally {
    await killHelper(helper);
  }
}

/* ================================================================== main */

console.log('SoundControl startup/lifecycle e2e (emulated, no Bluetooth hardware)');
console.log(`  helper: scripts/emulated_bridge.py on 127.0.0.1:${BRIDGE_PORT}`);

const occupied = await probeHealth(null);
if (occupied !== null) {
  console.error(
    `\nPort ${BRIDGE_PORT} is already in use (HTTP ${occupied}). Stop the other bridge and re-run.`,
  );
  process.exit(1);
}

const startedAll = Date.now();
try {
  await scenarioConstants();
  await scenarioColdStartRace();
  await scenarioTokenMismatch();
  await scenarioHelperNeverStarts();
  await scenarioHttpWsSurface();
} catch (err) {
  failures.push(`harness crashed: ${err?.stack ?? err}`);
  console.error(err);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n  ${passed} checks in ${((Date.now() - startedAll) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}
console.log('All startup/lifecycle e2e checks passed.');
