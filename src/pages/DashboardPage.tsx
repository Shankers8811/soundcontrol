import { useApp } from '../state/store';
import { batteryPercent } from '../state/derive';
import { EarbudStatusCard } from '../components/EarbudStatusCard';
import { IconBattery, IconBolt, IconBt, IconDevices } from '../components/Icons';
import { QuickActions } from '../components/QuickActions';
import { VolumeControl } from '../components/VolumeControl';
import { Button, Card, InfoRow, PageHeader, StatusBadge } from '../components/ui';

/**
 * Dashboard (PART E) — the primary desktop view.
 *
 * Header: page title, the real connected-device name, the derived connection
 * phase, and battery ONLY when the device (or Windows) actually reported it —
 * otherwise an explicit "Battery unavailable", never an invented percentage.
 */

function BatteryPill() {
  const app = useApp();

  if (!app.connected) {
    return <span className="rounded-full border border-edge bg-sunken px-3 py-1 text-xs text-faint">No device</span>;
  }

  const caps = app.capabilities;
  const presence = app.battery.presence ?? 'unknown';

  // TWS with live per-side telemetry: show each connected side.
  if (caps.supportsPerEarbudBattery && presence !== 'unknown') {
    const l = batteryPercent(presence === 'right' ? null : app.battery.left, app.battery.batteryScale);
    const r = batteryPercent(presence === 'left' ? null : app.battery.right, app.battery.batteryScale);
    const parts: string[] = [];
    if (presence === 'both' || presence === 'left') parts.push(l !== null ? `L ${l}%` : 'L —');
    if (presence === 'both' || presence === 'right') parts.push(r !== null ? `R ${r}%` : 'R —');
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-sunken px-3 py-1 font-mono text-xs font-semibold text-ink">
        <IconBattery level={l ?? r} label="" charging={Boolean(app.battery.leftCharging || app.battery.rightCharging)} />
        {parts.join('  ·  ')}
      </span>
    );
  }

  // Over-ears, or a Windows-reported aggregate before device telemetry: one
  // real number.
  const single = batteryPercent(app.battery.left, app.battery.batteryScale);
  if (single !== null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-sunken px-3 py-1 font-mono text-xs font-semibold text-ink">
        <IconBattery level={single} label="" charging={Boolean(app.battery.leftCharging)} />
        {single}%
      </span>
    );
  }

  return (
    <span className="rounded-full border border-edge bg-sunken px-3 py-1 text-xs font-medium text-faint">
      Battery unavailable
    </span>
  );
}

function ConnectionHero() {
  const app = useApp();
  return (
    <Card className="border-accent/25">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/35 bg-accent/10 text-accent">
          <IconDevices size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">
            {app.connecting ? 'Connecting to your device…' : 'No device connected'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-mute">
            {app.connecting
              ? 'The Bluetooth helper is opening the RFCOMM link and verifying the DSP channel. This can take a few seconds on a cold Windows stack.'
              : 'SoundControl controls Soundcore devices that are already paired with Windows. Open the Devices page to scan, connect, and manage them.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Button variant="primary" disabled={app.connecting} onClick={() => app.setPage('devices')}>
            {app.connecting ? 'Connecting…' : 'Open Devices'}
          </Button>
          {app.recentDevices.length > 0 && !app.connecting && (
            <Button
              disabled={false}
              onClick={() => {
                const last = app.recentDevices[0];
                void app.connectBridge(last.mac, last.name).catch(() => {});
              }}
            >
              Reconnect {app.recentDevices[0].name}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DeviceSummaryCard() {
  const app = useApp();
  return (
    <Card title="Device" subtitle={app.connected ? app.profile.name : 'Nothing connected yet'}>
      {app.connected ? (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <IconBt size={16} className="text-accent" />
            <span className="truncate">{app.deviceName}</span>
          </div>
          <InfoRow label="Model profile" value={`${app.profile.name} (${app.profile.sku})`} />
          <InfoRow label="Firmware" value={app.firmware} mono />
          {app.serial && <InfoRow label="Serial" value={app.serial} mono />}
          <InfoRow label="Transport" value={app.transportLabel} mono />
          {app.linkInfo && <InfoRow label="Link" value={app.linkInfo} mono />}
          {app.profileNote && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
              {app.profileNote}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => app.setPage('devices')}>
              Manage
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={app.busy !== null}
              onClick={() => void app.disconnect()}
            >
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-mute">
          Device identity, firmware version, and serial number are read from the hardware itself
          (the <span className="font-mono text-ink/80">01:05</span> query) after connecting —
          SoundControl never fabricates them.
        </p>
      )}
    </Card>
  );
}

function HeadsetBatteryCard() {
  const app = useApp();
  const level = batteryPercent(app.battery.left, app.battery.batteryScale);
  return (
    <Card title="Battery" subtitle="Reported by the headset over 01:03 / 01:01">
      <div className="flex items-center gap-5">
        <span className="relative">
          <IconBattery level={level} label="" charging={Boolean(app.battery.leftCharging)} />
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full border text-lg font-bold ${
              level !== null ? 'border-accent/40 bg-accent/8 text-ink' : 'border-edge bg-sunken text-faint'
            }`}
          >
            {level !== null ? `${level}%` : '—'}
          </span>
        </span>
        <div className="text-xs leading-relaxed text-mute">
          {level !== null ? (
            <>
              <p className="font-semibold text-ink">
                {level}% {app.battery.leftCharging && <span className="text-warn">(charging)</span>}
              </p>
              <p className="mt-1">
                Over-ear models report a single 0–5 level; SoundControl converts it and re-polls
                every 30 s while connected.
              </p>
            </>
          ) : (
            <p>
              <span className="font-semibold text-ink">Battery unavailable.</span> The headset has
              not reported a level yet — it answers the battery query shortly after the DSP channel
              is verified.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const app = useApp();
  const caps = app.capabilities;

  return (
    <div>
      <PageHeader
        title="Home"
        sub={
          <>
            <StatusBadge phase={app.connectionPhase} />
            {app.connected && (
              <span className="truncate font-medium text-ink/90">{app.deviceName}</span>
            )}
          </>
        }
        right={<BatteryPill />}
      />

      <div className="space-y-4">
        {!app.connected && <ConnectionHero />}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <QuickActions />
          </div>

          <div className="space-y-4 xl:col-span-5">
            {/* Per-side card only for hardware that actually has two sides. */}
            {caps.supportsEarbudState ? <EarbudStatusCard /> : app.connected ? <HeadsetBatteryCard /> : null}
            <VolumeControl />
            <DeviceSummaryCard />
          </div>
        </div>
      </div>

      {/* Charging flags surfaced once more for TWS when known (real 01:04 /
          01:01 bits) — small, factual, no invention. */}
      {app.connected && caps.supportsPerEarbudBattery && (app.battery.leftCharging || app.battery.rightCharging) && (
        <p className="mt-4 flex items-center gap-2 text-[11px] text-mute">
          <IconBolt size={13} className="text-warn" />
          {app.battery.leftCharging && <span>Left bud charging</span>}
          {app.battery.leftCharging && app.battery.rightCharging && <span>·</span>}
          {app.battery.rightCharging && <span>Right bud charging</span>}
        </p>
      )}
    </div>
  );
}
