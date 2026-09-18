import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/store';
import {
  getAppVersion,
  getSettings,
  isDesktop,
  openLogFolder,
  setSetting,
  type DesktopSettings,
} from '../lib/appSettings';
import { HexConsole } from '../components/HexConsole';
import { IconFolder, IconSound, IconTerminal, IconWindows } from '../components/Icons';
import { Button, Card, InlineError, InlineSuccess, PageHeader, SettingsRow, Toggle } from '../components/ui';

/**
 * Settings page (PART P) — every control really does something:
 *
 *  - Interface sounds: local UI feedback beeps, persisted (localStorage).
 *  - Launch at login: real `app.setLoginItemSettings` in the main process,
 *    persisted to %AppData%\soundcontrol\settings.json, re-applied at every
 *    startup — survives restarts because Windows itself stores it.
 *  - Minimize to tray: real Tray + close interception in the main process,
 *    persisted the same way (default off).
 *  - Open log folder: real `shell.openPath` on the userData directory that
 *    holds main.log.
 *  - Diagnostics console: the real TX/RX/sys log with JSON/CSV export.
 *
 * Nothing here is a decorative switch: rows that need the desktop shell are
 * disabled with an explicit reason in plain browser mode, and there is no
 * theme/accent/updater row because the app has exactly one approved theme
 * and no update channel — a fake one would violate the no-fake-UI rule.
 */

const DESKTOP_ONLY_NOTE = 'Available in the SoundControl Windows desktop app.';

