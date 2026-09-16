const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  // The per-session bridge secret, minted by the main process. Only our own
  // renderer can ask for it (context isolation), and only over this IPC
  // channel — it never appears in argv, the DOM, or devtools-accessible state.
  getBridgeToken: () => ipcRenderer.invoke('soundcontrol:bridge-token'),
});
