import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import {
  getAppVersion,
  getDeviceProfilesFolder,
  isDesktop,
  openDeviceProfilesFolder,
  openLogFolder,
} from '../lib/appSettings';
import { REPO_URL } from '../lib/downloads';
import { HexConsole } from '../components/HexConsole';
import { ThemeSection } from '../components/ThemeSection';
import { UpdatesSection } from '../components/UpdatesSection';
import { FeedbackSection } from '../components/FeedbackSection';
import { ReportSection } from '../components/ReportSection';
import { AboutSection } from './AboutPage';
import { IconExternal, IconFolder, IconSound, IconTerminal, IconWindows } from '../components/Icons';
import { Button, Card, InfoRow, PageHeader, SettingsRow, Toggle } from '../components/ui';

/**
 * Settings page (PART P, Pass 8 consolidation) — the single home of every
 * secondary feature. Sections, in order: Device, Appearance, Updates,
 * Feedback & rating, Report a problem, Startup & exit, About — then the
 * original Application and Diagnostics cards. Every control really does
 * something, and everything that has no backend says so plainly:
 *
 *  - Device: real store state only (name/model/firmware/serial read from the
 *    device over 01:05); honest "no device connected" otherwise.
 *  - Appearance: System / Dark / Light, persisted (`sc.theme`), applied live
 *    by the shell — the only theme control in the app (none in the sidebar).
 *  - Updates: queries the official GitHub Releases API for this repository
 *    and reports the true outcome; never fabricates an update and never
 *    downloads anything.
 *  - Feedback & rating / Report a problem: no backend exists, so nothing is
 *    "submitted" — the app assembles real text (with token redaction),
 *    copies/saves it locally and links to the project's real issue tracker.
 *  - Startup & exit: the fixed release policy as a statement, not a toggle —
 *    enforced in the main process (autostart.cjs); no launch-at-login, no
 *    tray, no background operation, removable-by-nothing.
 *  - About: the former About page, embedded unchanged (real version, real
 *    links, license/credits).
 *  - Interface sounds / log folder / diagnostics console: unchanged from
 *    previous passes; rows needing the desktop shell stay disabled with an
 *    explicit reason in plain browser mode.
 */

const DESKTOP_ONLY_NOTE = 'Available in the SoundControl Windows desktop app.';

