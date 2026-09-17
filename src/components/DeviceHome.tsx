import type { ReactNode } from 'react';
import { asset } from '../lib/asset';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';
import {
  IconAnc,
  IconBattery,
  IconChevron,
  IconEar,
  IconEq,
  IconGame,
  IconGear,
  IconHand,
  IconNormal,
  IconPlus,
  IconTrans,
  IconVolume,
} from './Icons';

export function DeviceHome() {
  const app = useApp();

  if (!app.connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky text-blue">
          <IconPlus size={32} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Add your soundcore device</h1>
        <p className="mt-2 text-sm text-mute">
          Open the charging case, tap Add Device, then Search. Pick your earbuds from the list — same flow as the
          soundcore Android app.
        </p>
        <button
          onClick={() => app.push('connect')}
          className="mt-6 rounded-full bg-blue px-6 py-3 font-semibold text-white"
        >
          Add Device
        </button>
      </div>
    );
  }

  const photo = app.profile.kind === 'overear' ? asset('device-overear.webp') : asset('device-earbuds.webp');
  const preset = EQ_PRESETS.find((p) => p.id === app.eqId);
  const modeLabel =
    app.ancMode === 'adaptive'
      ? 'Adaptive Noise Cancelling'
      : app.ancMode === 'anc'
        ? app.profile.scenes
          ? `Noise Cancelling · ${cap(app.ancScene)}`
          : app.ancLevel >= 4
            ? 'Noise Cancelling · Maximum'
            : app.ancLevel === 3
              ? 'Noise Cancelling · Balanced'
              : 'Noise Cancelling · Gentle'
        : app.ancMode === 'transparency'
          ? app.transVocal
            ? 'Transparency · Talk Mode'
            : 'Transparency · Full'
          : 'Normal Mode';

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-black tracking-tight text-blue">soundcore</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            {app.connected ? 'Connected' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => app.push('device-select')}
            title="Switch Soundcore Model"
            className="flex items-center gap-1 rounded-full bg-wash px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            <span>Model</span>
            <IconChevron className="text-mute" size={14} />
          </button>
          <button onClick={() => app.push('connect')} className="rounded-full p-2 text-mute hover:text-ink" aria-label="Devices">
            <IconPlus />
          </button>
          <button onClick={() => app.setTab('settings')} className="rounded-full p-2 text-mute hover:text-ink" aria-label="Settings">
            <IconGear />
          </button>
        </div>
      </header>

      <div className="relative mx-3 mt-2 overflow-hidden rounded-3xl bg-gradient-to-b from-[#d7e8ff] via-[#eef4ff] to-white px-4 pb-4 pt-2 border border-blue/10">
        <img
          src={photo}
          alt=""
          width={704}
          height={384}
          decoding="async"
          className="mx-auto h-44 w-auto object-contain drop-shadow-md transition-transform hover:scale-105 duration-300"
        />
        <h1 className="text-center text-xl font-bold tracking-wide text-ink">{app.profile.name.toUpperCase()}</h1>
        <p className="mt-0.5 text-center text-xs text-mute font-medium">{app.deviceName} · {app.profile.sku}</p>
        {app.profileNote && (
          <p className="mx-auto mt-2 max-w-[22rem] rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] leading-snug text-amber-800">
            {app.profileNote}
          </p>
        )}
        {app.linkInfo && (
          <p className="mt-1 text-center font-mono text-[10px] text-mute">{app.linkInfo}</p>
        )}
        <div className="mt-3 flex justify-center gap-6">
          {/* Over-ears report a single level via single_battery(5), not a pair. */}
          {app.profile.kind === 'earbuds' ? (
            <>
              <IconBattery label="L" level={toPercent(app.battery.left, app.battery.batteryScale)} />
              <IconBattery label="R" level={toPercent(app.battery.right, app.battery.batteryScale)} />
            </>
          ) : (
            <IconBattery label="Battery" level={toPercent(app.battery.left, app.battery.batteryScale)} />
          )}
          {app.profile.state.batteryCase !== null && (
            <IconBattery label="Case" level={toPercent(app.battery.case, app.battery.batteryScale)} />
          )}
        </div>
        {app.profile.kind === 'earbuds' && app.battery.presence && app.battery.presence !== 'unknown' && (
          <p className="mt-2 text-center text-[11px] font-medium text-blue">
            {presenceLabel(app.battery.presence)}
          </p>
        )}
        <div className="mt-2 flex items-center justify-center gap-2">
          {app.ldac && (
            <span className="rounded bg-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue">
              LDAC High-Res
            </span>
          )}
          {app.surround && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              3D Surround
            </span>
          )}
        </div>
      </div>

      <section className="mx-3 mt-3 rounded-2xl bg-wash px-4 py-4">
        <button onClick={() => app.push('ambient')} className="flex w-full items-center justify-between">
          <span className="font-medium">Ambient Sound</span>
          <IconChevron className="text-mute" />
        </button>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Mode
            label="Noise Cancellation"
            active={app.ancMode === 'anc' || app.ancMode === 'adaptive'}
            onClick={() => void app.setAnc(app.profile.ancLevels ? 'anc' : 'anc', 5)}
            icon={<IconAnc />}
          />
          <Mode
            label="Normal"
            active={app.ancMode === 'normal'}
            onClick={() => void app.setAnc('normal')}
            icon={<IconNormal />}
          />
          <Mode
            label="Transparency Mode"
            active={app.ancMode === 'transparency'}
            onClick={() => void app.setAnc('transparency')}
            icon={<IconTrans />}
          />
        </div>
        <button
          onClick={() => app.push('ambient')}
          className="mt-4 flex w-full items-center justify-between text-sm"
        >
          <span className="text-mute">Modes</span>
          <span className="flex items-center gap-1 text-ink">
            {modeLabel}
            <IconChevron className="text-mute" />
          </span>
        </button>
      </section>

      <div className="mx-3 mt-3 grid grid-cols-2 gap-2.5 pb-4">
        <Tile
          icon={<IconEq />}
          title="Sound Effects"
          sub={app.hearId ? 'HearID Sound' : (preset?.name ?? 'Custom EQ')}
          onClick={() => app.setTab('sounds')}
        />
        <Tile
          icon={<IconHand />}
          title="Controls"
          sub="Tap gestures & actions"
          onClick={() => app.setTab('controls')}
        />
        <Tile
          icon={<IconEar />}
          title="HearID Sound"
          sub={app.hearId ? 'Personalized active' : 'Run hearing test'}
          onClick={() => app.push('hearid')}
        />
        <Tile
          icon={<span className="text-xl">🔍</span>}
          title="Find Device"
          sub="Play locator alarm"
          onClick={() => app.push('find-device')}
        />
        <Tile
          icon={<IconVolume />}
          title="Safe Volume"
          sub={app.safeVolume > 0 ? 'Protection Active' : 'Off'}
          onClick={() => app.push('safe-volume')}
        />
        {app.profile.gaming && (
          <Tile
            icon={<IconGame />}
            title="Game Mode"
            sub={app.gaming ? 'Active · 80ms latency' : 'Off'}
            onClick={() => void app.setGaming(!app.gaming)}
          />
        )}
      </div>
    </div>
  );
}

function Mode({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          active ? 'bg-blue text-white' : 'bg-white text-mute shadow-sm'
        }`}
      >
        {icon}
      </span>
      <span className={`text-[11px] leading-tight ${active ? 'font-medium text-ink' : 'text-mute'}`}>{label}</span>
    </button>
  );
}

function Tile({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-wash px-3 py-3 text-left">
      <span className="text-blue">{icon}</span>
      <p className="mt-2 font-medium">{title}</p>
      <p className="truncate text-xs text-mute">{sub}</p>
    </button>
  );
}

function cap(s: string) {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function toPercent(level: number | null, scale?: number | null) {
  if (level === null || scale === null || scale === undefined || level > scale) return level;
  return Math.round((level * 100) / scale);
}

function presenceLabel(presence: 'both' | 'left' | 'right' | 'none') {
  if (presence === 'both') return 'Both earbuds detected';
  if (presence === 'left') return 'Left earbud detected';
  if (presence === 'right') return 'Right earbud detected';
  return 'No earbuds detected';
}
