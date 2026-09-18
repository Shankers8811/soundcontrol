/// <reference types="vite/client" />

// Injected by Vite from the canonical GitHub repository URL.
declare const __REPO_URL__: string;
// Injected by Vite from package.json — the real application version.
declare const __APP_VERSION__: string;

interface Window {
  // Exposed by preload.cjs inside the packaged Windows desktop app.
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    version: string;
    /** Per-session bridge secret, minted by the main process. */
    getBridgeToken?: () => Promise<string>;
    /** Application version (app.getVersion()). */
    getAppVersion?: () => Promise<string>;
    /** Opens %AppData%\soundcontrol in the file manager. */
    openLogFolder?: () => Promise<boolean>;
  };
}