/** Capability summary chips — derived state, never invented. */
function CapabilityChips({ items }: { items: Array<[string, boolean]> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([label, on]) => (
        <span
          key={label}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            on ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-edge bg-sunken text-faint line-through'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const app = useApp();
  const desktop = isDesktop();

  const [folderOpened, setFolderOpened] = useState<boolean | null>(null);
  const [profilesFolderOpened, setProfilesFolderOpened] = useState<boolean | null>(null);
  const [profilesPath, setProfilesPath] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

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

  // Resolve the real %AppData% path for display. The canonical
  // %AppData%\soundcontrol\device_profiles form is always shown too, so the
  // instructions still make sense outside the desktop shell.
  useEffect(() => {
    if (!desktop) return;
    let stopped = false;
    void getDeviceProfilesFolder().then((path) => {
      if (!stopped) setProfilesPath(path);
    });
    return () => {
      stopped = true;
    };
  }, [desktop]);

  const caps = app.capabilities;
  const installedProfileCount = app.availableProfiles.filter((p) => !p.fallback).length;

  const downloadSettings = () => {
    const blob = new Blob([app.exportSettings()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'soundcontrol-settings.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage('Settings exported. The file stays on this PC.');
  };

  const importSettingsFile = async (file: File | null) => {
    if (!file) return;
    const result = app.importSettings(await file.text());
    setBackupMessage(result.message);
  };

  const resetSettings = () => {
    if (!window.confirm('Reset every local SoundControl setting (theme, preferences, saved EQ curves and the recent list)? The device is not touched.')) {
      return;
    }
    app.resetAppSettings();
    setBackupMessage('Local settings reset to defaults. The device was not changed.');
  };

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
        {/* ------------------------------------------------------- device */}
        <Card
          title="Device"
          subtitle={
            app.connected
              ? 'Read from the device over the real protocol — never guessed'
              : 'Connect a device to see its real information here'
          }
        >
          {app.connected ? (
            <div className="space-y-3">
              <div>
                <InfoRow label="Device" value={app.deviceName} />
                <InfoRow label="Model" value={`${app.profile.name} (${app.profile.sku})`} />
                <InfoRow label="Firmware" value={app.firmware} mono />
                <InfoRow label="Serial" value={app.serial ?? '(not read yet)'} mono />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  Supported by this model
                </p>
                <CapabilityChips
                  items={[
                    ['Noise control', caps.supportsNoiseControl],
                    ['Equalizer', caps.supportsEqualizer],
                    ['Gaming mode', caps.supportsGaming],
                    ['Surround', caps.supportsSurround],
                    ['Dual connection', caps.supportsDual],
                    ['LDAC', caps.supportsLdac],
                    ['Per-earbud battery', caps.supportsPerEarbudBattery],
                    ['Case battery', caps.supportsCaseBattery],
                    ['Firmware info', caps.supportsFirmwareInfo],
                    ['Factory reset', caps.supportsFactoryReset],
                    // Protocol-wide constants — honest about what NO model gets:
                    ['Volume (no protocol command)', false],
                    ['Gesture writes (undocumented)', false],
                  ]}
                />
              </div>
              {caps.gamingBlockedByFirmware && (
                <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
                  Gaming mode is hidden for this unit: the documented minimum is firmware{' '}
                  <span className="font-mono">{caps.gamingMinFirmware}</span>, but the device
                  reports <span className="font-mono">{app.firmware}</span>.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-relaxed text-mute">
                No device connected — nothing is shown rather than remembered: device state never
                survives a disconnect.
              </p>
              <Button size="sm" onClick={() => app.setPage('devices')}>
                Open Devices
              </Button>
            </div>
          )}
        </Card>

        {/* --------------------------------------------------- appearance */}
        <Card
          title="Appearance"
          subtitle="Theme applies immediately and persists between launches — System follows the Windows appearance preference"
        >
          <ThemeSection />
        </Card>

        {/* ------------------------------------------- connection & behavior */}
        <Card
          title="Connection & behavior"
          subtitle="Local preferences — automatic actions still send only documented device frames"
        >
          <div className="-mx-5 -my-4">
            <SettingsRow
              title="Reconnect to the last device on launch"
              sub="Off by default. When on, SoundControl opens the same bridge session the Devices page uses after launch — it never runs in the background."
              control={
                <Toggle
                  label="Reconnect to the last device on launch"
                  checked={app.preferences.autoReconnect}
                  onChange={(on) => app.setPreference('autoReconnect', on)}
                />
              }
            />
            <SettingsRow
              title="Re-apply settings when the second earbud connects"
              sub="When the device reports a presence change from one side to both, the current ANC intent and remembered EQ are re-sent through their real frames."
              control={
                <Toggle
                  label="Re-apply settings when the second earbud connects"
                  checked={app.preferences.reapplyOnSecondBud}
                  onChange={(on) => app.setPreference('reapplyOnSecondBud', on)}
                />
              }
            />
            <SettingsRow
              title="Remember a separate EQ for each noise mode"
              sub="Local memory only: applying a curve records it for ANC/Adaptive, Normal or Transparency, and switching modes re-sends the remembered EQ frame."
              control={
                <Toggle
                  label="Remember a separate EQ for each noise mode"
                  checked={app.preferences.perModeEq}
                  onChange={(on) => app.setPreference('perModeEq', on)}
                />
              }
            />
            <SettingsRow
              title="Low-battery Windows notifications"
              sub="A native toast when real telemetry reports a side or the charging case below 20%. The in-app activity log always records the same nudge."
              control={
                <Toggle
                  label="Low-battery Windows notifications"
                  checked={app.preferences.lowBatteryNotifications}
                  onChange={(on) => app.setPreference('lowBatteryNotifications', on)}
                />
              }
            />
            <SettingsRow
              title="App-wide hotkeys"
              sub="While SoundControl is running: Ctrl+Alt+N cycles Noise Cancellation → Normal → Transparency, and Ctrl+Alt+E cycles the factory EQ presets. Both send the same documented frames as a click and do nothing when no device is connected."
              control={
                <Toggle
                  label="App-wide hotkeys"
                  checked={app.preferences.globalHotkeys}
                  onChange={(on) => app.setPreference('globalHotkeys', on)}
                />
              }
            />
          </div>
        </Card>

        {/* ------------------------------------------------ backup & restore */}
        <Card
          title="Backup & restore"
          subtitle="Local JSON only — theme, preferences, saved EQ curves and the recent list. Device state is never included."
        >
          <div className="-mx-5 -my-4">
            <SettingsRow
              title="Export settings"
              sub="Writes one JSON file with the local settings above. Nothing is uploaded."
              control={
                <Button size="sm" onClick={downloadSettings}>
                  Export
                </Button>
              }
            />
            <SettingsRow
              title="Restore settings"
              sub="Reads a file produced by Export. Invalid files are rejected; individual sections are sanitized."
              control={
                <Button size="sm" onClick={() => importRef.current?.click()}>
                  Choose file
                </Button>
              }
            />
            <SettingsRow
              title="Reset local settings"
              sub="Returns theme, preferences, saved EQ curves and the recent list to defaults. It never sends a reset to the device."
              control={
                <Button size="sm" variant="danger" onClick={resetSettings}>
                  Reset
                </Button>
              }
            />
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Restore settings file"
            onChange={(e) => {
              void importSettingsFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          {backupMessage && <p className="mt-3 text-[11px] leading-relaxed text-mute">{backupMessage}</p>}
        </Card>

        {/* ------------------------------------------------------ updates */}
        <Card
          title="Updates"
          subtitle="Manual by design — the check reads the official GitHub releases for this repository and nothing is ever downloaded automatically"
        >
          <UpdatesSection />
        </Card>

        {/* --------------------------------------------- feedback & rating */}
        <Card
          title="Feedback & rating"
          subtitle="No feedback server exists — your rating is prepared locally (copy + file) and delivered by you through the project's real issue tracker"
        >
          <FeedbackSection />
        </Card>

        {/* ----------------------------------------------- report a problem */}
        <Card
          title="Report a problem"
          subtitle="Assembles a real report from live app state and the protocol log — with token redaction; nothing is uploaded behind your back"
        >
          <ReportSection />
        </Card>

        {/* ----------------------------------------------- startup & exit */}
        <Card title="Startup & exit">
          <SettingsRow
            title="Windows startup"
            sub="SoundControl never starts with Windows and quits completely when the window is closed — no tray, no background helper, no startup registration. A startup entry left by an older version is removed automatically at launch."
            control={
              <span className="rounded border border-edge bg-sunken px-2 py-1 text-[10px] font-medium text-mute">
                manual launch · quits on close
              </span>
            }
          />
          <p className="px-5 pb-4 pt-1 text-[11px] leading-relaxed text-faint">
            This is fixed release policy, not a preference: the main process enforces
            no-autostart on every launch and kills the Bluetooth helper on close, so there is
            deliberately no toggle here.
          </p>
        </Card>

        {/* -------------------------------------------------------- about */}
        {/* AboutSection brings its own cards (unchanged former About page),
            so it gets a section label rather than a double-framing Card. */}
        <div>
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
            About
          </p>
          <AboutSection />
        </div>

        {/* ---------------------------------------------- device profiles */}
        {/* Offline by design: model support is data the user installs, never a
            download the app performs. The card states the exact folder, opens
            it on request, and links to the real profiles directory. */}
        <Card
          title="Device profiles"
          subtitle="Offline by design — model support comes from JSON files you install yourself"
        >
          <p className="text-xs leading-relaxed text-mute">
            SoundControl ships no model table and downloads nothing. Each supported model is
            described by a validated <code className="font-mono text-[11px] text-ink/80">.json</code>{' '}
            profile. Download the file for your model from the project’s GitHub{' '}
            <a
              href={`${REPO_URL}/tree/main/profiles`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent-soft underline-offset-2 hover:underline"
            >
              profiles folder
            </a>{' '}
            and drop it into:
          </p>
          <p className="mt-2 rounded-lg border border-edge bg-sunken px-3 py-2 font-mono text-[11px] text-ink/80">
            %AppData%\soundcontrol\device_profiles
          </p>
          {profilesPath && (
            <p className="mt-1 truncate font-mono text-[10px] text-faint" title={profilesPath}>
              {profilesPath}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!desktop}
              onClick={async () =>
                setProfilesFolderOpened(await openDeviceProfilesFolder())
              }
            >
              <IconFolder size={14} /> Open profiles folder
            </Button>
            <a
              href={`${REPO_URL}/tree/main/profiles`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 text-[11px] font-semibold text-accent-soft transition-colors hover:border-accent/50"
            >
              Browse profiles <IconExternal size={12} />
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            {installedProfileCount === 0
              ? 'No model profiles are installed yet — a connected device stays on the honest generic fallback until you add one.'
              : `${installedProfileCount} model profile${installedProfileCount === 1 ? '' : 's'} installed. New or edited files are picked up immediately; no restart is needed.`}
            {!desktop && ' The folder button is available in the Windows desktop app.'}
          </p>
          {profilesFolderOpened === false && (
            <p className="mt-2 text-[11px] text-warn">
              Windows did not open the folder — it is created automatically on first launch.
            </p>
          )}
        </Card>

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
