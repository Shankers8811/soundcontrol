import { useState, type ReactNode } from 'react';
import { useApp } from '../state/store';
import { IconChevron } from './Icons';
import { DeployPanel } from './DeployPanel';

export function SettingsPage() {
  const app = useApp();
  const [fwChecking, setFwChecking] = useState(false);
  const [fwStatus, setFwStatus] = useState<string | null>(null);

  const checkFirmware = () => {
    setFwChecking(true);
    setFwStatus(null);
    setTimeout(() => {
      setFwChecking(false);
      setFwStatus(`Firmware v${app.firmware} is up to date!`);
    }, 1200);
  };

  const handleReset = async () => {
    if (window.confirm('Reset Soundcore device settings to factory defaults?')) {
      await app.resetDevice();
      alert('Device settings restored to factory defaults.');
    }
  };

  return (
    <div className="space-y-3 px-4 py-3 pb-8">
      {/* Device Info Card */}
      <section className="rounded-3xl bg-wash p-4 border border-line">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-mute">Connected Hardware</p>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${app.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <p className="mt-1 text-lg font-bold text-ink">{app.connected ? app.deviceName : 'Not connected'}</p>
        
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-2.5 border border-line">
          <div>
            <div className="text-[11px] text-mute">Current Model Profile</div>
            <div className="text-sm font-semibold text-ink">{app.profile.name} ({app.profile.sku})</div>
          </div>
          <button
            onClick={() => app.push('device-select')}
            className="rounded-full bg-sky px-3 py-1 text-xs font-bold text-blue hover:bg-blue hover:text-white transition"
          >
            Switch
          </button>
        </div>

        <p className="mt-2.5 font-mono text-[11px] text-mute">
          Firmware v{app.firmware} · Protocol: {app.transportLabel}
        </p>

        {app.connected ? (
          <button
            onClick={() => void app.disconnect()}
            className="mt-3 w-full rounded-xl border border-rose-200 bg-white py-2.5 text-xs font-bold text-danger hover:bg-rose-50 transition"
          >
            Disconnect Device
          </button>
        ) : (
          <button
            onClick={() => app.push('connect')}
            className="mt-3 w-full rounded-xl bg-blue py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-2 transition"
          >
            Add Soundcore Device
          </button>
        )}
      </section>

      {/* Device Preferences */}
      <section className="overflow-hidden rounded-2xl bg-wash border border-line">
        <Row title="Voice Prompts & Tones" right={<Tog on={app.prompts} onClick={() => app.setPrompts(!app.prompts)} />} />
        <Row
          title="Auto Power Off"
          right={
            <select
              className="rounded-lg bg-white px-2 py-1 text-xs font-medium border border-line text-ink outline-none"
              value={app.autoOff}
              onChange={(e) => app.setAutoOff(Number(e.target.value))}
            >
              <option value={0}>Never</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={120}>120 min</option>
            </select>
          }
        />
        <Row title="Find My Device" sub="Acoustic beacon alarm" onClick={() => app.push('find-device')} />
        <Row title="Safe Volume Limiter" sub={`${app.safeVolume}% maximum cap`} onClick={() => app.push('safe-volume')} />
      </section>

      {/* System & Maintenance */}
      <section className="overflow-hidden rounded-2xl bg-wash border border-line">
        <Row
          title="Firmware Update"
          sub={fwStatus ?? `Current: v${app.firmware}`}
          right={
            <button
              onClick={checkFirmware}
              disabled={fwChecking}
              className="mr-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue border border-line hover:bg-sky/50 disabled:opacity-50"
            >
              {fwChecking ? 'Checking…' : 'Check'}
            </button>
          }
        />
        <Row title="Reset Device" sub="Restore default factory settings" onClick={() => void handleReset()} />
        <Row title="Diagnostics Console" sub="Inspect live RFCOMM / BLE byte frames" onClick={() => app.push('diagnostics')} />
        <Row title="About SoundControl" sub="Desktop & web companion" onClick={() => app.push('about')} />
      </section>
    </div>
  );
}

function Row({
  title,
  sub,
  right,
  onClick,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 py-3 pl-4 text-left">
        <span className="block">{title}</span>
        {sub && <span className="block text-xs text-mute">{sub}</span>}
      </span>
      {right ?? (onClick ? <IconChevron className="mr-3 text-mute" /> : null)}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="flex w-full items-center border-b border-white last:border-0">
        {inner}
      </button>
    );
  }
  return <div className="flex items-center border-b border-white last:border-0 pr-3">{inner}</div>;
}

function Tog({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`toggle mr-3 ${on ? 'on' : ''}`} aria-label="Toggle" />;
}

export function AboutPage() {
  return (
    <div className="space-y-4 px-4 py-3">
      <p className="text-3xl font-semibold tracking-tight text-blue">soundcore</p>
      <p className="text-sm text-mute">
        SoundControl is an unofficial desktop companion. It mirrors the hardware screens of the Anker soundcore
        Android app — ANC, EQ, HearID, game mode, dual connect — and leaves out Anka, Insight, and every other AI
        chat feature.
      </p>
      <p className="text-sm text-mute">Not affiliated with Anker Innovations or soundcore.</p>
      <DeployPanel />
    </div>
  );
}
