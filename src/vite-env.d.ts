/// <reference types="vite/client" />

// Injected by Vite from the canonical GitHub repository URL.
declare const __REPO_URL__: string;
// Injected by Vite from package.json — the real application version.
declare const __APP_VERSION__: string;
// Injected by Vite for demo mode (GitHub Pages preview build).
declare const __DEMO__: boolean;

interface Window {
  // Exposed by preload.cjs inside the packaged Windows/Linux desktop app.
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    version: string;
    /** Low-memory mode flag (set by main process based on RAM). */
    isLowMemory?: boolean;
    /** Per-session bridge secret, minted by the main process. */
    getBridgeToken?: () => Promise<string>;
    /** Application version (app.getVersion()). */
    getAppVersion?: () => Promise<string>;
    /** Opens %AppData%\soundcontrol in the file manager. */
    openLogFolder?: () => Promise<boolean>;
  };
}
