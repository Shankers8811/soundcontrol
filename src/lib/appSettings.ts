/**
 * Renderer-side access to the desktop application settings that live in the
 * Electron main process (persisted to %AppData%\soundcontrol\settings.json).
 *
 * Every function degrades to `null`/`false` outside the packaged app (plain
 * browser dev mode) — the Settings page uses that to show an honest
 * "available in the Windows desktop app" state instead of a dead toggle.
 */

export interface DesktopSettings {
  /** Start SoundControl when Windows starts (app.setLoginItemSettings). */
  launchAtLogin: boolean;
  /** Closing the window hides to the system tray instead of quitting. */
  minimizeToTray: boolean;
}

function api(): Window['electronAPI'] {
  // Guarded for non-browser contexts (SSR smoke tests, tooling); in the real
  // app window always exists and electronAPI is injected only by Electron.
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI;
}

/** True when the richer desktop IPC surface is available. */
export function isDesktop(): boolean {
  return typeof api()?.getSettings === 'function';
}

export function isWindows(): boolean {
  return api()?.platform === 'win32';
}

export async function getSettings(): Promise<DesktopSettings | null> {
  try {
    const s = await api()?.getSettings?.();
    if (!s || typeof s !== 'object') return null;
    return {
      launchAtLogin: Boolean(s.launchAtLogin),
      minimizeToTray: Boolean(s.minimizeToTray),
    };
  } catch {
    return null;
  }
}

/** Returns the settings as confirmed by the main process (source of truth). */
export async function setSetting(
  key: keyof DesktopSettings,
  value: boolean,
): Promise<DesktopSettings | null> {
  try {
    const s = await api()?.setSetting?.(key, value);
    if (!s || typeof s !== 'object') return null;
    return {
      launchAtLogin: Boolean(s.launchAtLogin),
      minimizeToTray: Boolean(s.minimizeToTray),
    };
  } catch {
    return null;
  }
}

/** Opens %AppData%\soundcontrol (main.log location) in Explorer. */
export async function openLogFolder(): Promise<boolean> {
  try {
    return (await api()?.openLogFolder?.()) === true;
  } catch {
    return false;
  }
}

/** Application version from the main process (package.json at build time). */
export async function getAppVersion(): Promise<string | null> {
  try {
    const v = await api()?.getAppVersion?.();
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}
