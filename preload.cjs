const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  // The per-session bridge secret, minted by the main process. Only our own
  // renderer can ask for it (context isolation), and only over this IPC
  // channel — it never appears in argv, the DOM, or devtools-accessible state.
  getBridgeToken: () => ipcRenderer.invoke('soundcontrol:bridge-token'),
  // Desktop application surface used by the Settings/About pages. The main
  // process validates every call (whitelisted setting keys, boolean values,
  // fixed log-folder path), so the renderer can never steer these IPC
  // channels anywhere else.
  getAppVersion: () => ipcRenderer.invoke('soundcontrol:app-version'),
  getSettings: () => ipcRenderer.invoke('soundcontrol:get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('soundcontrol:set-setting', key, value),
  openLogFolder: () => ipcRenderer.invoke('soundcontrol:open-log-folder'),
});
