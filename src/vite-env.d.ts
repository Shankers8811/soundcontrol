/// <reference types="vite/client" />

// Injected by Vite from the canonical GitHub repository URL.
declare const __REPO_URL__: string;
// Injected by Vite from package.json — the real application version.
declare const __APP_VERSION__: string;

interface ElectronSettings {
  launchAtLogin?: boolean;
  minimizeToTray?: boolean;
}

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
    /** Persisted desktop settings (see src/lib/appSettings.ts). */
    getSettings?: () => Promise<ElectronSettings>;
    /** Whitelisted boolean settings only; main process validates the key. */
    setSetting?: (key: string, value: boolean) => Promise<ElectronSettings>;
    /** Opens %AppData%\soundcontrol in the file manager. */
    openLogFolder?: () => Promise<boolean>;
  };
}
