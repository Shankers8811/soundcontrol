import { useEffect, useRef } from 'react';
import { EQ_PRESETS } from '../protocol/presets';
import { dbToByte } from '../protocol/codec';
import { useApp } from '../state/store';
import { EQ_HZ } from '../types';
import { EqCurve } from './EqCurve';

export function SoundsPage() {
  const app = useApp();
  const current = EQ_PRESETS.find((p) => p.id === app.eqId);

  return (
    <div className="px-4 py-3 pb-6">
      <p className="text-sm text-mute">Choose a preset or build your own 8-band curve — same DSP as the soundcore app.</p>

      <div className="mt-4 space-y-2">
        <Choice
          title="HearID Sound"
          sub={app.hearId ? 'Personalized to your hearing test' : 'No data yet — run HearID'}
          on={app.hearId}
          onClick={() => app.push('hearid')}
        />
        <Choice
          title="Default"
          sub="Soundcore Signature"
          on={!app.hearId && app.eqId === 'signature'}
          onClick={() => {
            const p = EQ_PRESETS.find((x) => x.id === 'signature');
            if (p) void app.applyPreset(p);
          }}
        />
        <Choice
          title="Custom EQ"
          sub="Drag the 8 bands yourself"
          on={!app.hearId && app.eqId === 'custom'}
          onClick={() => app.push('eq-custom')}
        />
      </div>

      <h3 className="mt-6 mb-2 font-medium">Presets</h3>
      <div className="grid grid-cols-2 gap-3">
        {EQ_PRESETS.map((p) => (
          <button
            key={p.id}
            disabled={!app.connected}
            onClick={() => void app.applyPreset(p)}
            className={`overflow-hidden rounded-2xl text-left ${
              !app.hearId && current?.id === p.id ? 'ring-2 ring-blue' : ''
            } disabled:opacity-40`}
          >
            <div className="h-20 w-full" style={{ background: p.swatch }} />
            <div className="bg-wash px-3 py-2">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-[11px] text-mute">{p.blurb}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Choice({
  title,
  sub,
  on,
  onClick,
}: {
  title: string;
  sub: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-wash px-3 py-3 text-left">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          on ? 'border-blue bg-blue text-[11px] text-white' : 'border-[#c5cad3]'
        }`}
      >
        {on ? '✓' : ''}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-mute">{sub}</span>
      </span>
    </button>
  );
}

export function CustomEqPage() {
  const app = useApp();
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const onSlide = (i: number, v: number) => {
    app.setBand(i, v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (app.connected) void app.commitEq();
    }, 160);
  };

  return (
    <div className="px-4 py-3">
      <div className="rounded-2xl bg-wash p-2">
        <EqCurve bands={app.bands} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-1 overflow-x-auto pb-2">
        {app.bands.map((db, i) => (
          <label key={EQ_HZ[i]} className="flex min-w-10 flex-col items-center gap-1">
            <span className="font-mono text-[11px] text-blue">{db > 0 ? `+${db}` : db}</span>
            <input
              className="eq-fader"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              value={db}
              disabled={!app.connected}
              onChange={(e) => onSlide(i, Number(e.target.value))}
            />
            <span className="font-mono text-[10px] text-mute">
              {EQ_HZ[i] >= 1000 ? `${EQ_HZ[i] / 1000}k` : EQ_HZ[i]}
            </span>
            <span className="font-mono text-[9px] text-[#b0b6c0]">{dbToByte(db).toString(16)}</span>
          </label>
        ))}
      </div>
      <button
        disabled={!app.connected}
        onClick={() => void app.commitEq()}
        className="mt-4 w-full rounded-full bg-blue py-3 font-semibold text-white disabled:opacity-40"
      >
        Apply to device
      </button>
    </div>
  );
}

export function SafeVolumePage() {
  const app = useApp();
  return (
    <div className="px-4 py-3">
      <p className="text-sm text-mute">
        Caps headphone output. The official app stores this on-device; SoundControl remembers it here and shows a
        warning above 85%.
      </p>
      <div className="mt-8 text-center">
        <p className="text-5xl font-semibold text-blue">{app.safeVolume}</p>
        <p className="text-sm text-mute">percent</p>
      </div>
      <input
        type="range"
        min={60}
        max={100}
        value={app.safeVolume}
        onChange={(e) => app.setSafeVolume(Number(e.target.value))}
        className="mt-6 w-full accent-blue"
      />
      {app.safeVolume > 85 && (
        <p className="mt-3 rounded-xl bg-[#fff1f2] px-3 py-2 text-sm text-danger">
          High volumes can damage hearing during long sessions.
        </p>
      )}
    </div>
  );
}
