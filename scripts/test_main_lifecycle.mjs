#!/usr/bin/env node
/**
 * Main-process lifecycle tests for the release policy ("close means closed"):
 *
 *   L1  close after a healthy helper  -> helper killed, port 8765 released,
 *                                       no auto-restart spawns a new one
 *   L2  close while the helper is still starting -> the pending candidate is
 *                                       killed, port never stays occupied
 *   L3  helper dies, restart timer scheduled, user closes before it fires
 *                                       -> timer cancelled, no new helper
 *   L4  helper dies, shutdown begins, restart callback runs afterwards
 *                                       -> callback refuses to spawn
 *   L5  no helper at all (port owned by a stranger) -> app still quits clean
 *   L6  legacy settings.json (launchAtLogin/minimizeToTray true) is migrated
 *                                       and can never re-enable either; the
 *                                       settings write IPC no longer exists
 *   L7  every startup enforces openAtLogin:false through the login-item API
 *
 * How: electron-main.cjs is loaded against an in-process Electron stub (no
 * display, no Windows needed). The helper children it manages are REAL
 * processes holding the real port 8765: a stand-in that answers /health 200,
 * staged as the "bundled runtime" candidate (python-embed layout) because the
 * production bridge deliberately refuses to run off-Windows. Spawn, adopt,
 * kill, port-release and restart-timer semantics are therefore the genuine
 * code paths; only the helper payload is substituted. Windows-only surfaces
 * (registry login items, packaged exe, WM_CLOSE, the real bridge) are
 * verified separately by scripts/verify-autostart.cjs and
 * scripts/smoke-windows-lifecycle.ps1 in smoke-windows.yml — this file does
 * not claim to prove those.
 */

import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

let failures = 0;
function check(name, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return true; // supports sync and async predicates
    await sleep(40);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** main.log tail — the main process logs helper adoption there. */
function mainLog(userDataDir) {
  try {
    return readFileSync(join(userDataDir, 'main.log'), 'utf8');
  } catch {
    return '';
  }
}
const adopted = (userDataDir) => mainLog(userDataDir).includes('bridge started via');

function portBusy(port = 8765) {
  return new Promise((res) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    sock.once('connect', () => {
      sock.destroy();
      res(true);
    });
    sock.once('error', () => res(false));
    sock.setTimeout(400, () => {
      sock.destroy();
      res(false);
    });
  });
}

/* ------------------------------------------- real-child helper stand-in */
// bundledPythonPath() looks for <cwd>/python/python.exe when there is no
// Electron resourcesPath, so staging this tiny /health server there makes it
// the first interpreter candidate — a real child process on the real port.
const SHIM_DIR = mkdtempSync(join(tmpdir(), 'sc-lifecycle-shim-'));
const SHIM_EXE = join(SHIM_DIR, 'python', 'python.exe');
{
  const { mkdirSync, writeFileSync, chmodSync } = require('fs');
  mkdirSync(join(SHIM_DIR, 'python'), { recursive: true });
  writeFileSync(
    SHIM_EXE,
    '#!/usr/bin/env python3\n' +
      'import http.server\n' +
      'class H(http.server.BaseHTTPRequestHandler):\n' +
      '    def do_GET(self):\n' +
      '        self.send_response(200)\n' +
      '        self.end_headers()\n' +
      '        self.wfile.write(b"ok")\n' +
      '    def log_message(self, *a):\n' +
      '        pass\n' +
      'http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()\n',
  );
  chmodSync(SHIM_EXE, 0o755);
  process.chdir(SHIM_DIR);
}

/* ---------------------------------------------------------------- stubbing */
// Intercept require('electron') and require('child_process') for modules
// loaded AFTER this point, so electron-main.cjs gets the stub API while its
// spawned helpers are recorded (and remain real processes).
const electronId = require.resolve('electron');
const childId = require.resolve('child_process');
const realCp = require('child_process');

const spawned = [];
require.cache[childId] = {
  id: childId,
  filename: childId,
  loaded: true,
  exports: {
    ...realCp,
    spawn: (...args) => {
      const child = realCp.spawn(...args);
      spawned.push(child);
      return child;
    },
  },
};

class FakeWindow extends EventEmitter {
  constructor() {
    super();
    this.webContents = new EventEmitter();
    this.webContents.setWindowOpenHandler = () => {};
    this.webContents.getURL = () => 'app://localhost/';
    this.destroyed = false;
  }
  isDestroyed() {
    return this.destroyed;
  }
  isVisible() {
    return true;
  }
  isMinimized() {
    return false;
  }
  show() {}
  focus() {}
  restore() {}
  loadFile() {
    return Promise.resolve();
  }
  loadURL() {
    return Promise.resolve();
  }
  /** Emulates the user pressing the X button. */
  userClose(appStub) {
    this.emit('close', { preventDefault() {} });
    this.emit('closed');
    this.destroyed = true;
    appStub.emit('window-all-closed');
  }
}

