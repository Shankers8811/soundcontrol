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
  //
  // Earbud-only boundary (Phase 17): there is also deliberately NO channel
  // that touches Windows audio — no volume, mute, default-device, endpoint,
  // mixer, enhancement or Sound-settings IPC exists or may be added. The
  // renderer controls earbuds over the Bluetooth bridge, never the PC.
  getAppVersion: () => ipcRenderer.invoke('soundcontrol:app-version'),
  openLogFolder: () => ipcRenderer.invoke('soundcontrol:open-log-folder'),
});
