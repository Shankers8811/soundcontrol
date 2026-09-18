const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let bridgeProcess = null;
// A candidate child that is still inside its readiness window. Tracked
// separately because `bridgeProcess` is only assigned once the helper
// actually answers /health — without this, quitting mid-startup (window
// closed early, fatal error) orphaned the spawned Python process, which then
// kept holding port 8765 invisibly.
let pendingBridge = null;
// Set once the app begins quitting, so the interpreter-candidate loop stops
// spawning new helpers that would outlive the app.
let shuttingDown = false;
// Bounded auto-restart of an *adopted* helper that dies mid-session (crash,
// antivirus kill, user ending python.exe). Without this the renderer's 15s
// retry budget finds nothing and the user must restart the whole app even
// though the failure is recoverable. Deliberately capped — no infinite
// restart loops: at most BRIDGE_MAX_AUTO_RESTARTS consecutive deaths, and a
// helper that stayed up for BRIDGE_STABLE_RUN_MS resets the budget.
const BRIDGE_MAX_AUTO_RESTARTS = 3;
const BRIDGE_STABLE_RUN_MS = 60000;
let bridgeAutoRestarts = 0;
let bridgeAdoptedAt = 0;
let bridgeRestartTimer = null;
let mainWindow = null;
let windowEverShown = false;

// Per-session secret for the RFCOMM bridge. Minted fresh on every launch,
// handed to the helper through its (private) environment — never argv, which
// other processes can read — and to our own renderer over IPC, so only this
// app's window can use the helper's Bluetooth writes.
const bridgeToken = crypto.randomBytes(32).toString('hex');
ipcMain.handle('soundcontrol:bridge-token', () => bridgeToken);

// ---------------------------------------------------------------------------
// User settings (real, persisted, behaviour-changing — exposed in Settings).
//
// Stored next to main.log in %AppData%\soundcontrol\settings.json. Only a
// whitelist of boolean keys can be written over IPC; anything else is
// rejected and logged. launchAtLogin maps to app.setLoginItemSettings (the
// Windows registry run key), minimizeToTray creates/destroys a real Tray and
// intercepts the window close event. Both re-apply at every startup, so the
// setting genuinely survives a restart.
// ---------------------------------------------------------------------------
const SETTINGS_KEYS = ['launchAtLogin', 'minimizeToTray'];
const DEFAULT_SETTINGS = { launchAtLogin: false, minimizeToTray: false };
let settings = { ...DEFAULT_SETTINGS };
let tray = null;

function settingsFilePath() {
  try {
    return path.join(app.getPath('userData'), 'settings.json');
  } catch {
    return null;
  }
}

function loadSettings() {
  try {
    const p = settingsFilePath();
    if (!p || !fs.existsSync(p)) return;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const key of SETTINGS_KEYS) {
      if (typeof raw[key] === 'boolean') settings[key] = raw[key];
    }
    log(`settings loaded (launchAtLogin=${settings.launchAtLogin}, minimizeToTray=${settings.minimizeToTray})`);
  } catch (err) {
    log(`settings load failed, using defaults: ${err}`);
  }
}

