const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Enable Web Bluetooth & hardware access in Electron
app.commandLine.appendSwitch('enable-web-bluetooth');
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

let bridgeProcess = null;

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
      console.log(`[bridge] ${d}`);
    });
    bridgeProcess.on('error', () => {
      // Python not installed or not in PATH, fallback to Web Bluetooth
      bridgeProcess = null;
    });
  } catch {
    bridgeProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 800,
    minHeight: 640,
    backgroundColor: '#d8e2ef',
    title: 'SoundControl — Desktop Companion for Soundcore',
    icon: path.join(__dirname, 'public', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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

  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) {
    win.loadURL(dev);
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.soundcontrol.app');
  }
  startBridgeIfAvailable();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (bridgeProcess) {
    try {
      bridgeProcess.kill();
    } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});
