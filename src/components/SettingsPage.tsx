import type { ReactNode } from 'react';
import { DEVICES } from '../protocol/devices';
import { useApp } from '../state/store';
import { IconChevron } from './Icons';
import { DeployPanel } from './DeployPanel';

export function SettingsPage() {
  const app = useApp();

  return (
    <div className="space-y-3 px-4 py-3 pb-8">
      <section className="rounded-2xl bg-wash p-4">
        <p className="text-xs text-mute">Device</p>
        <p className="mt-1 text-lg font-semibold">{app.connected ? app.deviceName : 'Not connected'}</p>
        <label className="mt-3 block text-xs text-mute">
          Model profile
          <select
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            value={app.profile.id}
            onChange={(e) => app.setProfileId(e.target.value)}
          >
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.sku}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 font-mono text-[11px] text-mute">
          Firmware {app.firmware} · {app.transportLabel}
        </p>
        {app.connected ? (
          <button onClick={() => void app.disconnect()} className="mt-3 w-full rounded-xl bg-white py-2 text-sm text-danger">
            Disconnect
          </button>
        ) : (
          <button onClick={() => app.push('connect')} className="mt-3 w-full rounded-xl bg-blue py-2 text-sm font-semibold text-white">
            Add Device
          </button>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-wash">
        <Row title="Voice prompts" right={<Tog on={app.prompts} onClick={() => app.setPrompts(!app.prompts)} />} />
        <Row
          title="Auto power off"
          right={
            <select
              className="rounded-lg bg-white px-2 py-1 text-sm"
              value={app.autoOff}
              onChange={(e) => app.setAutoOff(Number(e.target.value))}
            >
              <option value={0}>Never</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          }
        />
        <Row title="Find device" onClick={() => void app.findDevice()} />
        <Row title="Safe Volume" sub={`${app.safeVolume}%`} onClick={() => app.push('safe-volume')} />
      </section>

      <section className="overflow-hidden rounded-2xl bg-wash">
        <Row title="Diagnostics" sub="Hex console for RFCOMM frames" onClick={() => app.push('diagnostics')} />
        <Row title="About" onClick={() => app.push('about')} />
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
