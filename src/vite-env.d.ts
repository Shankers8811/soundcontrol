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
    /** Current Windows default-output volume, 0..100 (null if unavailable). */
    getSystemVolume?: () => Promise<number | null>;
    /** Sets the Windows default-output volume, 0..100. */
    setSystemVolume?: (value: number) => Promise<number | null>;
    /** Current Windows output balance, -100 (right) .. 100 (left). */
    getSystemBalance?: () => Promise<number | null>;
    /** Sets the Windows output balance, -100 (right) .. 100 (left). */
    setSystemBalance?: (value: number) => Promise<number | null>;
    /** Shows a native Windows notification (low-battery nudges). */
    notify?: (title: string, body: string) => Promise<boolean>;
    /** Enables/disables the optional app-wide ANC/EQ hotkeys. */
    setGlobalHotkeys?: (enabled: boolean) => Promise<{
      enabled: boolean;
      registered: string[];
    }>;
    /** Subscribe to hotkey presses; returns an unsubscribe function. */
    onHotkey?: (callback: (action: string) => void) => () => void;
  };
}
