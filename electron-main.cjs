const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
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

function startBridgeIfAvailable() {
  try {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = bridgeScriptPath();
    bridgeProcess = spawn(pythonCmd, [scriptPath, '--host', '127.0.0.1', '--port', '8765']);
    bridgeProcess.stderr.on('data', (d) => {
      log(`[bridge] ${d}`);
    });
    bridgeProcess.on('error', () => {
      // Python not installed or not in PATH, fallback to Web Bluetooth
      log('bridge unavailable (python not found); falling back to Web Bluetooth');
      bridgeProcess = null;
    });
  } catch {
    bridgeProcess = null;
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
      show: false,
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
