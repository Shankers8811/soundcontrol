import { useApp } from '../state/store';
import { Card } from './ui';

export function DeviceSettingsHeader() {
  const app = useApp();
  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-xl border border-edge bg-sunken px-4 py-3.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-faint">Connected model</p>
        <h2 className="mt-1 truncate text-lg font-bold text-ink">
          {app.connected ? app.deviceName : 'No device connected'}
        </h2>
      </div>

      <Card title="PC battery" subtitle="Battery percentage reported by the Windows or Linux Bluetooth stack">
        <div className="flex items-end justify-between gap-4">
          <span className="text-sm text-mute">Host-detected battery</span>
          {typeof app.battery.hostPercent === 'number' ? (
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">
              {app.battery.hostPercent}%
            </span>
          ) : (
            <span className="text-sm font-semibold text-faint">Unavailable</span>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          This is the aggregate battery level reported by the computer, kept separate from model-specific Soundcore telemetry.
        </p>
      </Card>
    </div>
  );
}
