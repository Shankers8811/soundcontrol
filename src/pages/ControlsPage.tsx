import { useState } from 'react';
import { useApp } from '../state/store';
import { EarbudsArt, OverEarArt, type ArtSideState } from '../components/DeviceArt';
import { DeviceTypeVisual, deviceKindLabel } from '../components/DeviceTypeVisual';
import type { EarbudSideState } from '../state/derive';
import {
  IconAlert,
  IconCodec,
  IconDualLink,
  IconGame,
  IconPower,
  IconSurround,
} from '../components/Icons';
import { Button, Card, Modal, PageHeader, StatusBadge, Toggle, UnavailableNote } from '../components/ui';
import { NoiseControl } from '../components/NoiseControl';
import { DeviceSettingsHeader } from '../components/DeviceSettingsHeader';
import type { ReactNode } from 'react';

/**
 * Noise Control page (PART O, Pass 8 IA — formerly "Controls") — only real
 * device operations.
 *
 * The page leads with the existing NoiseControl component (ANC modes, level
 * and scenes), then
 * the model's real feature switches. Every toggle here sends a documented,
 * captured frame (01:87/10:85 gaming, 02:86 surround, 0B:84 dual,
 * 01:7F/01:FF LDAC) and rolls back if the write fails. Gesture remapping is
 * NOT offered: OpenSCQ30 documents model-specific 04:81 button writes,
 * but this app has not implemented the complete read/verify and model-gated
 * transaction, so the page cannot expose a working remap yet. The earbud illustration is purely visual (aria-hidden,
 * no handlers).
 */

function FeatureToggle({
  icon,
  title,
  sub,
  checked,
  busyKey,
  onChange,
  wire,
  confirmed,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  checked: boolean;
  busyKey: 'gaming' | 'surround' | 'dual' | 'ldac';
  onChange: (on: boolean) => Promise<void>;
  wire: string;
  confirmed: boolean;
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
        label={`${title}: ${checked ? 'On' : 'Off'}`}
        checked={checked}
        disabled={!app.connected || app.busy !== null}
        onChange={(on) => void onChange(on).catch(() => {})}
      />
      <div className="w-14 shrink-0 text-right">
        <span className={`block text-[10px] font-semibold ${checked ? 'text-accent-soft' : 'text-mute'}`}>
          {busy ? 'sending…' : checked ? 'On' : 'Off'}
        </span>
        <span className="block text-[9px] text-faint">{confirmed ? 'device state' : 'write only'}</span>
      </div>
    </div>
  );
}

/** Telemetry side state → illustration state (unavailable stays decorative). */
function artSide(state: EarbudSideState): ArtSideState | undefined {
  return state === 'unavailable' ? undefined : state;
}

