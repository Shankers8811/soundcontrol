import { useState } from 'react';
import { useApp } from '../state/store';
import { EarbudsArt, OverEarArt } from '../components/DeviceArt';
import {
  IconAlert,
  IconCodec,
  IconDualLink,
  IconGame,
  IconPower,
  IconSurround,
} from '../components/Icons';
import { Button, Card, Modal, PageHeader, StatusBadge, Toggle, UnavailableNote } from '../components/ui';
import type { ReactNode } from 'react';

/**
 * Controls page (PART O) — only real device operations.
 *
 * Every toggle here sends a documented, captured frame (01:87/10:85 gaming,
 * 02:86 surround, 0B:84 dual, 01:7F/01:FF LDAC) and rolls back if the write
 * fails. Gesture remapping is NOT offered: no public capture or OpenSCQ30
 * command documents a button-mapping write, so the page says exactly that
 * instead of rendering decorative controls. The earbud illustration is
 * purely visual (aria-hidden, no handlers).
 */

function FeatureToggle({
  icon,
  title,
  sub,
  checked,
  busyKey,
  onChange,
  wire,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  checked: boolean;
  busyKey: 'gaming' | 'surround' | 'dual' | 'ldac';
  onChange: (on: boolean) => Promise<void>;
  wire: string;
}) {
  const app = useApp();
  const busy = app.busy === busyKey;
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-edge bg-sunken px-4 py-3.5 transition-colors duration-200 hover:border-accent/25">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 ${
          checked ? 'border-accent/45 bg-accent/12 text-accent' : 'border-edge bg-panel text-mute'
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          {title}
          <span className="font-mono text-[9px] font-medium text-faint">{wire}</span>
        </p>
        <p className="mt-0.5 text-xs leading-snug text-mute">{sub}</p>
      </div>
      <Toggle
        label={title}
        checked={checked}
        disabled={!app.connected || app.busy !== null}
        onChange={(on) => void onChange(on).catch(() => {})}
      />
      {busy && <span className="text-[10px] font-semibold text-warn blink">sending…</span>}
    </div>
  );
}