export function SettingsPage() {
  const app = useApp();
  const desktop = isDesktop();

  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [pendingKey, setPendingKey] = useState<keyof DesktopSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [folderOpened, setFolderOpened] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    if (desktop) {
      void getSettings().then((s) => {
        if (!stopped) setSettings(s);
      });
      void getAppVersion().then((v) => {
        if (!stopped) setVersion(v);
      });
    }
    return () => {
      stopped = true;
    };
  }, [desktop]);

  const apply = useCallback(
    async (key: keyof DesktopSettings, value: boolean) => {
      setPendingKey(key);
      setSettingsError(null);
      setSavedNotice(null);
      const confirmed = await setSetting(key, value);
      setPendingKey(null);
      if (!confirmed) {
        setSettingsError(`Could not change "${key}" — the desktop app did not confirm the write.`);
        return;
      }
      // The main process is the source of truth: render what it confirmed.
      setSettings(confirmed);
      setSavedNotice(
        key === 'launchAtLogin'
          ? confirmed.launchAtLogin
            ? 'SoundControl will start with Windows.'
            : 'Launch at login removed from Windows.'
          : confirmed.minimizeToTray
            ? 'Closing the window now minimizes to the tray.'
            : 'Closing the window now quits SoundControl.',
      );
    },
    [],
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        sub={
          <>
            <span>Every setting here is persisted and really changes app behavior</span>
            {version && <span className="font-mono text-[10px] text-faint">v{version}</span>}
          </>
        }
      />

      <div className="max-w-3xl space-y-4">
        {settingsError && <InlineError message={settingsError} onDismiss={() => setSettingsError(null)} />}
        {savedNotice && <InlineSuccess message={savedNotice} />}

        {/* -------------------------------------------------- application */}
        <Card title="Application">
          <div className="-mx-5 -my-4">
            <SettingsRow
              title="Interface sounds"
              sub="Short confirmation tones in this app when commands and mode changes succeed (never sent to the device)"
              control={
                <Toggle
                  label="Interface sounds"
                  checked={app.prompts}
                  onChange={(on) => app.setPrompts(on)}
                />
              }
            />
            <SettingsRow
              title="Launch at login"
              sub={
                desktop
                  ? 'Registers SoundControl in the Windows startup entries (registry, per user). Applies on the next sign-in.'
                  : 'Start SoundControl automatically when Windows starts'
              }
              disabled={!desktop}
              disabledNote={!desktop ? DESKTOP_ONLY_NOTE : undefined}
              control={
                <Toggle
                  label="Launch at login"
                  checked={settings?.launchAtLogin ?? false}
                  disabled={!desktop || pendingKey !== null}
                  onChange={(on) => void apply('launchAtLogin', on)}
                />
              }
            />
            <SettingsRow
              title="Minimize to tray"
              sub={
                desktop
                  ? 'The close button hides SoundControl to the system tray instead of quitting; the tray menu offers Show and Quit.'
                  : 'Keep SoundControl running in the system tray when the window is closed'
              }
              disabled={!desktop}
              disabledNote={!desktop ? DESKTOP_ONLY_NOTE : undefined}
              control={
                <Toggle
                  label="Minimize to tray"
                  checked={settings?.minimizeToTray ?? false}
                  disabled={!desktop || pendingKey !== null}
                  onChange={(on) => void apply('minimizeToTray', on)}
                />
              }
            />
            <SettingsRow
              title="Log folder"
              sub={
                <>
                  <span className="font-mono text-[11px]">%AppData%\soundcontrol</span> — helper and
                  startup diagnostics (main.log)
                </>
              }
              disabled={!desktop}
              disabledNote={!desktop ? DESKTOP_ONLY_NOTE : undefined}
              control={
                <Button
                  size="sm"
                  disabled={!desktop}
                  onClick={async () => setFolderOpened(await openLogFolder())}
                >
                  <IconFolder size={14} /> Open
                </Button>
              }
            />
          </div>
          {desktop && folderOpened === false && (
            <p className="mt-2 text-[11px] text-warn">
              Windows did not open the folder — it may not exist yet (it is created on first log
              write).
            </p>
          )}
        </Card>

        {/* ------------------------------------------------- diagnostics */}
        <Card
          title="Diagnostics"
          subtitle="Live protocol console: TX/RX frames with checksum validation, JSON/CSV export, and manual frame injection"
          actions={
            <Button size="sm" onClick={() => setConsoleOpen((v) => !v)} aria-expanded={consoleOpen}>
              <IconTerminal size={14} />
              {consoleOpen ? 'Hide console' : 'Open console'}
            </Button>
          }
        >
          {consoleOpen ? (
            <HexConsole />
          ) : (
            <p className="text-xs leading-relaxed text-mute">
              The console exports exactly what a bug report needs — every frame sent and received,
              with timestamps and checksum validity. Secrets (the bridge session token) are never
              part of it: the helper redacts tokens from its own access log as well.
            </p>
          )}
        </Card>

        {/* --------------------------------------- developer tools (dev) */}
        {import.meta.env.DEV && (
          <Card title="Developer tools" subtitle="Visible only in development builds — never in the packaged app">
            <p className="text-xs leading-relaxed text-mute">
              Simulated devices exercise the full UI state machine (telemetry parsing, capability
              gating, rollbacks) without Bluetooth hardware. They are clearly labelled “(sim)”
              everywhere and cannot be reached from a production install.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['p30i', 'P30i / R50i NC'],
                ['liberty-4-nc', 'Liberty 4 NC'],
                ['space-one', 'Space One'],
                ['q30', 'Life Q30'],
              ].map(([id, name]) => (
                <Button key={id} size="sm" disabled={app.connecting} onClick={() => void app.connectSim(id).catch(() => {})}>
                  {name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* ------------------------------------------- platform footer */}
        <p className="flex items-center justify-center gap-2 pb-2 text-[11px] text-faint">
          {desktop ? <IconWindows size={13} /> : <IconSound size={13} />}
          {desktop
            ? `Windows desktop app${version ? ` · v${version}` : ''} · bundled Python helper on 127.0.0.1:8765`
            : 'Running in a browser — desktop-only settings are disabled, device features need the Windows app'}
        </p>
      </div>
    </div>
  );
}