export function ControlsPage() {
  const app = useApp();
  const caps = app.capabilities;
  const [resetOpen, setResetOpen] = useState(false);

  const anyFeature = caps.supportsGaming || caps.supportsSurround || caps.supportsDual || caps.supportsLdac;

  return (
    <div>
      <PageHeader
        title="Noise Control"
        sub={
          <>
            <StatusBadge phase={app.connectionPhase} />
          </>
        }
      />

      <DeviceSettingsHeader />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {/* --------------------------------------------- noise control */}
          {/* Modes, level, scenes, capability gating and rollback all live in
              the shared component; this page is its single presentation. */}
          <NoiseControl />

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
                    confirmed={app.profile.state.gaming !== null}
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
                    confirmed={app.profile.state.surround !== null}
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
                    confirmed={app.profile.state.dualConnections !== null}
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
                    confirmed={false}
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
                {app.connected && app.identification !== 'verified'
                  ? 'Model identification is uncertain or mismatched; gaming, spatial audio, multipoint and LDAC stay disabled until the state layout is confirmed. Manual selection does not unlock commands.'
                  : `${app.profile.name} (${app.profile.sku}) has no documented gaming, surround, dual or LDAC command in the Soundcore protocol, so there is nothing SoundControl can honestly switch here.`}
              </UnavailableNote>
            )}
          </Card>

          {/* Three model-specific 01:01 readouts. No setter is registered: a
              reference write and a same-command ACK alone cannot prove device
              persistence or safe handling of the other button/profile bytes. */}
          {app.connected && app.identification === 'verified' &&
            ['A3040', 'A3954', 'D1202'].includes(app.profile.sku) && (
            <Card title="Device-reported options" subtitle="Read-only · last full state report this connection">
              <div className="space-y-2 text-xs text-mute">
                {app.profile.sku === 'A3040' && (
                  <p>Q45 double press: <strong className="text-ink">{app.observed.q45DoublePress ?? 'Unavailable'}</strong></p>
                )}
                <p>Safe-volume limit: <strong className="text-ink">
                  {app.observed.safeVolume
                    ? `${app.observed.safeVolume.enabled ? 'On' : 'Off'} · ${app.observed.safeVolume.limitDb} dB · ${app.observed.safeVolume.refresh}`
                    : 'Unavailable'}
                </strong></p>
                {app.profile.sku !== 'A3040' && (
                  <p>Spatial audio: <strong className="text-ink">
                    {app.observed.spatial
                      ? `${app.observed.spatial.enabled ? 'On' : 'Off'} · ${app.observed.spatial.mode}${app.observed.spatial.tracking ? ` · ${app.observed.spatial.tracking}` : ''}`
                      : 'Unavailable'}
                  </strong></p>
                )}
                <p>These values are not refreshed by the 30-second battery poll. Editing is unavailable until a write, response and post-write requery are proven for this exact model.</p>
              </div>
            </Card>
          )}

          {app.connected && app.identification === 'verified' && app.profile.sku === 'A3945' && (
            <Card title="Life Note 3S device state" subtitle="Read-only · last full 01:01 report this connection">
              <div className="space-y-2 text-xs text-mute">
                <p>BassUp device flag: <strong className="text-ink">{app.observed.lifeNoteBassUp === null ? 'Unavailable' : app.observed.lifeNoteBassUp ? 'On' : 'Off'}</strong></p>
                <p>EQ preset: <strong className="text-ink">{app.observed.lifeNoteEq ?? 'Unavailable'}</strong></p>
                <p>Gaming mode: <strong className="text-ink">{app.observed.lifeNoteGaming === null ? 'Unavailable' : app.observed.lifeNoteGaming ? 'On' : 'Off'}</strong></p>
                <p>Button assignments (current TWS connection state):</p>
                {app.observed.lifeNoteButtons ? (
                  <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {app.observed.lifeNoteButtons.map(({ press, action }) => (
                      <li key={press}>{press}: <strong className="text-ink">{action}</strong></li>
                    ))}
                  </ul>
                ) : <p>Assignments unavailable.</p>}
                <p>These bytes are not refreshed by battery polling. No BassUp toggle, EQ write, gaming write or button editor is enabled for this model.</p>
              </div>
            </Card>
          )}

          {app.connected && app.identification === 'verified' && app.profile.sku === 'D1301' && (
            <Card title="Sleep A30 device state" subtitle="Read-only · last full 01:01 report this connection">
              <div className="space-y-2 text-xs text-mute">
                <p>After falling asleep: <strong className="text-ink">{app.observed.sleepAfter ?? 'Unavailable'}</strong></p>
                <p>This is the post-sleep Bluetooth/local-audio setting, not a timer, alarm, white-noise mixer or playback control. No sleep write is sent.</p>
              </div>
            </Card>
          )}

          {/* ---------------------------------------------------- gestures */}
          <Card title="Touch & button gestures" subtitle="Model-specific actions · editing unavailable">
            <UnavailableNote title="Gesture customization is not yet supported by SoundControl">
              <p>
                A public protocol reference documents model-specific button mapping writes
                (04:81), including a Space Q45 double-press vector. The Q45’s current double-press action is now read from its 01:01 state, but
                SoundControl has not proven the per-model write ACK, post-write readback and
                reconnect transaction; 04:81 is blocked by both transport allowlists. Your existing mapping is unchanged. Use the
                Soundcore mobile app for supported models.
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
          <Card title={`Your ${deviceKindLabel(app.profile.kind).toLowerCase()}`}>
            <div className="mb-3 flex items-center justify-center gap-2 text-accent-soft">
              <DeviceTypeVisual kind={app.profile.kind} size={26} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                {deviceKindLabel(app.profile.kind)}
              </span>
            </div>
            {/* Non-interactive illustration (PART O). For TWS models with
                live telemetry the two buds dim/brighten INDEPENDENTLY from
                the device-reported per-side state — the image mirrors real
                presence, never a guessed one. */}
            <div className="pointer-events-none select-none" aria-hidden>
              {app.profile.kind === 'earbuds' ? (
                <EarbudsArt
                  live={app.connected}
                  leftState={artSide(app.earbudState.left.state)}
                  rightState={artSide(app.earbudState.right.state)}
                />
              ) : app.profile.kind === 'neckband' ? (
                <div className="flex justify-center py-5 text-accent-soft">
                  <DeviceTypeVisual kind="neckband" size={72} />
                </div>
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

          {/* Research-backed limitations: no actions here can transmit a frame. */}
          <Card title="Other mobile-app features" subtitle="Unavailable on this desktop connection — no speculative device writes">
            <ul className="space-y-2 text-xs leading-relaxed text-mute">
              <li><strong className="text-ink">Safe-volume limiter:</strong> 20:82 is documented for specific models; A3040/A3954/D1202 show the current device-reported limit above, but this app cannot yet verify a write and reread. No switch is sent.</li>
              <li><strong className="text-ink">HearID test &amp; personalised sound:</strong> require an app-guided hearing measurement and model-specific profile writes; no audiogram is fabricated.</li>
              <li><strong className="text-ink">Sleep audio:</strong> Sleep A30 shows the device-reported post-sleep audio choice above; model-specific timer/alarm reference commands lack an integrated read lifecycle, and no white-noise playback/mixer is verified. No playback control is exposed.</li>
              <li><strong className="text-ink">Firmware update &amp; head tracking:</strong> firmware/version reading is supported; installing firmware and measuring or changing live head motion are not. The mode above, if reported, is read-only. Use the mobile app.</li>
            </ul>
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
                or this computer’s Bluetooth settings instead.
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
