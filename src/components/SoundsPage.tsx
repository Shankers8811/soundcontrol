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
    <div className="space-y-4 px-4 py-3 pb-8">
      {/* Sound Effects Header / Toggles */}
      <section className="space-y-2 rounded-2xl bg-wash p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink">BassUp™</p>
            <p className="text-xs text-mute">Real-time dynamic bass boost algorithm</p>
          </div>
          <button
            disabled={!app.connected}
            onClick={() => void app.setBassUp(!app.bassUp)}
            className={`toggle ${app.bassUp ? 'on' : ''}`}
            aria-label="BassUp"
          />
        </div>

        <div className="my-2 h-px bg-line" />

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink">Spatial Audio / 3D Sound</p>
            <p className="text-xs text-mute">Immersive theatre-like soundstage</p>
          </div>
          <button
            disabled={!app.connected}
            onClick={() => void app.setSpatialAudio(!app.spatialAudio)}
            className={`toggle ${app.spatialAudio ? 'on' : ''}`}
            aria-label="Spatial Audio"
          />
        </div>
      </section>

      {/* Mode Choices */}
      <div className="space-y-2">
        <Choice
          title="HearID Sound"
          sub={app.hearId ? 'Personalized to your hearing test' : 'Personalized hearing calibration test'}
          badge={app.hearId ? 'Active' : undefined}
          on={app.hearId}
          onClick={() => app.push('hearid')}
        />
        <Choice
          title="Default (Signature)"
          sub="Soundcore Signature factory curve"
          on={!app.hearId && app.eqId === 'signature'}
          onClick={() => {
            const p = EQ_PRESETS.find((x) => x.id === 'signature');
            if (p) void app.applyPreset(p);
          }}
        />
        <Choice
          title="Custom Equalizer"
          sub="Adjust the 8-band graphic EQ curve"
          on={!app.hearId && app.eqId === 'custom'}
          onClick={() => app.push('eq-custom')}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Soundcore Presets</h3>
          <span className="text-xs font-mono text-mute">{EQ_PRESETS.length} presets</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {EQ_PRESETS.map((p) => (
            <button
              key={p.id}
              disabled={!app.connected}
              onClick={() => void app.applyPreset(p)}
              className={`overflow-hidden rounded-2xl text-left border transition ${
                !app.hearId && current?.id === p.id
                  ? 'border-blue ring-2 ring-blue/30 shadow-xs'
                  : 'border-transparent hover:border-slate-300'
              } disabled:opacity-40`}
            >
              <div className="h-16 w-full flex items-end p-2.5" style={{ background: p.swatch }}>
                {p.featured && (
                  <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                    Popular
                  </span>
                )}
              </div>
              <div className="bg-wash px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                <p className="truncate text-[11px] text-mute">{p.blurb}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Choice({
  title,
  sub,
  badge,
  on,
  onClick,
}: {
  title: string;
  sub: string;
  badge?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
        on ? 'border-blue bg-sky/30 shadow-xs' : 'border-line bg-wash hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            on ? 'border-blue bg-blue text-[11px] text-white' : 'border-[#c5cad3] bg-white'
          }`}
        >
          {on ? '✓' : ''}
        </span>
        <div className="min-w-0">
          <span className="block font-medium text-ink">{title}</span>
          <span className="block truncate text-xs text-mute">{sub}</span>
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-blue px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
          {badge}
        </span>
      )}
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
