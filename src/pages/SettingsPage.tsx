import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { getAppVersion, isDesktop, openLogFolder } from '../lib/appSettings';
import { HexConsole } from '../components/HexConsole';
import { ThemeSection } from '../components/ThemeSection';
import { UpdatesSection } from '../components/UpdatesSection';
import { FeedbackSection } from '../components/FeedbackSection';
import { ReportSection } from '../components/ReportSection';
import { AboutSection } from './AboutPage';
import { IconFolder, IconSound, IconTerminal, IconWindows } from '../components/Icons';
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

  const caps = app.capabilities;

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
                    ['Firmware info', caps.supportsFirmwareInfo],
                    ['Factory reset', caps.supportsFactoryReset],
                    // Protocol-wide constants — honest about what NO model gets:
                    ['Volume (no protocol command)', false],
                    ['Gesture writes (undocumented)', false],
                  ]}
                />
              </div>
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