export function ControlsPage() {
  const app = useApp();
  const caps = app.capabilities;
  const [resetOpen, setResetOpen] = useState(false);

  const anyFeature = caps.supportsGaming || caps.supportsSurround || caps.supportsDual || caps.supportsLdac;

  return (
    <div>
      <PageHeader
        title="Controls"
        sub={
          <>
            <StatusBadge phase={app.connectionPhase} />
            {app.connected && <span className="font-medium text-ink/90">{app.deviceName}</span>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {/* ---------------------------------------------------- features */}
          <Card
            title="Device features"
            subtitle={
              app.connected
                ? 'Each switch sends the model’s real command frame and reverts if the write fails'
                : 'Connect a device to enable its feature switches'
            }
          >
            {anyFeature ? (
              <div className="space-y-2.5">
                {caps.supportsGaming && (
                  <FeatureToggle
                    icon={<IconGame size={20} />}
                    title="Gaming mode"
                    sub="Low-latency audio path for games and video"
                    wire={app.profile.sku === 'A3947' ? '10:85' : '01:87'}
                    checked={app.gaming}
                    busyKey="gaming"
                    onChange={app.setGaming}
                  />
                )}
                {caps.supportsSurround && (
                  <FeatureToggle
                    icon={<IconSurround size={20} />}
                    title="3D Surround Sound"
                    sub="Widened, theatre-like soundstage"
                    wire="02:86"
                    checked={app.surround}
                    busyKey="surround"
                    onChange={app.setSurroundSound}
                  />
                )}
                {caps.supportsDual && (
                  <FeatureToggle
                    icon={<IconDualLink size={20} />}
                    title="Dual connection"
                    sub="Stay linked to two hosts (e.g. PC and phone) at once"
                    wire="0B:84"
                    checked={app.dual}
                    busyKey="dual"
                    onChange={app.setDual}
                  />
                )}
                {caps.supportsLdac && (
                  <FeatureToggle
                    icon={<IconCodec size={20} />}
                    title="LDAC high-resolution audio"
                    sub="Sony LDAC codec at up to 990 kbps — the device may briefly reconnect when toggled"
                    wire="01:FF"
                    checked={app.ldac}
                    busyKey="ldac"
                    onChange={app.setLdac}
                  />
                )}
                {!app.connected && (
                  <p className="pt-1 text-[11px] text-faint">
                    Switches are disabled until a device is connected — SoundControl never pretends
                    a command reached hardware that is not there.
                  </p>
                )}
              </div>
            ) : (
              <UnavailableNote title="No feature switches for this model">
                {app.profile.name} ({app.profile.sku}) has no documented gaming, surround, dual
                or LDAC command in the Soundcore protocol, so there is nothing SoundControl can
                honestly switch here.
              </UnavailableNote>
            )}
          </Card>

          {/* ---------------------------------------------------- gestures */}
          <Card title="Touch & button gestures" subtitle="Single / double / triple tap and hold, per side">
            <UnavailableNote title="Gesture customization is not supported by this protocol">
              <p>
                Soundcore devices report their button mappings inside some models' state blobs, but
                no public capture or reference implementation documents a command that{' '}
                <span className="font-semibold text-ink/85">writes</span> a new mapping — and
                SoundControl never invents Bluetooth commands. Your earbuds keep the mappings they
                already have; the Soundcore mobile app configures gestures for the models that
                support it.
              </p>
              <p className="mt-2 text-faint">
                A local-only remap table would change nothing on the device, so this page shows
                the truth instead of one.
              </p>
            </UnavailableNote>
          </Card>
        </div>

        {/* ------------------------------------------------ right column */}
        <div className="space-y-4 xl:col-span-5">
          <Card title={app.profile.kind === 'earbuds' ? 'Your earbuds' : 'Your headset'}>
            {/* Purely decorative, clearly non-interactive (PART O). */}
            <div className="pointer-events-none select-none" aria-hidden>
              {app.profile.kind === 'earbuds' ? (
                <EarbudsArt live={app.connected} />
              ) : (
                <OverEarArt live={app.connected} />
              )}
            </div>
            <p className="mt-2 text-center text-xs text-mute">
              {app.connected ? (
                <>
                  Linked via <span className="font-mono text-[11px] text-ink/85">{app.transportLabel}</span>
                  {app.linkInfo ? ` · ${app.linkInfo}` : ''}
                </>
              ) : (
                'Illustration only — connect a device on the Devices page'
              )}
            </p>
          </Card>

          {/* --------------------------------------------- factory reset */}
          {/* Capability-gated: the 01:85 frame is documented only for the
              Soundcore Motion+ (A3116) speaker. No headphone/earbud profile
              may claim it, so the honest default is this explanation — the
              destructive frame is never sent speculatively. */}
          <Card title="Maintenance">
            {caps.supportsFactoryReset ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3.5">
                  <span className="mt-0.5 text-danger">
                    <IconPower size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">Factory reset</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-mute">
                      Sends the documented <span className="font-mono text-[11px]">01:85</span>{' '}
                      reset frame. The device clears its settings (EQ, modes, pairings) — this
                      cannot be undone from here.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!app.connected || app.busy !== null}
                    loading={app.busy === 'reset'}
                    onClick={() => setResetOpen(true)}
                  >
                    Reset…
                  </Button>
                </div>
                {!app.connected && (
                  <p className="mt-2 text-[11px] text-faint">
                    Available while a device is connected.
                  </p>
                )}
              </>
            ) : (
              <UnavailableNote title="Factory reset is not offered for this model">
                The <span className="font-mono text-[11px]">01:85</span> reset frame is publicly
                documented only for the Soundcore Motion+ (A3116) speaker. Sending an
                undocumented destructive command to headphones or earbuds risks bricking device
                settings, so SoundControl does not guess. Reset through the Soundcore mobile app
                or Windows Bluetooth settings instead.
              </UnavailableNote>
            )}
          </Card>
        </div>
      </div>

      {/* In-app confirmation — no window.confirm/alert (they block the
          Electron renderer and cannot be styled or tested). */}
      <Modal open={resetOpen} title="Reset device to factory defaults?" onClose={() => setResetOpen(false)} width="max-w-md">
        <div className="space-y-4">
          <p className="flex items-start gap-2.5 text-xs leading-relaxed text-mute">
            <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
            <span>
              <span className="font-semibold text-ink">{app.deviceName}</span> will receive the
              factory-reset command. Expect EQ, sound modes and possibly pairings on the device to
              be cleared. SoundControl's own logs and settings on this PC are untouched.
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={app.busy === 'reset'}
              onClick={() => {
                setResetOpen(false);
                void app.resetDevice().catch(() => {});
              }}
            >
              Send reset command
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
