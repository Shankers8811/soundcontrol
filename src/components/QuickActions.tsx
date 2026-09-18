import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';
import { CapabilityGate, Card } from './ui';

/**
 * Quick actions (PART H) — shortcuts to REAL factory EQ presets.
 *
 * There is no standalone "Bass Boost" or "Voice Enhance" command in the
 * Soundcore protocol (PROTOCOL.md: BassUp has no capture and was removed).
 * What genuinely exists are the 22 factory EQ curves the device accepts over
 * `02:81`/`02:83` — so each quick action applies one of those real presets
 * (byte-identical frames, verified by scripts/verify-protocol.mjs) and shows
 * which one the device currently reports.
 *
 * On models whose EQ travels over the unimplemented 03:87 HearID frame, the
 * whole card becomes an explanatory unsupported note — no dead buttons.
 */

/** Real factory curves used as one-tap shortcuts (ids from presets.ts). */
const QUICK_PRESET_IDS = ['bass', 'bass-cut', 'spoken-word'] as const;

export function QuickActions() {
  const app = useApp();
  const caps = app.capabilities;
  const disabled = !app.connected || app.busy === 'eq';

  return (
    <Card title="Quick Actions" subtitle="One-tap factory curves, sent as real EQ preset frames">
      <CapabilityGate
        supported={caps.supportsEqualizer}
        noteTitle="No quick sound actions on this model"
        note={
          <>
            {app.profile.name} ({app.profile.sku}) takes its equalizer over the model-specific{' '}
            <code className="font-mono text-ink/80">03:87</code> HearID frame, which SoundControl
            deliberately does not guess — a wrong payload could overwrite the hearing profile the
            Soundcore phone app measured. Preset shortcuts are therefore unavailable; see the
            Equalizer page for details.
          </>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUICK_PRESET_IDS.map((id) => {
            const preset = EQ_PRESETS.find((p) => p.id === id);
            if (!preset) return null;
            const active = app.eqId === preset.id;
            return (
              <button
                key={id}
                disabled={disabled}
                aria-pressed={active}
                onClick={() => void app.applyPreset(preset).catch(() => {})}
                className={`rounded-xl border px-3.5 py-3 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? 'border-accent/60 bg-accent/12 shadow-[0_0_14px_rgb(61_123_255/0.18)]'
                    : 'border-edge bg-sunken hover:border-accent/40 hover:bg-raised'
                }`}
              >
                <span
                  className={`block text-xs font-bold ${active ? 'text-accent-soft' : 'text-ink'}`}
                >
                  {preset.name}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-mute">{preset.blurb}</span>
                <span className="mt-1.5 block font-mono text-[10px] text-faint">
                  {active ? 'active on device' : `preset 0x${preset.index.toString(16).padStart(2, '0').toUpperCase()}`}
                </span>
              </button>
            );
          })}
        </div>
        {!app.connected && (
          <p className="mt-3 text-[11px] text-faint">Connect a device to apply a curve.</p>
        )}
      </CapabilityGate>
    </Card>
  );
}