function saveSettings() {
  try {
    const p = settingsFilePath();
    if (!p) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(settings, null, 2)}\n`);
  } catch (err) {
    log(`settings save failed: ${err}`);
  }
}

function applyLaunchAtLogin() {
  try {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath });
  } catch (err) {
    log(`setLoginItemSettings failed: ${err}`);
  }
}

function trayIconImage() {
  try {
    // The 32px render of the SC monogram halves cleanly into the 16px tray
    // slot; fall back to the 512px app icon if the small asset is absent.
    const small = path.join(__dirname, 'public', 'icon-32.png');
    const source = fs.existsSync(small) ? small : path.join(__dirname, 'public', 'icon-512.png');
    const img = nativeImage.createFromPath(source);
    return img.isEmpty() ? null : img.resize({ width: 16, height: 16 });
  } catch {
    return null;
  }
}

function ensureTray() {
  if (!settings.minimizeToTray) {
    destroyTray();
    return;
  }
  if (tray) return;
  try {
    const icon = trayIconImage();
    if (!icon) {
      log('tray icon unavailable; minimize-to-tray stays inactive');
      return;
    }
    tray = new Tray(icon);
    tray.setToolTip('SoundControl');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show SoundControl', click: () => { if (!focusWindow()) createWindow(); } },
        { type: 'separator' },
        {
          label: 'Quit SoundControl',
          click: () => {
            shuttingDown = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', () => {
      if (!focusWindow()) createWindow();
    });
    log('tray icon created (minimize-to-tray enabled)');
  } catch (err) {
    tray = null;
    log(`tray creation failed: ${err}`);
  }
}

function destroyTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    /* best-effort */
  }
  tray = null;
}

ipcMain.handle('soundcontrol:get-settings', () => ({ ...settings }));

ipcMain.handle('soundcontrol:set-setting', (_event, key, value) => {
  if (!SETTINGS_KEYS.includes(key) || typeof value !== 'boolean') {
    // Never write unknown keys or non-boolean values: the renderer is trusted
    // enough to ask, not trusted enough to define the schema.
    log(`rejected invalid settings write: key=${String(key)} type=${typeof value}`);
    return { ...settings };
  }
  settings[key] = value;
  saveSettings();
  if (key === 'launchAtLogin') applyLaunchAtLogin();
  if (key === 'minimizeToTray') ensureTray();
  log(`setting ${key} = ${value}`);
  return { ...settings };
});

ipcMain.handle('soundcontrol:open-log-folder', async () => {
  try {
    const dir = app.getPath('userData');
    // shell.openPath resolves '' on success and an error string otherwise.
    // Only ever the app's own userData directory — no caller-chosen paths.
    const res = await shell.openPath(dir);
    if (res) log(`open-log-folder failed: ${res}`);
    return res === '';
  } catch (err) {
    log(`open-log-folder failed: ${err}`);
    return false;
  }
});

ipcMain.handle('soundcontrol:app-version', () => {
  try {
    return app.getVersion();
  } catch {
    return '';
  }
});

// ---------------------------------------------------------------------------
// Startup diagnostics.
//
// A packaged app that crashes inside the main process used to fail silently:
// double-clicking the exe "did nothing". Every lifecycle step is now appended
// to main.log in the userData folder so problems are actually debuggable:
//   Windows: %AppData%\soundcontrol\main.log
//   Linux/macOS: ~/.config/soundcontrol/main.log (or platform equivalent)
// ---------------------------------------------------------------------------
function logFilePath() {
  try {
    return path.join(app.getPath('userData'), 'main.log');
  } catch {
    return path.join(os.tmpdir(), 'soundcontrol-main.log');
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    console.log(line);
  } catch {
    /* console may be unavailable on Windows GUI builds; logging is best-effort */
  }
  try {
    const file = logFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    /* never let diagnostics break startup */
  }
}

function showFatal(title, detail) {
  log(`FATAL ${title}: ${detail}`);
  try {
    dialog.showErrorBox(title, detail);
  } catch {
    /* dialog is unavailable very early in the lifecycle; the log still has it */
  }
}

// Surface otherwise-invisible main-process errors instead of exiting quietly.
process.on('uncaughtException', (err) => {
  showFatal('Unexpected error', err && err.stack ? err.stack : String(err));
  if (!windowEverShown) app.quit();
});
process.on('unhandledRejection', (reason) => {
  showFatal('Unexpected error', reason && reason.stack ? reason.stack : String(reason));
});

function bridgeScriptPath() {
  // In the packaged app the bridge is unpacked next to app.asar (see
  // asarUnpack in package.json) so the Python interpreter can read it.
  const unpacked = path.join(__dirname, '..', 'app.asar.unpacked', 'soundcore_bridge.py');
  try {
    if (fs.existsSync(unpacked)) return unpacked;
  } catch {
    /* fall through */
  }
  return path.join(__dirname, 'soundcore_bridge.py');
}

// The installer ships the official Python embeddable runtime
// (resources/python on Windows) so the RFCOMM bridge works with zero user
// setup. Nothing is added to PATH; the runtime only runs inside SoundControl.
function bundledPythonPath() {
  const exe = process.platform === 'win32' ? 'python.exe' : 'python3';
  const candidates = [
    // Packaged: <install>/resources/python/python.exe
    path.join(process.resourcesPath || '', 'python', exe),
    // electron-builder always stages the archive's python.exe name
    path.join(process.resourcesPath || '', 'python', 'python.exe'),
    // Dev checkout: <repo>/python-embed/python.exe
    path.join(__dirname, 'python-embed', exe),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).size > 0) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// Preference order: the runtime bundled with the app first (no setup at all),
// then a user-installed Python. Windows has no guaranteed 'python' — it may be
// missing entirely or be the Microsoft Store stub that exits immediately; the
// readiness probe below filters those out.
function pythonCandidates() {
  const bundled = bundledPythonPath();
  const interpreters =
    process.platform === 'win32'
      ? [
          { cmd: 'py', args: ['-3'] },
          { cmd: 'py', args: [] },
          { cmd: 'python', args: [] },
          { cmd: 'python3', args: [] },
        ]
      : [
          { cmd: 'python3', args: [] },
          { cmd: 'python', args: [] },
        ];
  return bundled ? [{ cmd: bundled, args: [], bundled: true }, ...interpreters] : interpreters;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Is something already serving the bridge port? (user-run bridge, leftover
// instance). Uses the fast /health endpoint: /scan enumerates Windows PnP /
// Bluetooth devices and can take seconds, so probing it here used to report a
// healthy helper as "not responding" on slow machines.
//
// Resolves with the HTTP status code the listener returned, or null when
// nothing answered at all:
//   200        → a usable helper (ours, or a tokenless manual run)
//   401/403    → a token-protected helper from another session owns the port
//   other/null → port free (or something that is not our bridge)
function probeBridge(timeoutMs = 1200) {
  return new Promise((resolve) => {
    // Our own spawned bridge requires the token; a manually run (tokenless)
    // bridge simply ignores the extra header, so sending it unconditionally
    // keeps both cases working.
    const req = http.get(
      {
        host: '127.0.0.1',
        port: 8765,
        path: '/health',
        timeout: timeoutMs,
        headers: { Authorization: `Bearer ${bridgeToken}` },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

// Wait until the freshly spawned bridge actually answers HTTP — a definitive
// signal, and much faster than "the process is still alive after N seconds".
// The budget covers cold-start antivirus scans of a fresh install; readiness
// itself is the cheap /health check, never the slow PnP /scan enumeration.
// NOTE: the renderer's WebSocket startup budget (BRIDGE_STARTUP_TIMEOUT_MS in
// src/transports/bridge.ts, 15s) is deliberately larger than this 12s
// budget, so the renderer never declares the helper dead while this loop is
// still legitimately waiting for it.
async function waitForBridgeReady(child, budgetMs = 12000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if ((await probeBridge(800)) === 200) return true;
    await sleep(200);
  }
  return false;
}

// Kill every helper process this app owns: the ready one and any candidate
// still starting. Called from every quit path so no Python process outlives
// SoundControl and squats on port 8765.
function killBridgeProcesses() {
  if (bridgeRestartTimer) {
    clearTimeout(bridgeRestartTimer);
    bridgeRestartTimer = null;
  }
  for (const child of [bridgeProcess, pendingBridge]) {
    if (child) {
      try {
        child.kill();
      } catch {
        /* already dead */
      }
    }
  }
  bridgeProcess = null;
  pendingBridge = null;
}

// Re-run the normal startup path (port probe, interpreter fallbacks, readiness
// wait) after an adopted helper died mid-session. Bounded: see
// BRIDGE_MAX_AUTO_RESTARTS. The delay grows linearly so a helper that dies on
// startup in a loop cannot spin the CPU.
function scheduleBridgeRestart(label) {
  if (shuttingDown || bridgeProcess || bridgeRestartTimer) return;
  if (Date.now() - bridgeAdoptedAt >= BRIDGE_STABLE_RUN_MS) {
    // It had a long healthy run before dying — treat this as a fresh budget.
    bridgeAutoRestarts = 0;
  }
  if (bridgeAutoRestarts >= BRIDGE_MAX_AUTO_RESTARTS) {
    log(`bridge (${label}) died again; auto-restart budget exhausted — leaving it down`);
    return;
  }
  bridgeAutoRestarts += 1;
  const delay = 1000 * bridgeAutoRestarts;
  log(`bridge (${label}) died; auto-restart ${bridgeAutoRestarts}/${BRIDGE_MAX_AUTO_RESTARTS} in ${delay}ms`);
  bridgeRestartTimer = setTimeout(() => {
    bridgeRestartTimer = null;
    if (shuttingDown || bridgeProcess) return;
    startBridgeIfAvailable().catch((err) => log(`bridge auto-restart failed: ${err}`));
  }, delay);
}

async function startBridgeIfAvailable() {
  if (bridgeProcess) return;
  const scriptPath = bridgeScriptPath();
  try {
    if (!fs.existsSync(scriptPath)) {
      log(`bridge script not found at ${scriptPath}; skipping helper`);
      return;
    }
  } catch {
    /* proceed optimistically if existsSync misbehaves */
  }

  const existing = await probeBridge();
  if (existing === 200) {
    log('bridge already listening on 127.0.0.1:8765; not spawning another');
    return;
  }
  if (existing !== null) {
    // Something else owns the port — most often a helper from a previous
    // session that kept its (now unknown) token. Spawning here used to fail
    // every interpreter candidate with EADDRINUSE and then blame a broken
    // installation; say what actually happened instead.
    log(
      `port 8765 is owned by another process (HTTP ${existing}); not spawning a helper — ` +
        'if this is a stale SoundControl bridge, end that process and restart the app',
    );
    return;
  }

  const candidates = pythonCandidates();
  for (const { cmd, args, bundled } of candidates) {
    if (shuttingDown) return;
    const label = bundled ? 'bundled runtime' : cmd;
    let child;
    try {
      child = spawn(cmd, [...args, scriptPath, '--host', '127.0.0.1', '--port', '8765'], {
        windowsHide: true,
        env: { ...process.env, SOUNDCONTROL_BRIDGE_TOKEN: bridgeToken },
      });
    } catch (err) {
      log(`spawn ${label} threw: ${err}`);
      continue;
    }
    pendingBridge = child;

    const onOutput = (d) => log(`[bridge] ${String(d).trimEnd()}`);
    child.stderr.on('data', onOutput);
    child.stdout.on('data', onOutput);
    child.on('error', (err) => log(`bridge ${label} error: ${err.code || err.message}`));
    child.on('exit', (code) => {
      const wasAdopted = bridgeProcess === child;
      if (wasAdopted) bridgeProcess = null;
      if (pendingBridge === child) pendingBridge = null;
      log(`bridge (${label}) exited with code ${code}`);
      // An *adopted* helper dying mid-session is recoverable — restart it so
      // a renderer that is still open can reconnect without an app restart.
      // A candidate that never became ready is handled by the startup loop
      // itself (it moves to the next interpreter), so it must not restart here.
      if (wasAdopted && !shuttingDown) scheduleBridgeRestart(label);
    });

    if (await waitForBridgeReady(child)) {
      if (shuttingDown) {
        // The app quit while this candidate was starting; do not adopt it.
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        pendingBridge = null;
        return;
      }
      pendingBridge = null;
      bridgeProcess = child;
      bridgeAdoptedAt = Date.now();
      log(`bridge started via ${label}`);
      return;
    }

    log(`bridge ${label} never became ready; trying next interpreter`);
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    if (pendingBridge === child) pendingBridge = null;
    if (shuttingDown) return;
  }

  if (shuttingDown) return;
  onBridgeMissing();
}

// Last resort: the bundled runtime is missing AND no system Python works.
// With a normal installation this should never happen.
function onBridgeMissing() {
  log('bridge could not be started (no usable interpreter)');
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const flag = path.join(app.getPath('userData'), 'bridge-help-shown');
    if (fs.existsSync(flag)) return;
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(flag, String(Date.now()));
    dialog.showMessageBox({
      type: 'warning',
      title: 'Bluetooth helper could not start',
      message:
        'SoundControl ships its own Bluetooth helper, so this usually means the installation is incomplete.\n\n' +
        'Reinstall from the latest GitHub Release to fix it.\n\n' +
        'Alternatively, using your own Python 3 (winget install -e --id Python.Python.3.12) also works.',
      buttons: ['OK'],
    });
  } catch {
    /* guidance is best-effort */
  }
}

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  return true;
}

function createWindow() {
  const dev = process.env.VITE_DEV_SERVER_URL;
  const indexHtml = path.join(__dirname, 'dist', 'index.html');

  try {
    if (!dev && !fs.existsSync(indexHtml)) {
      throw new Error(
        `Application files are missing from the installation.\n` +
          `Expected: ${indexHtml}\n` +
          `Reinstall SoundControl from the latest GitHub Release.`,
      );
    }

    const win = new BrowserWindow({
      // Desktop-first layout: comfortable at 1280×720 and up, and the
      // minimum keeps the sidebar + content usable without a mobile fallback.
      width: 1280,
      height: 820,
      minWidth: 940,
      minHeight: 640,
      // Matches the dark renderer theme so a cold start never flashes white.
      backgroundColor: '#0a0e17',
      title: 'SoundControl — Desktop Companion for Soundcore',
      icon: path.join(__dirname, 'public', 'icon-512.png'),
      autoHideMenuBar: true,
      // Draw the window immediately rather than waiting for the renderer to
      // report ready: on a cold start (and especially when antivirus scans an
      // unsigned exe on first run) that wait is seconds of "nothing happened".
      show: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    mainWindow = win;

    win.once('ready-to-show', () => {
      win.show();
      win.focus();
      windowEverShown = true;
      log('window ready-to-show');
    });

    // Safety net: if the renderer never reports ready (e.g. a GPU/driver
    // quirk on some machines), still put the window on screen so the app
    // never looks like "nothing happened".
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        log('force-showing window (ready-to-show never fired)');
        win.show();
      }
    }, 4000);

    // Minimize-to-tray: only when the user enabled it AND the tray icon
    // really exists; a normal quit (before-quit sets shuttingDown) always
    // closes for real, so shutdown can never deadlock behind a hidden window.
    win.on('close', (event) => {
      if (!shuttingDown && settings.minimizeToTray && tray && !win.isDestroyed()) {
        event.preventDefault();
        win.hide();
        log('window hidden to tray (minimize-to-tray enabled)');
      }
    });

    win.on('closed', () => {
      mainWindow = null;
    });

    // External links (About page → GitHub releases) open in the default
    // browser; everything else is denied, and in-page navigation away from
    // the app origin is blocked. The renderer keeps no node access either
    // way (contextIsolation, nodeIntegration:false).
    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        const allowedHost = parsed.hostname === 'github.com' || parsed.hostname.endsWith('.github.com');
        if (parsed.protocol === 'https:' && allowedHost) {
          void shell.openExternal(parsed.toString());
        } else {
          log(`blocked window.open to ${parsed.protocol}//${parsed.hostname}`);
        }
      } catch {
        log(`blocked window.open with unparseable url`);
      }
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== win.webContents.getURL()) {
        event.preventDefault();
        log(`blocked in-window navigation to ${url}`);
      }
    });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      log(`did-fail-load ${code} ${desc} ${url}`);
      showFatal('SoundControl could not load its interface', `${desc} (code ${code})\n${url}`);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      showFatal(
        'The app window crashed',
        `Renderer exited (${details.reason}). Try restarting SoundControl.`,
      );
    });
    win.webContents.on('unresponsive', () => log('renderer unresponsive'));

    const load = dev ? win.loadURL(dev) : win.loadFile(indexHtml);
    load
      .then(() => log(`loaded ${dev || indexHtml}`))
      .catch((err) => showFatal('Failed to open the app window', String((err && err.message) || err)));
  } catch (err) {
    showFatal('Failed to start SoundControl', err && err.stack ? err.stack : String(err));
    app.quit();
  }
}

