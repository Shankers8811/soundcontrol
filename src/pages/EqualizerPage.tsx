import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';
import { eqBucketForMode } from '../state/derive';
import { EQ_HZ } from '../types';
import type { EqBucket } from '../types';
import { EqCurve } from '../components/EqCurve';
import { IconCheck, IconEqualizer } from '../components/Icons';
import { Button, CapabilityGate, Card, PageHeader, StatusBadge, Toggle } from '../components/ui';

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
          app.profile.id === 'unknown' ? (
            <>
              This device’s model could not be identified. Equalizer commands and byte layouts
              differ per model, and SoundControl never guesses a payload for unknown firmware — a
              wrong frame could overwrite a personalised hearing profile. EQ stays disabled until
              the model is known (a Windows-readable device name, a previous connection, or a
              manual profile override on the Devices page).
            </>
          ) : (
            <>
              {app.profile.name} ({app.profile.sku}) receives its equalizer through the
              model-specific <code className="font-mono text-ink/80">03:87</code> HearID frame, which
              embeds a personalised per-device curve. No public, labelled capture of that frame
              exists for the supported models, and a guessed payload could overwrite the hearing
              profile the Soundcore phone app measured — so SoundControl does not send it and shows
              no EQ controls for this model. Use the Soundcore mobile app for its equalizer.
            </>
          )
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
          <div className="space-y-4 xl:col-span-5">
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

            <SavedPresetsCard />
            <PerModeEqCard />
          </div>
        </div>
      </CapabilityGate>
    </div>
  );
}

/**
 * Locally saved EQ curves. The device protocol has no user-preset storage, so
 * this library lives in `localStorage`; applying an entry still sends the
 * model's real custom-EQ frame. Import/export is plain JSON, and the UI never
 * claims a curve is on the device until the device reports it back.
 */
function SavedPresetsCard() {
  const app = useApp();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const applyDisabled = !app.connected || app.busy === 'eq';

  const save = () => {
    const preset = app.savePreset(name);
    if (!preset) {
      setMessage('Give the curve a name first.');
      return;
    }
    setName('');
    setMessage(`Saved “${preset.name}” locally.`);
  };

  const download = () => {
    const blob = new Blob([app.exportSavedPresets()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'soundcontrol-eq-presets.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${app.savedPresets.length} preset(s).`);
  };

  const importFile = async (file: File | null) => {
    if (!file) return;
    const result = app.importSavedPresets(await file.text());
    setMessage(result.error ?? `Imported ${result.added} preset(s).`);
  };

  return (
    <Card
      title="Your presets"
      subtitle="Local curve library — applying one sends the real FE FE custom frame"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={app.savedPresets.length === 0} onClick={download}>
            Export
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Import EQ presets"
            onChange={(e) => {
              void importFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>
      }
    >
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          maxLength={40}
          placeholder="Name this curve"
          aria-label="Preset name"
          className="min-w-0 flex-1 rounded-lg border border-edge bg-sunken px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
        <Button size="sm" variant="primary" onClick={save}>
          Save current
        </Button>
      </div>

      {app.savedPresets.length === 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          No saved curves yet. Shape the faders above, name the curve, and save it — it stays in
          this app, never on the device.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {app.savedPresets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center gap-2 rounded-lg border border-edge bg-sunken px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{preset.name}</span>
                <span className="mt-0.5 flex h-3 items-end gap-[2px]" aria-hidden>
                  {preset.bands.map((db, i) => (
                    <span
                      key={i}
                      className="w-full rounded-[1px] bg-[#2c3a58]"
                      style={{ height: `${Math.max(12, ((db + 6) / 12) * 100)}%` }}
                    />
                  ))}
                </span>
              </span>
              <Button
                size="sm"
                disabled={applyDisabled}
                onClick={() => void app.applySavedPreset(preset).catch(() => {})}
              >
                Apply
              </Button>
              <button
                onClick={() => app.deleteSavedPreset(preset.id)}
                aria-label={`Delete ${preset.name}`}
                title="Delete this local preset"
                className="rounded p-1 text-faint transition-colors hover:bg-raised hover:text-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-2 text-[11px] text-mute">{message}</p>}
    </Card>
  );
}

const EQ_BUCKET_LABELS: Array<[EqBucket, string]> = [
  ['anc', 'ANC / Adaptive'],
  ['normal', 'Normal'],
  ['transparency', 'Transparency'],
];

/**
 * Per-noise-mode EQ memory. The device holds one EQ state; this is an
 * app-side memory that re-sends the documented EQ frame when the noise mode
 * changes. Off by default, because an automatic write should be an explicit
 * choice. Nothing here is device storage.
 */
function PerModeEqCard() {
  const app = useApp();
  const current = eqBucketForMode(app.ancMode);

  return (
    <Card
      title="EQ per noise mode"
      subtitle="Local memory · the same real EQ frame is re-sent on mode changes"
    >
      <Toggle
        label="Remember a separate EQ for each noise mode"
        checked={app.preferences.perModeEq}
        onChange={(on) => app.setPreference('perModeEq', on)}
      />
      <ul className="mt-3 space-y-1.5">
        {EQ_BUCKET_LABELS.map(([bucket, label]) => {
          const entry = app.eqModeProfiles[bucket];
          const value =
            entry === null
              ? 'Not remembered'
              : entry.kind === 'preset'
                ? `Factory preset ${entry.presetId}`
                : 'Custom curve';
          return (
            <li
              key={bucket}
              className="flex items-center gap-2 rounded-lg border border-edge bg-sunken px-3 py-2 text-xs"
            >
              <span className="w-32 shrink-0 font-medium text-ink">
                {label}
                {bucket === current && <span className="ml-1 text-[10px] text-accent-soft">now</span>}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-mute">{value}</span>
              <button
                disabled={entry === null}
                onClick={() => app.clearEqModeProfile(bucket)}
                className="rounded px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-raised hover:text-danger disabled:opacity-40"
              >
                Clear
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Applying a preset or custom curve while this is on records it for the current noise mode.
        Switching modes re-sends the remembered curve through the model’s documented EQ command;
        a model without one is left untouched.
      </p>
    </Card>
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
