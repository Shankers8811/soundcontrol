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
 *                             down"), reconnect, an unexpected helper death
 *                             (must report the dropped link, and a write on
 *                             the dead transport must reject, not hang), and
 *                             a helper restart while the renderer stays open
 *                             (reconnect through the retry budget).
 *   2. token mismatch       — must reject promptly with an auth-specific
 *                             error, not a generic "helper not running";
 *                             repeated failed attempts stay fast; a stale
 *                             cached token after a helper restart with a new
 *                             secret is also rejected fast.
 *   3. helper never starts  — must reject after the full 15s budget with a
 *                             "did not become ready" error (runs in real
 *                             time on purpose: it tests the shipped constant).
 *   4. HTTP/WS surface      — hello carries the device list, scan works,
 *                             /scan without token → 401, foreign origin → 403,
 *                             local dev origin → 200, WS handshake with a bad
 *                             token → refused.
 *   5. close during connect — the helper dies while the RFCOMM probe is in
 *                             flight (--rfcomm-delay widens the window): the
 *                             pending connect must reject quickly with the
 *                             "helper closed the connection" error, never
 *                             hang until the 30s device timeout.
 *   6. protocol abuse       — malformed JSON, unknown types, invalid MAC,
 *                             invalid/empty/oversized tx, and a >1MiB WS
 *                             frame: each is answered or drops only that
 *                             client; clean disconnect still works and the
 *                             server stays healthy for new sessions.
 *   7. earbud side states   — the emulated device reports both / left-only /
 *                             right-only / no sides connected / no battery
 *                             bytes at all (--earbud-state, 0xFF = side
 *                             absent): the exact per-side bytes the UI
 *                             earbud-status derivation consumes must survive
 *                             the real helper→WS→transport pipeline.
 *   8. live transitions     — BOTH → LEFT_ONLY → BOTH over ONE connection
 *                             (--earbud-script): a removed side must report
 *                             0xFF immediately and a returned side must carry
 *                             fresh bytes — no stale level may survive.
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