function makeElectronStub(userDataDir) {
  const windows = [];
  const appStub = new EventEmitter();
  const ipc = new Map();
  appStub.loginItemCalls = [];
  appStub.quitCalls = 0;
  appStub.getPath = (name) => (name === 'userData' ? userDataDir : join(userDataDir, name));
  appStub.getVersion = () => '0.0.0-lifecycle-test';
  appStub.setAppUserModelId = () => {};
  appStub.isPackaged = false;
  appStub.requestSingleInstanceLock = () => true;
  appStub.whenReady = () => Promise.resolve();
  appStub.setLoginItemSettings = (opts) => appStub.loginItemCalls.push({ ...opts });
  appStub.getLoginItemSettings = () => ({ openAtLogin: false, wasOpenedAtLogin: false });
  appStub.quit = () => {
    appStub.quitCalls += 1;
    appStub.emit('before-quit');
  };
  const electronStub = {
    app: appStub,
    BrowserWindow: class extends FakeWindow {
      constructor(opts) {
        super();
        windows.push(this);
        this.opts = opts;
      }
    },
    ipcMain: { handle: (channel, fn) => ipc.set(channel, fn) },
    dialog: { showErrorBox: () => {}, showMessageBox: async () => ({ response: 0 }) },
    shell: { openPath: async () => '', openExternal: async () => {} },
  };
  require.cache[electronId] = {
    id: electronId,
    filename: electronId,
    loaded: true,
    exports: electronStub,
  };
  return { electronStub, appStub, windows, ipc };
}

function loadMain() {
  const mainId = require.resolve(join(ROOT, 'electron-main.cjs'));
  delete require.cache[mainId];
  delete require.cache[require.resolve(join(ROOT, 'autostart.cjs'))];
  require(mainId);
}