// Double-clicking the icon again should bring the existing window forward
// instead of launching a second headless instance that looks like a hang.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('another instance is already running; exiting');
  app.quit();
} else {
  app.on('second-instance', () => {
    log('second instance requested; focusing existing window');
    if (!focusWindow()) createWindow();
  });

  app.whenReady().then(() => {
    log(`starting ${app.getVersion()} on ${process.platform} ${os.release()}`);
    if (process.platform !== 'win32') {
      showFatal('Windows only', 'SoundControl is distributed as a Windows desktop application.');
      app.quit();
      return;
    }
    // Proper taskbar grouping / notification attribution on Windows.
    app.setAppUserModelId('com.soundcontrol.desktop');
    // Persisted user settings (launch-at-login, tray) — loaded and applied
    // before the window so a restart restores the chosen behavior exactly.
    loadSettings();
    applyLaunchAtLogin();
    ensureTray();
    // Fire-and-forget by design (the window must not wait for the helper),
    // but a rejection here must reach the log, not the void.
    startBridgeIfAvailable().catch((err) => log(`startBridgeIfAvailable failed: ${err}`));
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Covers every quit path — including a fatal error before any window existed,
// where `window-all-closed` never fires and a starting helper would be
// orphaned holding port 8765. The log line lets main.log distinguish a normal
// shutdown from a crash or a force-kill (which never reaches this handler).
app.on('before-quit', () => {
  log('app quitting; stopping the Bluetooth helper');
  shuttingDown = true;
  destroyTray();
  killBridgeProcesses();
});

app.on('window-all-closed', () => {
  shuttingDown = true;
  killBridgeProcesses();
  if (process.platform !== 'darwin') app.quit();
});
