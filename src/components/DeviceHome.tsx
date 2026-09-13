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

  const photo = app.profile.kind === 'overear' ? asset('device-overear.png') : asset('device-earbuds.png');
  const preset = EQ_PRESETS.find((p) => p.id === app.eqId);
  const modeLabel =
    app.ancMode === 'adaptive'
      ? 'Adaptive Noise Cancelling'
      : app.ancMode === 'anc'
        ? app.profile.scenes
          ? `Noise Cancelling · ${cap(app.ancScene)}`
          : `Manual · Level ${app.ancLevel}`
        : app.ancMode === 'transparency'
          ? app.transVocal
            ? 'Transparency · Talk Mode'
            : 'Transparency Mode'
          : 'Normal';

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pt-3">
        <span className="text-[15px] font-semibold tracking-tight text-blue">soundcore</span>
        <div className="flex items-center gap-1">
          <button onClick={() => app.push('connect')} className="rounded-full p-2 text-mute" aria-label="Devices">
            <IconPlus />
          </button>
          <button onClick={() => app.setTab('settings')} className="rounded-full p-2 text-mute" aria-label="Settings">
            <IconGear />
          </button>
        </div>
      </header>

      <div className="relative mx-3 overflow-hidden rounded-3xl bg-gradient-to-b from-[#d7e8ff] via-[#eef4ff] to-white px-4 pb-4 pt-2">
        <img src={photo} alt="" className="mx-auto h-44 w-auto object-contain drop-shadow-md" />
        <h1 className="text-center text-xl font-semibold tracking-wide">{app.profile.name.toUpperCase()}</h1>
        <p className="mt-0.5 text-center text-xs text-mute">{app.deviceName}</p>
        <div className="mt-3 flex justify-center gap-5">
          <IconBattery label="L" level={app.battery.left} />
          <IconBattery label="R" level={app.battery.right} />
          {app.profile.kind === 'earbuds' && <IconBattery label="Case" level={app.battery.case} />}
        </div>
        {app.ldac && (
          <p className="mt-2 text-center font-mono text-[10px] text-blue">LDAC</p>
        )}
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

      <div className="mx-3 mt-3 grid grid-cols-2 gap-3 pb-4">
        <Tile
          icon={<IconEq />}
          title="Sound Effects"
          sub={app.hearId ? 'HearID Sound' : (preset?.name ?? 'Custom EQ')}
          onClick={() => app.setTab('sounds')}
        />
        <Tile icon={<IconVolume />} title="Safe Volume" sub={`${app.safeVolume}%`} onClick={() => app.push('safe-volume')} />
        <Tile icon={<IconHand />} title="Controls" sub="Gestures & more" onClick={() => app.setTab('controls')} />
        <Tile
          icon={<IconEar />}
          title="HearID"
          sub={app.hearId ? 'Personalized' : 'Not set'}
          onClick={() => app.push('hearid')}
        />
        {app.profile.gaming && (
          <Tile
            icon={<IconGame />}
            title="Game Mode"
            sub={app.gaming ? 'On · low latency' : 'Off'}
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