function spawnHelper({ token, startupDelay = 0, rfcommDelay = 0, earbudState = 'both', earbudScript = '' }) {
  const args = [
    EMULATOR,
    '--host', '127.0.0.1',
    '--port', String(BRIDGE_PORT),
    '--startup-delay', String(startupDelay),
    '--rfcomm-delay', String(rfcommDelay),
    '--earbud-state', earbudState,
  ];
  if (earbudScript) args.push('--earbud-script', earbudScript);
  const child = spawn(
    PYTHON,
    args,
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
    await helper.exited;

    // A write on the dead transport must reject promptly — never hang, and
    // never silently "succeed" into a closed socket.
    const writeOutcome = await Promise.race([
      conn2.transport.write(STATE_REQUEST).then(
        () => 'sent',
        (err) => `threw: ${err?.message ?? err}`,
      ),
      sleep(2000).then(() => 'hung'),
    ]);
    check('write after helper death rejects instead of hanging', writeOutcome.startsWith('threw'), writeOutcome);

    // Helper restarts while the renderer stays open (Electron auto-restarts a
    // crashed helper with the same token): the next connect must find it
    // through the 15s retry budget without an app restart.
    const restarted = spawnHelper({ token });
    try {
      const readiness2 = await waitForHelperReady(restarted, token);
      check('restarted helper becomes ready', readiness2.ready, JSON.stringify(readiness2));
      downLog.length = 0;
      rxLog.length = 0;
      const conn3 = await mod.connectBridge(
        'AA:BB:CC:DD:EE:FF',
        (d) => rxLog.push(d),
        'Soundcore Liberty 4 NC',
        80,
        () => {},
        (reason) => downLog.push(reason),
      );
      check('renderer reconnects to a restarted helper (same session token)', true);
      await conn3.transport.write(STATE_REQUEST);
      let frame3 = null;
      try {
        frame3 = await waitForRx(rxLog);
      } catch {
        /* checked below */
      }
      check('restarted-helper link carries protocol traffic', frame3 !== null && frameIsValid(frame3));
      await conn3.transport.close();
      await sleep(300);
      check('deliberate close after restart reports no link failure', downLog.length === 0, JSON.stringify(downLog));
    } finally {
      await killHelper(restarted);
    }
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

    // Repeated failed attempts must stay fast and consistent — no retry storm,
    // no state corruption in the helper, no drift in the classification.
    const repeatStarted = Date.now();
    let repeatMessages = 0;
    for (let i = 0; i < 2; i++) {
      try {
        const conn = await mod.connectBridge('AA:BB:CC:DD:EE:FF', () => {});
        await conn.transport.close();
      } catch (err) {
        if (/token/i.test(err?.message ?? '')) repeatMessages++;
      }
    }
    check(
      'repeated failed connects stay classified and fast',
      repeatMessages === 2 && Date.now() - repeatStarted < 6000,
      `${repeatMessages}/2 token errors in ${Date.now() - repeatStarted}ms`,
    );
    check('helper still healthy after repeated rejected sessions', (await probeHealth(helperToken)) === 200);
  } finally {
    sessionToken = null;
    await killHelper(helper);
  }

  // Stale token after a helper restart: the renderer (still open, token
  // cached from its own session) meets a helper that now runs a *different*
  // secret. Must fail fast with the token-classified error. (Electron's own
  // auto-restart reuses the same token; this covers the foreign/stale case.)
  const freshToken = randomToken();
  const restarted = spawnHelper({ token: freshToken });
  try {
    const readiness = await waitForHelperReady(restarted, freshToken);
    check('restarted helper (new token) is ready', readiness.ready, JSON.stringify(readiness));
    sessionToken = 'stale'.repeat(26); // renderer's cached, now-obsolete token
    const staleMod = await freshRenderer();
    const started = Date.now();
    let staleMessage = null;
    try {
      const conn = await staleMod.connectBridge('AA:BB:CC:DD:EE:FF', () => {});
      await conn.transport.close();
    } catch (err) {
      staleMessage = err?.message ?? String(err);
    }
    check(
      'stale token after helper restart → fast, token-specific rejection',
      typeof staleMessage === 'string' && /token/i.test(staleMessage) && Date.now() - started < 5000,
      `${staleMessage ?? 'no error'} in ${Date.now() - started}ms`,
    );
  } finally {
    sessionToken = null;
    await killHelper(restarted);
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

    // The per-session secret must never reach the helper's logs — Electron
    // mirrors helper stderr into %AppData%\soundcontrol\main.log, so the
    // access log has to redact the ?token= query parameter.
    await sleep(400);
    const helperLog = helper.logs.join('\n');
    check(
      'helper logs contain the handshake line but redact the token',
      helperLog.includes('/ws?token=<redacted>') && !helperLog.includes(token),
      helperLog.slice(0, 400),
    );

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

/* =========================================================== scenario 5 */

async function scenarioCloseDuringConnect() {
  console.log('\nScenario 5: helper dies while a connect is in flight');
  const token = randomToken();
  // --rfcomm-delay 3 keeps the bridge inside its channel probe (~1.5s reply
  // timeout per candidate) long after the renderer sent `connect`, so the
  // kill below lands deterministically mid-connect.
  const helper = spawnHelper({ token, rfcommDelay: 3 });
  try {
    const readiness = await waitForHelperReady(helper, token);
    check('slow-reply helper is ready', readiness.ready, JSON.stringify(readiness));

    sessionToken = token;
    const mod = await freshRenderer();
    const started = Date.now();
    const connecting = mod.connectBridge('AA:BB:CC:DD:EE:FF', () => {});
    // Let the WebSocket open and the `connect` command reach the probe, then
    // kill the helper out from under it.
    await sleep(700);
    helper.kill('SIGTERM');
    let message = null;
    let succeeded = false;
    try {
      const conn = await connecting;
      succeeded = true;
      await conn.transport.close();
    } catch (err) {
      message = err?.message ?? String(err);
    }
    const elapsed = Date.now() - started;
    check('connect in flight rejects when the helper dies', !succeeded, 'connect unexpectedly succeeded');
    check(
      'mid-connect failure names the closed connection (not the 30s earbud timeout)',
      typeof message === 'string' && /closed the connection/i.test(message),
      message ?? '',
    );
    check('mid-connect failure surfaces fast (no 30s hang)', elapsed < 10000, `${elapsed}ms`);
    await helper.exited;
  } finally {
    sessionToken = null;
    await killHelper(helper);
  }
}

/* =========================================================== scenario 6 */

async function scenarioProtocolAbuse() {
  console.log('\nScenario 6: malformed/oversized protocol input cannot break the bridge');
  const token = randomToken();
  const helper = spawnHelper({ token });
  try {
    const readiness = await waitForHelperReady(helper, token);
    check('helper ready', readiness.ready, JSON.stringify(readiness));

    const ws = await openRawWs(token);
    const hello = await nextMessage(ws);
    check('abuse session starts with a normal hello', hello?.type === 'hello');

    const send = (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));

    send('not json {{{');
    const badJson = await nextMessage(ws);
    check('malformed JSON → error reply, connection survives', badJson?.type === 'error' && /invalid json/i.test(badJson.error ?? ''), JSON.stringify(badJson));

    send({ type: 'bogus' });
    const unknown = await nextMessage(ws);
    check('unknown message type → error reply', unknown?.type === 'error' && /unknown bogus/i.test(unknown.error ?? ''), JSON.stringify(unknown));

    send({ type: 'connect', mac: 'nope' });
    const badMac = await nextMessage(ws);
    check(
      'invalid MAC → clear address error (not a confusing OS failure)',
      badMac?.type === 'error' && /invalid bluetooth address/i.test(badMac.error ?? ''),
      JSON.stringify(badMac),
    );

    send({ type: 'tx', hex: 'zz' });
    const badHex = await nextMessage(ws);
    check('invalid hex tx → error reply', badHex?.type === 'error', JSON.stringify(badHex));

    send({ type: 'tx', hex: '' });
    const noLink = await nextMessage(ws);
    check('tx with no RFCOMM link → "Not connected" error', noLink?.type === 'error' && /not connected/i.test(noLink.error ?? ''), JSON.stringify(noLink));

    send({ type: 'tx', hex: '41'.repeat(5000) }); // 5000 bytes > TX_MAX_BYTES
    const tooBig = await nextMessage(ws);
    check('oversized tx payload → refused with a clear error', tooBig?.type === 'error' && /too large/i.test(tooBig.error ?? ''), JSON.stringify(tooBig));

    send({ type: 'disconnect' });
    const disc = await nextMessage(ws);
    check('clean disconnect still works after malformed input', disc?.type === 'disconnected', JSON.stringify(disc));

    // A message beyond the WebSocket frame cap must drop only this client;
    // the server has to stay healthy for everyone else.
    const closed = new Promise((r) => {
      ws.addEventListener('close', () => r(true), { once: true });
      setTimeout(() => r(false), 4000);
    });
    send({ type: 'tx', hex: '41'.repeat(1_100_000) }); // ~2.2 MB message > 1 MiB cap
    check('oversized WebSocket frame closes only that client', (await closed) === true);

    check('helper still answers /health after abuse', (await probeHealth(token)) === 200);
    const ws2 = await openRawWs(token);
    const hello2 = await nextMessage(ws2);
    check('a fresh WebSocket session works after abuse', hello2?.type === 'hello');
    ws2.close();
    check('helper process still alive', helper.exitCode === null);
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

/* ------------------------------------------------------------------------ */
/* Scenario 7: per-side earbud telemetry (both / left / right / none)        */
/*                                                                           */
/* The UI's Earbud Connection card is driven exclusively by the device's     */
/* 01:03 battery replies, where 0xFF means "that side is not connected to    */
/* the host". This scenario runs all four side combinations through the      */
/* REAL pipeline — real helper server, real WebSocket transport, real        */
/* checksummed RFCOMM frames — and asserts the exact bytes the renderer's    */
/* presence derivation consumes. Emulator data only; production never sees   */
/* these states (the packaged app talks to real hardware).                   */
/* ------------------------------------------------------------------------ */

/** The renderer's real 01:03 battery query (see src/protocol/packets.ts). */
const BATTERY_QUERY = Uint8Array.from(
  '08EE00000001030A0004'.match(/../g).map((h) => parseInt(h, 16)),
);

const EARBUD_EXPECTATIONS = [
  ['both', 0x04, 0x04],
  ['left', 0x04, 0xff],
  ['right', 0xff, 0x04],
  ['none', 0xff, 0xff],
  // 'unknown': a valid, checksum-correct ack frame carrying NO battery
  // bytes — the renderer must keep both sides unknown, never guess.
  ['unknown', null, null],
];

async function scenarioEarbudStates() {
  console.log('\nScenario 7: per-side earbud telemetry (both/left/right/none)');
  for (const [state, wantLeft, wantRight] of EARBUD_EXPECTATIONS) {
    const token = randomToken();
    sessionToken = token;
    const helper = spawnHelper({ token, earbudState: state });
    const mod = await freshRenderer();
    try {
      const ready = await waitForHelperReady(helper, token);
      check(`[${state}] helper ready`, ready.ready, JSON.stringify(ready));
      if (!ready.ready) continue;

      const rxLog = [];
      const conn = await mod.connectBridge(
        'AA:BB:CC:DD:EE:FF',
        (data) => rxLog.push(data),
        'Soundcore Liberty 4 NC',
        null,
      );
      check(`[${state}] connect succeeds`, Boolean(conn?.transport));

      rxLog.length = 0;
      await conn.transport.write(BATTERY_QUERY);

      // Wait for the 01:03 reply specifically (the connect handshake may
      // still deliver its own ack frames into the same log).
      let reply = null;
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline && !reply) {
        reply = rxLog.find((f) => f.length >= 10 && f[0] === 0x09 && f[1] === 0xff && f[5] === 0x01 && f[6] === 0x03) ?? null;
        if (!reply) await sleep(50);
      }
      check(`[${state}] device answered the 01:03 battery query`, reply !== null);
      if (reply) {
        check(`[${state}] reply is checksum-valid`, frameIsValid(reply));
        if (wantLeft === null) {
          // Length field is the TOTAL frame size (10 + payload): an empty
          // battery reply is a 10-byte frame with no payload bytes at all.
          const totalLen = reply[7] | (reply[8] << 8);
          check(
            `[${state}] reply carries no battery bytes (empty payload)`,
            totalLen === 10 && reply.length === 10,
            `totalLen=${totalLen} frameLen=${reply.length}`,
          );
        } else {
          check(
            `[${state}] per-side bytes are ${wantLeft.toString(16)}/${wantRight.toString(16)} (0xFF = side absent)`,
            reply[9] === wantLeft && reply[10] === wantRight,
            `got ${reply[9]?.toString(16)}/${reply[10]?.toString(16)}`,
          );
        }
      }
      await conn.transport.close();
    } catch (err) {
      check(`[${state}] scenario ran without transport errors`, false, String(err?.message ?? err));
    } finally {
      await killHelper(helper);
    }
  }
  check('helper healthy check: port free after last earbud scenario', (await probeHealth(null)) === null);
}

/* ------------------------------------------------------------------------ */
/* Scenario 8: LIVE earbud-state transitions over one connection             */
/*                                                                           */
/* BOTH -> LEFT_ONLY -> BOTH, driven by --earbud-script (one entry consumed  */
/* per 01:03 reply). Asserts the exact per-side bytes of every step through  */
/* the real pipeline: a side that goes 0xFF must be reported absent on the   */
/* very next query, and must come back with FRESH bytes when it returns —    */
/* nothing may cache or resurrect the old value in between.                  */
/* ------------------------------------------------------------------------ */

async function scenarioEarbudTransitions() {
  console.log('\nScenario 8: live earbud transitions (both -> left -> both)');
  const token = randomToken();
  sessionToken = token;
  const helper = spawnHelper({ token, earbudScript: 'both,left,both' });
  const mod = await freshRenderer();
  try {
    const ready = await waitForHelperReady(helper, token);
    check('helper ready', ready.ready, JSON.stringify(ready));
    if (!ready.ready) return;

    const rxLog = [];
    const conn = await mod.connectBridge(
      'AA:BB:CC:DD:EE:FF',
      (data) => rxLog.push(data),
      'Soundcore Liberty 4 NC',
      null,
    );
    check('connect succeeds', Boolean(conn?.transport));

    const steps = [
      ['initial query reports BOTH sides', 0x04, 0x04],
      ['right bud removed -> next query reports 0xFF for right', 0x04, 0xff],
      ['right bud back -> next query reports FRESH bytes for right', 0x04, 0x04],
    ];
    for (const [label, wantLeft, wantRight] of steps) {
      rxLog.length = 0;
      await conn.transport.write(BATTERY_QUERY);
      let reply = null;
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline && !reply) {
        reply = rxLog.find((f) => f.length >= 10 && f[0] === 0x09 && f[1] === 0xff && f[5] === 0x01 && f[6] === 0x03) ?? null;
        if (!reply) await sleep(50);
      }
      check(`${label} (reply received)`, reply !== null);
      if (reply) {
        check(
          `${label} (bytes ${wantLeft.toString(16)}/${wantRight.toString(16)})`,
          frameIsValid(reply) && reply[9] === wantLeft && reply[10] === wantRight,
          `got ${reply[9]?.toString(16)}/${reply[10]?.toString(16)}`,
        );
      }
    }
    await conn.transport.close();
  } catch (err) {
    check('transition scenario ran without transport errors', false, String(err?.message ?? err));
  } finally {
    await killHelper(helper);
  }
}

const startedAll = Date.now();
try {
  await scenarioConstants();
  await scenarioColdStartRace();
  await scenarioTokenMismatch();
  await scenarioHelperNeverStarts();
  await scenarioHttpWsSurface();
  await scenarioCloseDuringConnect();
  await scenarioProtocolAbuse();
  await scenarioEarbudStates();
  await scenarioEarbudTransitions();
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
