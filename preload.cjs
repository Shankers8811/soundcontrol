const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  // The per-session bridge secret, minted by the main process. Only our own
  // renderer can ask for it (context isolation), and only over this IPC
  // channel — it never appears in argv, the DOM, or devtools-accessible state.
  getBridgeToken: () => ipcRenderer.invoke('soundcontrol:bridge-token'),
  // Desktop application surface used by the Settings/About pages. There is
  // deliberately no settings-write channel: startup/tray behaviour is a fixed
  // product policy enforced by the main process (autostart.cjs), not a
  // user-toggleable setting, so nothing in the renderer can alter it.
  getAppVersion: () => ipcRenderer.invoke('soundcontrol:app-version'),
  openLogFolder: () => ipcRenderer.invoke('soundcontrol:open-log-folder'),
  // Windows default-output volume. The Soundcore RFCOMM protocol has no
  // volume command, so the Volume card controls the OS mixer instead.
  getSystemVolume: () => ipcRenderer.invoke('soundcontrol:get-system-volume'),
  setSystemVolume: (value) => ipcRenderer.invoke('soundcontrol:set-system-volume', value),
  // Windows output balance (per-channel levels) and native notifications.
  getSystemBalance: () => ipcRenderer.invoke('soundcontrol:get-system-balance'),
  setSystemBalance: (value) => ipcRenderer.invoke('soundcontrol:set-system-balance', value),
  notify: (title, body) => ipcRenderer.invoke('soundcontrol:notify', title, body),
  // Optional app-wide hotkeys. The main process registers them only while the
  // toggle is on and forwards a press as a plain action string; the renderer
  // maps that to the same real device frames the UI uses.
  setGlobalHotkeys: (enabled) => ipcRenderer.invoke('soundcontrol:set-global-hotkeys', enabled),
  onHotkey: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('soundcontrol:hotkey', listener);
    return () => ipcRenderer.removeListener('soundcontrol:hotkey', listener);
  },
});
