/**
 * Renderer-side access to the desktop application surface that lives in the
 * Electron main process (version, log folder).
 *
 * Every function degrades to `null`/`false` outside the packaged app (plain
 * browser dev mode) — the Settings page uses that to show an honest
 * "available in the Windows desktop app" state instead of a dead control.
 *
 * There is intentionally no settings read/write API: launch-at-login and
 * minimize-to-tray no longer exist. The product policy is fixed — the app
 * never starts with Windows and always quits when the window closes — and is
 * enforced in the main process (autostart.cjs), so no persisted or renderer
 * state can change it.
 */

function api(): Window['electronAPI'] {
  // Guarded for non-browser contexts (SSR smoke tests, tooling); in the real
  // app window always exists and electronAPI is injected only by Electron.
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI;
}

/** True when the richer desktop IPC surface is available. */
export function isDesktop(): boolean {
  return typeof api()?.getAppVersion === 'function';
}

export function isWindows(): boolean {
  return api()?.platform === 'win32';
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
