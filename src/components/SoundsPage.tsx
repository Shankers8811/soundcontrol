import { useEffect, useRef } from 'react';
import { EQ_PRESETS } from '../protocol/presets';
import { useApp } from '../state/store';
import { EQ_HZ } from '../types';
import { EqCurve } from './EqCurve';

export function SoundsPage() {
  const app = useApp();
  const current = EQ_PRESETS.find((p) => p.id === app.eqId);

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      {/*
        Sound effects. Only the 02:86 surround toggle is here: there is no
        BassUp command in any capture or in OpenSCQ30's command table, so the
        toggle that used to sit above this one was sending nothing and has
        been removed rather than left as a dead switch.
      */}
      {app.profile.surround ? (
        <section className="rounded-2xl bg-wash p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">3D Surround Sound</p>
              <p className="text-xs text-mute">Immersive theatre-like soundstage</p>
            </div>
            <button
              disabled={!app.connected}
              onClick={() => void app.setSurroundSound(!app.surround)}
              className={`toggle ${app.surround ? 'on' : ''}`}
              aria-label="3D Surround Sound"
            />
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-line bg-wash p-3.5 text-xs leading-relaxed text-mute">
          {app.profile.name} ({app.profile.sku}) does not implement the 02:86 surround toggle, so
          3D Sound is not available for this model.
        </p>
      )}

      {!app.profile.eqCommand && (
        <p className="rounded-2xl border border-line bg-wash p-4 text-xs leading-relaxed text-mute">
          <span className="font-semibold text-ink">Equalizer unavailable on this model.</span>{' '}
          {app.profile.name} ({app.profile.sku}) takes its EQ over the model-specific{' '}
          <code className="font-mono">03:87</code> HearID frame, which embeds a per-device
          personalised curve. SoundControl will not guess that payload — sending a wrong one can
          overwrite the hearing profile the phone app measured. Use the Soundcore app for EQ on
          this model.
        </p>
      )}

      {/* Mode Choices */}
      <div className={`space-y-2 ${app.profile.eqCommand ? '' : 'pointer-events-none opacity-40'}`}>
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
        <div
          className={`grid grid-cols-2 gap-3 ${app.profile.eqCommand ? '' : 'pointer-events-none opacity-40'}`}
        >
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

  const resetFlat = () => {
    app.bands.forEach((_, i) => app.setBand(i, 0));
    if (app.connected) void app.commitEq();
  };

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      <div className="rounded-2xl bg-wash p-3 border border-line">
        <EqCurve bands={app.bands} />
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-mute">Custom Equalizer</span>
        <button onClick={resetFlat} className="text-xs font-semibold text-blue hover:underline">
          Reset Flat
        </button>
      </div>

      <div className="rounded-2xl bg-wash p-4 border border-line flex items-end justify-between gap-1 overflow-x-auto pb-2">
        {app.bands.map((db, i) => (
          <label key={EQ_HZ[i]} className="flex min-w-10 flex-col items-center gap-1.5">
            <span className="text-[11px] font-bold text-blue">{db > 0 ? `+${db}` : db}</span>
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
            <span className="text-[11px] font-semibold text-slate-600">
              {EQ_HZ[i] >= 1000 ? `${EQ_HZ[i] / 1000}k` : EQ_HZ[i]}
            </span>
          </label>
        ))}
      </div>

      <button
        disabled={!app.connected}
        onClick={() => void app.commitEq()}
        className="w-full rounded-full bg-blue py-3.5 font-bold text-white shadow-md hover:bg-blue-2 disabled:opacity-40"
      >
        Save & Apply Curve
      </button>
    </div>
  );
}

export function SafeVolumePage() {
  const app = useApp();

  const presets = [
    { label: 'Extra Protection (80 dB)', value: 80, desc: 'Gentle on ears, ideal for study or long listening' },
    { label: 'Recommended (85 dB)', value: 85, desc: 'WHO standard safe listening limit for daily music' },
    { label: 'Maximum Output (90 dB)', value: 90, desc: 'Higher output for noisy fitness or outdoor use' },
  ];

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      <div className="rounded-3xl bg-wash p-4 border border-line">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-ink">Safe Volume Limiter</p>
            <p className="text-xs text-mute">Protects ears from sudden or prolonged excessive volume</p>
          </div>
          <button
            onClick={() => app.setSafeVolume(app.safeVolume > 0 ? 0 : 85)}
            className={`toggle ${app.safeVolume > 0 ? 'on' : ''}`}
            aria-label="Safe Volume"
          />
        </div>
      </div>

      {app.safeVolume > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-mute">Volume Cap Settings</p>
          <div className="grid gap-2">
            {presets.map((p) => {
              const active = app.safeVolume === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => app.setSafeVolume(p.value)}
                  className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition ${
                    active ? 'border-blue bg-sky/40 ring-1 ring-blue/30 shadow-xs' : 'border-line bg-wash hover:border-slate-300'
                  }`}
                >
                  <span className="text-2xl">🛡️</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink">{p.label}</div>
                    <div className="text-xs text-mute mt-0.5">{p.desc}</div>
                  </div>
                  {active && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue text-white text-xs font-bold">
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
