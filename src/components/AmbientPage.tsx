import { useApp } from '../state/store';
import type { AncScene } from '../types';
import { IconAnc, IconNormal, IconTrans } from './Icons';

interface AncOption {
  title: string;
  desc: string;
  icon: string;
  apply: () => Promise<void>;
  isActive: boolean;
}

export function AmbientPage() {
  const app = useApp();

  const isAnc = app.ancMode === 'anc' || app.ancMode === 'adaptive';
  const isTrans = app.ancMode === 'transparency';
  const isNormal = app.ancMode === 'normal';

  // Noise cancellation presets with friendly names instead of raw numbers
  const cancellationModes: AncOption[] = [
    {
      title: 'Adaptive Noise Cancelling',
      desc: 'Auto-adjusts cancellation level in real-time as your environment changes',
      icon: '✨',
      isActive: app.ancMode === 'adaptive',
      apply: () => app.setAnc('adaptive'),
    },
    {
      title: 'Maximum Cancellation',
      desc: 'Deepest quiet for airplanes, trains, and loud environments',
      icon: '🛡️',
      isActive: app.ancMode === 'anc' && app.ancLevel >= 4,
      apply: () => app.setAnc('anc', 5),
    },
    {
      title: 'Balanced Everyday',
      desc: 'Comfortable balance for coffee shops, offices, and walking',
      icon: '☕',
      isActive: app.ancMode === 'anc' && app.ancLevel === 3,
      apply: () => app.setAnc('anc', 3),
    },
    {
      title: 'Gentle & Relaxed',
      desc: 'Light cancellation with minimal ear pressure for quiet rooms',
      icon: '🌿',
      isActive: app.ancMode === 'anc' && app.ancLevel <= 2,
      apply: () => app.setAnc('anc', 1),
    },
  ];

  // Specific over-ear scenes (Q30, Q35, Space Q45)
  const sceneModes: { id: AncScene; title: string; desc: string; icon: string }[] = [
    { id: 'transport', title: 'Transport', desc: 'Blocks engine rumble, planes, and subway noise', icon: '✈️' },
    { id: 'outdoor', title: 'Outdoor', desc: 'Reduces wind buffeting and street traffic', icon: '🌳' },
    { id: 'indoor', title: 'Indoor', desc: 'Quiets background chatter and office distractions', icon: '🏢' },
  ];

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      {/* 3 Main Mode Selector (Exact Android App Style) */}
      <div className="rounded-3xl bg-wash p-4 border border-line">
        <p className="text-xs font-bold uppercase tracking-wider text-mute mb-3">Ambient Sound Mode</p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => void app.setAnc('anc', app.profile.ancLevels ? 5 : app.ancLevel)}
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition ${
              isAnc ? 'bg-white shadow-sm ring-2 ring-blue text-blue' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isAnc ? 'bg-blue text-white' : 'bg-slate-200'}`}>
              <IconAnc size={24} />
            </span>
            <span className="text-xs font-bold text-center leading-tight">Noise Cancelling</span>
          </button>

          <button
            onClick={() => void app.setAnc('normal')}
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition ${
              isNormal ? 'bg-white shadow-sm ring-2 ring-blue text-blue' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isNormal ? 'bg-blue text-white' : 'bg-slate-200'}`}>
              <IconNormal size={24} />
            </span>
            <span className="text-xs font-bold text-center leading-tight">Normal (Off)</span>
          </button>

          <button
            disabled={!app.profile.transparency}
            onClick={() => void app.setAnc('transparency')}
            title={
              app.profile.transparency
                ? undefined
                : `${app.profile.name} has no transparency sub-mode in its protocol`
            }
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isTrans ? 'bg-white shadow-sm ring-2 ring-blue text-blue' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isTrans ? 'bg-blue text-white' : 'bg-slate-200'}`}>
              <IconTrans size={24} />
            </span>
            <span className="text-xs font-bold text-center leading-tight">Transparency</span>
          </button>
        </div>
      </div>

      {/* Noise Cancellation Options (No typing or selecting raw numbers) */}
      {isAnc && app.profile.ancLevels && (
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-mute">Noise Cancelling Modes</p>
          <div className="grid gap-2">
            {cancellationModes.map((m) => (
              <button
                key={m.title}
                onClick={() => void m.apply()}
                className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition ${
                  m.isActive
                    ? 'border-blue bg-sky/40 ring-1 ring-blue/30 shadow-xs'
                    : 'border-line bg-wash hover:border-slate-300'
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink">{m.title}</div>
                  <div className="text-xs text-mute mt-0.5 leading-snug">{m.desc}</div>
                </div>
                {m.isActive && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue text-white text-xs font-bold">
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

        </div>
      )}

      {/*
        Environment scenes are separate from the level list on purpose: the
        classic over-ears (Q30 / Q35 / Life Tune / Space One / Space Q45) take
        a scene byte in every ANC frame and have no manual level at all, so
        nesting this inside the level block would hide it from exactly the
        models that use it.
      */}
      {app.profile.scenes && app.ancMode === 'anc' && (
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-mute">Environment Scenes</p>
          <div className="grid gap-2">
            {sceneModes.map((s) => {
              const active = app.ancMode === 'anc' && app.ancScene === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => void app.setAnc('anc', app.ancLevel, s.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    active ? 'border-blue bg-sky/40' : 'border-line bg-wash hover:border-slate-300'
                  }`}
                >
                  <span className="text-xl">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-ink">{s.title}</div>
                    <div className="text-[11px] text-mute">{s.desc}</div>
                  </div>
                  {active && <span className="text-blue font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Transparency Mode Choices */}
      {isTrans && app.profile.transparency && (
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-mute">Transparency Options</p>
          <div className="grid gap-2">
            <button
              onClick={() => {
                void app.setTransVocal(false);
                void app.setAnc('transparency');
              }}
              className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition ${
                !app.transVocal
                  ? 'border-blue bg-sky/40 ring-1 ring-blue/30 shadow-xs'
                  : 'border-line bg-wash hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">🌐</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">Fully Transparent</div>
                <div className="text-xs text-mute mt-0.5">Hear all ambient environmental sounds naturally</div>
              </div>
              {!app.transVocal && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue text-white text-xs font-bold">
                  ✓
                </div>
              )}
            </button>

            <button
              onClick={() => void app.setTransVocal(true)}
              className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition ${
                app.transVocal
                  ? 'border-blue bg-sky/40 ring-1 ring-blue/30 shadow-xs'
                  : 'border-line bg-wash hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">🗣️</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">Vocal / Talk Mode</div>
                <div className="text-xs text-mute mt-0.5">Amplifies human speech and conversations while reducing background noise</div>
              </div>
              {app.transVocal && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue text-white text-xs font-bold">
                  ✓
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Wind Noise Reduction Switch */}
      {app.profile.wind ? (
        <div className="flex items-center justify-between rounded-2xl border border-line bg-wash p-4">
          <div>
            <p className="font-bold text-sm text-ink">Wind Noise Reduction</p>
            <p className="text-xs text-mute">Suppresses microphone buffeting in windy conditions</p>
          </div>
          <button
            onClick={() => void app.setWindNoise(!app.windNoise)}
            className={`toggle ${app.windNoise ? 'on' : ''}`}
            aria-label="Wind Noise Reduction"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-line bg-wash p-4 text-xs leading-relaxed text-mute">
          {app.profile.name} ({app.profile.sku}) has no wind-noise field in its sound-mode frame, so
          there is nothing to toggle.
        </p>
      )}

      {app.profile.ancLayout === 'none' && (
        <p className="rounded-2xl border border-line bg-wash p-4 text-xs leading-relaxed text-mute">
          {app.profile.name} ({app.profile.sku}) exposes no sound-mode control at all — the official
          app has no ANC page for it either, so SoundControl does not send one.
        </p>
      )}
    </div>
  );
}
