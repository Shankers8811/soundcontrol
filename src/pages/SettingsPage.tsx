import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { getAppVersion, isDesktop, openLogFolder } from '../lib/appSettings';
import { HexConsole } from '../components/HexConsole';
import { IconFolder, IconSound, IconTerminal, IconWindows } from '../components/Icons';
import { Button, Card, PageHeader, SettingsRow, Toggle } from '../components/ui';

/**
 * Settings page (PART P) — every control really does something:
 *
 *  - Interface sounds: local UI feedback beeps, persisted (localStorage).
 *  - Startup & exit: states the fixed release policy (the app never starts
 *    with Windows and quits completely when the window is closed). It is a
 *    statement, not a toggle — the behaviour is enforced in the main process
 *    (autostart.cjs) and deliberately cannot be switched off.
 *  - Open log folder: real `shell.openPath` on the userData directory that
 *    holds main.log.
 *  - Diagnostics console: the real TX/RX/sys log with JSON/CSV export.
 *
 * Launch-at-login and minimize-to-tray existed in older versions and were
 * removed for the release: a desktop utility must not survive its own window
 * or sneak into Windows startup. Nothing here is a decorative switch: rows
 * that need the desktop shell are disabled with an explicit reason in plain
 * browser mode, and there is no theme/accent/updater row because the app has
 * exactly one approved theme and no update channel — a fake one would
 * violate the no-fake-UI rule.
 */

const DESKTOP_ONLY_NOTE = 'Available in the SoundControl Windows desktop app.';

export function SettingsPage() {
  const app = useApp();
  const desktop = isDesktop();

  const [folderOpened, setFolderOpened] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    if (desktop) {
      void getAppVersion().then((v) => {
        if (!stopped) setVersion(v);
      });
    }
    return () => {
      stopped = true;
    };
  }, [desktop]);

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
              title="Startup & exit"
              sub="SoundControl never starts with Windows and quits completely when the window is closed — no tray, no background helper, no startup registration. A startup entry left by an older version is removed automatically at launch."
              control={
                <span className="rounded border border-edge bg-sunken px-2 py-1 text-[10px] font-medium text-mute">
                  manual launch · quits on close
                </span>
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
