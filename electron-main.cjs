const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Enable Web Bluetooth & hardware access in Electron
app.commandLine.appendSwitch('enable-web-bluetooth');
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

let bridgeProcess = null;
let mainWindow = null;
let windowEverShown = false;

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
// instance). 700 ms is plenty for a loopback request and keeps startup snappy.
function probeBridge(timeoutMs = 700) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 8765, path: '/scan', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

// Wait until the freshly spawned bridge actually answers HTTP — a definitive
// signal, and much faster than "the process is still alive after N seconds".
async function waitForBridgeReady(child, budgetMs = 5000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (await probeBridge(500)) return true;
    await sleep(150);
  }
  return false;
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

  if (await probeBridge()) {
    log('bridge already listening on 127.0.0.1:8765; not spawning another');
    return;
  }

  const candidates = pythonCandidates();
  for (const { cmd, args, bundled } of candidates) {
    const label = bundled ? 'bundled runtime' : cmd;
    let child;
    try {
      child = spawn(cmd, [...args, scriptPath, '--host', '127.0.0.1', '--port', '8765'], {
        windowsHide: true,
      });
    } catch (err) {
      log(`spawn ${label} threw: ${err}`);
      continue;
    }

    const onOutput = (d) => log(`[bridge] ${String(d).trimEnd()}`);
    child.stderr.on('data', onOutput);
    child.stdout.on('data', onOutput);
    child.on('error', (err) => log(`bridge ${label} error: ${err.code || err.message}`));
    child.on('exit', (code) => {
      if (bridgeProcess === child) bridgeProcess = null;
      log(`bridge (${label}) exited with code ${code}`);
    });

    if (await waitForBridgeReady(child)) {
      bridgeProcess = child;
      log(`bridge started via ${label}`);
      return;
    }

    log(`bridge ${label} never became ready; trying next interpreter`);
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }

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
      width: 1200,
      height: 850,
      minWidth: 800,
      minHeight: 640,
      backgroundColor: '#d8e2ef',
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

    win.on('closed', () => {
      mainWindow = null;
    });

    // Handle Web Bluetooth device discovery in Electron
    win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
      event.preventDefault();
      if (deviceList && deviceList.length > 0) {
        // Find matching Soundcore device or pick first discovered
        const hit = deviceList.find((d) => {
          const name = (d.deviceName || '').toLowerCase();
          return (
            name.includes('soundcore') ||
            name.includes('anker') ||
            name.includes('life') ||
            name.includes('liberty') ||
            name.includes('space') ||
            name.includes('r50i') ||
            name.includes('p30i') ||
            name.includes('p20i') ||
            name.includes('q30') ||
            name.includes('q35') ||
            name.includes('q45')
          );
        });
        callback(hit ? hit.deviceId : deviceList[0].deviceId);
      }
    });

    // Bluetooth pairing handler
    if (win.webContents.session.setBluetoothPairingHandler) {
      win.webContents.session.setBluetoothPairingHandler((details, callback) => {
        callback({ response: 'confirm' });
      });
    }

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
    if (process.platform === 'win32') {
      // Proper taskbar grouping / notification attribution on Windows.
      app.setAppUserModelId('com.soundcontrol.desktop');
    }
    startBridgeIfAvailable();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (bridgeProcess) {
    try {
      bridgeProcess.kill();
    } catch {
      /* already dead */
    }
    bridgeProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
