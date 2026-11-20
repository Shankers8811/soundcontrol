/// <reference types="vite/client" />

// Injected by Vite from the canonical GitHub repository URL.
declare const __REPO_URL__: string;
// Injected by Vite from package.json — the real application version.
declare const __APP_VERSION__: string;

/**
 * A validated, user-installed device profile. Phase 1 keeps `document` opaque
 * in the renderer; Phase 2 narrows it to the full profile type.
 */
interface DeviceProfileSummary {
  file: string;
  id: string;
  name: string;
  sku: string;
  kind: 'earbuds' | 'overear';
  family: 'tws' | 'classic';
  schemaVersion: number;
  verified: boolean;
  fallback: boolean;
  matchNames: string[];
  mtimeMs: number;
  size: number;
}

interface DeviceProfileEntry extends DeviceProfileSummary {
  document: unknown;
  builtin?: true;
}

interface DeviceProfileIssue {
  file: string | null;
  path: string;
  code: string;
  message: string;
}

interface DeviceProfilesSnapshot {
  schemaVersion: number;
  folder: string;
  exists: boolean;
  scannedAt: number;
  profiles: DeviceProfileEntry[];
  errors: DeviceProfileIssue[];
  builtin: DeviceProfileEntry[];
  builtinErrors: DeviceProfileIssue[];
  counts: {
    files: number;
    valid: number;
    invalid: number;
    builtin: number;
  };
}

interface DeviceProfilesOpenResult {
  ok: boolean;
  path: string;
  error: string | null;
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
    /** Opens %AppData%\soundcontrol in the file manager. */
    openLogFolder?: () => Promise<boolean>;
    /** Validated snapshot of %AppData%\soundcontrol\device_profiles. */
    listDeviceProfiles?: () => Promise<DeviceProfilesSnapshot>;
    /** Absolute path of the device_profiles folder (display only). */
    getDeviceProfilesFolder?: () => Promise<string>;
    /** Creates the folder if needed and opens it in Explorer. */
    openDeviceProfilesFolder?: () => Promise<DeviceProfilesOpenResult>;
    /** Subscribe to folder changes; returns an unsubscribe function. */
    onDeviceProfilesChanged?: (
      callback: (snapshot: DeviceProfilesSnapshot) => void,
    ) => () => void;
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