async function freshScenario({ load = true } = {}) {
  // Never let a previous scenario's helper leak into the next one.
  for (const child of spawned.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  await waitFor(async () => !(await portBusy()), 10000, 'port 8765 free before scenario');
  const userDataDir = mkdtempSync(join(tmpdir(), 'sc-lifecycle-'));
  const stub = makeElectronStub(userDataDir);
  if (load) {
    loadMain();
    await sleep(60); // let whenReady() run
  }
  return { ...stub, userDataDir, loadMain: () => loadMain() };
}

async function settle(ms = 3200) {
  // Longer than the longest restart delay (3s) so a forbidden respawn would
  // show up inside the observation window.
  await sleep(ms);
}

/* ------------------------------------------------------------------ tests */
const results = [];
async function scenario(name, fn, opts) {
  console.log(`\n[lifecycle] ${name}`);
  const ctx = await freshScenario(opts);
  try {
    await fn(ctx);
  } finally {
    for (const child of spawned.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    rmSync(ctx.userDataDir, { recursive: true, force: true });
  }
}

// The win32 code path is what ships; the stub replaces Electron, not the OS.
Object.defineProperty(process, 'platform', { value: 'win32' });
// Skip the dist/index.html existence check (renderer never loads here).
process.env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:9/';

await scenario('L1 close after healthy helper: killed, port free, no respawn', async (ctx) => {
  const { appStub, windows } = ctx;
  await waitFor(() => spawned.length >= 1, 5000, 'helper spawn');
  await waitFor(() => adopted(ctx.userDataDir), 15000, 'helper adoption logged');
  const helper = spawned[0];
  check('helper adopted and alive before close', helper.exitCode === null && (await portBusy()));
  windows[0].userClose(appStub);
  await waitFor(() => helper.exitCode !== null || helper.signalCode !== null, 6000, 'helper exit');
  check('helper process terminated by window close', helper.exitCode !== null || helper.signalCode !== null);
  check('app.quit() reached (window-all-closed on win32)', appStub.quitCalls >= 1);
  await waitFor(async () => !(await portBusy()), 6000, 'port 8765 released');
  check('port 8765 released after exit', !(await portBusy()));
  await settle();
  check('no auto-restart spawned a replacement helper', spawned.length === 1);
});

await scenario('L2 close during helper startup: pending candidate killed', async (ctx) => {
  const { appStub, windows } = ctx;
  await waitFor(() => spawned.length >= 1, 5000, 'helper spawn');
  // Close while startup is still in flight (no adoption logged yet); if the
  // candidate already became ready the same kill-everything path applies.
  if (adopted(ctx.userDataDir)) throw new Error('adoption happened before close - race in test');
  windows[0].userClose(appStub);
  for (const child of spawned) {
    await waitFor(
      () => child.exitCode !== null || child.signalCode !== null || child.spawnFailed,
      6000,
      'candidate exit',
    ).catch(() => {});
  }
  check('startup candidate killed by close', spawned.every((c) => c.exitCode !== null || c.signalCode !== null || c.spawnFailed));
  await waitFor(async () => !(await portBusy()), 6000, 'port free').catch(() => {});
  check('port 8765 not held after close-during-startup', !(await portBusy()));
  await settle();
  check('no helper spawned after shutdown began', spawned.length <= 1);
});

await scenario('L3 restart scheduled, user closes first: timer cancelled', async (ctx) => {
  const { appStub, windows } = ctx;
  await waitFor(() => spawned.length >= 1, 5000, 'helper spawn');
  await waitFor(() => adopted(ctx.userDataDir), 15000, 'helper adoption logged');
  const helper = spawned[0];
  helper.kill('SIGKILL'); // simulate crash / antivirus kill mid-session
  await waitFor(() => helper.exitCode !== null || helper.signalCode !== null, 5000, 'helper death');
  await sleep(120); // restart timer (1s) is now scheduled
  windows[0].userClose(appStub);
  await settle(3600); // outlive the 1s restart delay
  check('cancelled restart timer never spawned a helper', spawned.length === 1);
  check('port 8765 stays free', !(await portBusy()));
});

await scenario('L4 restart callback runs after shutdown: refuses to spawn', async (ctx) => {
  const { appStub, windows } = ctx;
  await waitFor(() => spawned.length >= 1, 5000, 'helper spawn');
  await waitFor(() => adopted(ctx.userDataDir), 15000, 'helper adoption logged');
  const helper = spawned[0];
  helper.kill('SIGKILL');
  await waitFor(() => helper.exitCode !== null || helper.signalCode !== null, 5000, 'helper death');
  await sleep(900); // just under the 1s restart delay...
  windows[0].userClose(appStub); // ...shutdown begins first
  await settle(3600); // the timer fires while shuttingDown is true
  check('post-shutdown restart callback spawned nothing', spawned.length === 1);
  check('port 8765 stays free', !(await portBusy()));
});

await scenario(
  'L5 stranger owns the port: no spawn, clean quit anyway',
  async ({ appStub, windows, loadMain: load }) => {
    // A listener that answers /health with a non-200 status: exactly the
    // "port owned by another session's helper" case the hardening detects.
    // It must own the port BEFORE the app starts, so this scenario loads the
    // main process itself after binding.
    const stranger = http.createServer((_req, res) => {
      res.statusCode = 401;
      res.end('nope');
    });
    stranger.on('error', (err) => {
      throw new Error(`stranger listener could not bind 8765: ${err.code}`);
    });
    await new Promise((r) => stranger.listen(8765, '127.0.0.1', r));
    load();
    await sleep(2600);
    check('no helper spawned while a stranger owns 8765', spawned.length === 0);
    windows[0].userClose(appStub);
    await sleep(300);
    check('app still quits cleanly with no helper', appStub.quitCalls >= 1);
    stranger.close();
  },
  { load: false },
);

await scenario('L6 legacy settings migrated; settings IPC gone; no tray', async ({ appStub, ipc, windows }) => {
  const file = join(appStub.getPath('userData'), 'settings.json');
  writeFileSync(file, JSON.stringify({ launchAtLogin: true, minimizeToTray: true, keep: 1 }, null, 2));
  // Reload main so startup migration runs against this userData dir.
  loadMain();
  await sleep(100);
  const after = JSON.parse(readFileSync(file, 'utf8'));
  check('legacy launchAtLogin stripped from settings.json', !('launchAtLogin' in after));
  check('legacy minimizeToTray stripped from settings.json', !('minimizeToTray' in after));
  check('unrelated settings keys preserved', after.keep === 1);
  check('settings write IPC removed', !ipc.has('soundcontrol:set-setting') && !ipc.has('soundcontrol:get-settings'));
  check('real IPC channels still registered', ipc.has('soundcontrol:bridge-token') && ipc.has('soundcontrol:open-log-folder') && ipc.has('soundcontrol:app-version'));
  check('no Tray instance created (stub has none; any use would throw)', windows.length >= 1);
  windows[0].userClose(appStub);
  await sleep(200);
  check('quit still clean after migration', appStub.quitCalls >= 1);
});

await scenario('L7 every startup enforces openAtLogin:false', async ({ appStub, windows }) => {
  check('setLoginItemSettings called with openAtLogin=false', appStub.loginItemCalls.some((c) => c.openAtLogin === false));
  check('never called with openAtLogin=true', !appStub.loginItemCalls.some((c) => c.openAtLogin === true));
  windows[0].userClose(appStub);
  await sleep(200);
});

console.log(`\n${failures === 0 ? 'All' : failures} lifecycle ${failures === 0 ? 'checks passed.' : 'FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
