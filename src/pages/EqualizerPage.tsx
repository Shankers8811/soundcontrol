import { useEffect, useRef } from 'react';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';
import { EQ_HZ } from '../types';
import { EqCurve } from '../components/EqCurve';
import { IconCheck, IconEqualizer } from '../components/Icons';
import { Button, CapabilityGate, Card, PageHeader, StatusBadge } from '../components/ui';

/**
 * Equalizer page (PART N) — everything here sends real frames.
 *
 * - Presets: the 22 factory curves, byte-identical to the captured wire
 *   blocks (scripts/verify-protocol.mjs pins every one). The active preset
 *   is the id the DEVICE last reported (02:81/02:83 responses), not a
 *   local guess.
 * - Custom: 8 draggable bands committed as the `FE FE` custom-curve frame
 *   over the model's real EQ command (02:81 classic / 02:83 with the DRC
 *   compensation channel).
 * - Models whose EQ travels over the model-specific 03:87 HearID frame
 *   (Liberty 4 NC, Liberty 3 Pro, Space One, Space Q45) get an explanatory
 *   unsupported state instead of controls — SoundControl never guesses that
 *   payload, because a wrong one can overwrite the device's personalised
 *   hearing profile.
 */

export function EqualizerPage() {
  const app = useApp();
  const caps = app.capabilities;
  const disabled = !app.connected || app.busy === 'eq';
  const activePreset = EQ_PRESETS.find((p) => p.id === app.eqId);

  return (
    <div>
      <PageHeader
        title="Equalizer"
        sub={
          <>
            <StatusBadge phase={app.connectionPhase} />
            {app.connected && (
              <span className="font-medium text-ink/90">
                {app.eqId === 'custom' ? 'Custom curve active' : `Preset: ${activePreset?.name ?? app.eqId}`}
              </span>
            )}
            {caps.supportsEqualizer && (
              <span className="font-mono text-[10px] text-faint">
                wire {app.profile.eqCommand} · custom FE FE
              </span>
            )}
          </>
        }
      />

      <CapabilityGate
        supported={caps.supportsEqualizer}
        noteTitle="The equalizer is not available on this model"
        note={
          <>
            {app.profile.name} ({app.profile.sku}) receives its equalizer through the
            model-specific <code className="font-mono text-ink/80">03:87</code> HearID frame, which
            embeds a personalised per-device curve. No public, labelled capture of that frame
            exists for the supported models, and a guessed payload could overwrite the hearing
            profile the Soundcore phone app measured — so SoundControl does not send it and shows
            no EQ controls for this model. Use the Soundcore mobile app for its equalizer.
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* ------------------------------------------------ curve + faders */}
          <div className="space-y-4 xl:col-span-7">
            <Card
              title="Curve"
              subtitle="8 bands · 100 Hz – 12.8 kHz · ±6 dB — the exact values sent on the wire"
              actions={
                <span className="font-mono text-[10px] text-faint">
                  {app.eqId === 'custom' ? 'FE FE custom' : `preset 0x${(activePreset?.index ?? 0).toString(16).padStart(2, '0').toUpperCase()}`}
                </span>
              }
            >
              <EqCurve bands={app.bands} />
              <CustomFaders />
            </Card>
          </div>

          {/* ----------------------------------------------------- presets */}
          <div className="xl:col-span-5">
            <Card
              title="Soundcore presets"
              subtitle={`${EQ_PRESETS.length} factory curves — captured wire bytes, verified against three independent sources`}
            >
              {!app.connected && (
                <p className="mb-3 rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] text-mute">
                  Connect a device to apply presets — the selection is sent as a real EQ frame.
                </p>
              )}
              <div className="grid max-h-[560px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {EQ_PRESETS.map((p) => {
                  const active = app.eqId === p.id;
                  return (
                    <button
                      key={p.id}
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => void app.applyPreset(p).catch(() => {})}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? 'border-accent/60 bg-accent/12 shadow-[0_0_14px_rgb(61_123_255/0.18)]'
                          : 'border-edge bg-sunken hover:border-accent/40 hover:bg-raised'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-1.5">
                        <span className={`truncate text-xs font-bold ${active ? 'text-accent-soft' : 'text-ink'}`}>
                          {p.name}
                        </span>
                        {active && <IconCheck size={13} className="shrink-0 text-accent" />}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-mute">{p.blurb}</span>
                      {/* Real captured band bytes as a mini sparkline. */}
                      <span className="mt-1.5 flex h-4 items-end gap-[2px]" aria-hidden>
                        {p.bands.map((db, i) => (
                          <span
                            key={i}
                            className={`w-full rounded-[1px] ${active ? 'bg-accent/70' : 'bg-[#2c3a58]'}`}
                            style={{ height: `${Math.max(12, ((db + 6) / 12) * 100)}%` }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </CapabilityGate>
    </div>
  );
}

/**
 * Draggable 8-band faders. Dragging stages the band locally; the real
 * `FE FE` custom frame is committed after a 180ms debounce (one write per
 * gesture, not per pixel) and via the explicit Apply button. Reset restores
 * the real Signature factory preset — a sent frame, not a local-only clear.
 */
function CustomFaders() {
  const app = useApp();
  const timer = useRef<number | null>(null);
  const disabled = !app.connected || app.busy === 'eq';

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const onSlide = (i: number, v: number) => {
    app.setBand(i, v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (app.connected) void app.commitEq().catch(() => {});
    }, 180);
  };

  const resetFlat = () => {
    app.bands.forEach((_, i) => app.setBand(i, 0));
    if (app.connected) void app.commitEq().catch(() => {});
  };

  const resetSignature = () => {
    const p = EQ_PRESETS.find((x) => x.id === 'signature');
    if (p) void app.applyPreset(p).catch(() => {});
  };

  return (
    <div className="mt-4 border-t border-edge-soft pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute">
          <IconEqualizer size={15} className="text-accent" />
          Custom equalizer
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={disabled} onClick={resetFlat}>
            Reset flat
          </Button>
          <Button size="sm" disabled={disabled} onClick={resetSignature}>
            Back to Signature
          </Button>
          <Button size="sm" variant="primary" loading={app.busy === 'eq'} disabled={disabled} onClick={() => void app.commitEq().catch(() => {})}>
            Apply curve
          </Button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-1 overflow-x-auto rounded-xl border border-edge bg-sunken px-4 pb-3 pt-4">
        {app.bands.map((db, i) => (
          <label key={EQ_HZ[i]} className="flex min-w-10 flex-col items-center gap-1.5">
            <span className={`font-mono text-[11px] font-bold ${db === 0 ? 'text-mute' : 'text-accent-soft'}`}>
              {db > 0 ? `+${db}` : db}
            </span>
            <input
              className="eq-fader"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              value={db}
              disabled={disabled}
              aria-label={`${EQ_HZ[i] >= 1000 ? `${EQ_HZ[i] / 1000} kHz` : `${EQ_HZ[i]} Hz`} band, ${db} dB`}
              onChange={(e) => onSlide(i, Number(e.target.value))}
            />
            <span className="text-[10px] font-semibold text-faint">
              {EQ_HZ[i] >= 1000 ? `${EQ_HZ[i] / 1000}k` : EQ_HZ[i]}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Dragging commits the custom curve (preset id FE FE) to the device after a short debounce;
        the device's own EQ reports keep this view in sync when anything changes from the phone
        app. HearID personalisation is deliberately absent: the RFCOMM protocol exposes no command
        to create or switch a hearing profile, so SoundControl does not offer one.
      </p>
    </div>
  );
}
