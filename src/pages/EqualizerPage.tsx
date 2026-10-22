import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';
import { EQ_BAND_MAX, EQ_BAND_MIN, EQ_BAND_STEP, EQ_HZ } from '../types';
import { isForeignPreset } from '../lib/eqPresets';
import { EqCurve } from '../components/EqCurve';
import { DeviceSettingsHeader } from '../components/DeviceSettingsHeader';
import { IconCheck, IconEqualizer } from '../components/Icons';
import { Button, CapabilityGate, Card, PageHeader, StatusBadge } from '../components/ui';

// ---------------------------------------------------------------------------
// EQ preset import / export helpers
// ---------------------------------------------------------------------------

interface EqPresetFile {
  /** Schema identifier — guards against loading unrelated JSON files. */
  soundcontrol: 'eq-preset';
  /** Friendly name the user gave this preset. */
  name: string;
  /** Band gains in dB, 8 values, same order as EQ_HZ (100 Hz → 12.8 kHz). */
  bands: number[];
  /** App version that exported the file — informational only. */
  exportedBy?: string;
}

function exportEqPreset(bands: number[], name: string) {
  const payload: EqPresetFile = {
    soundcontrol: 'eq-preset',
    name,
    bands,
    exportedBy: 'SoundControl',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eq-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function importEqPreset(): Promise<EqPresetFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as unknown;
          if (
            typeof data === 'object' &&
            data !== null &&
            (data as EqPresetFile).soundcontrol === 'eq-preset' &&
            Array.isArray((data as EqPresetFile).bands) &&
            (data as EqPresetFile).bands.length === 8 &&
            (data as EqPresetFile).bands.every((v: unknown) => typeof v === 'number' && v >= -6 && v <= 6)
          ) {
            resolve(data as EqPresetFile);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

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
        sub={<StatusBadge phase={app.connectionPhase} />}
      />

      <DeviceSettingsHeader />

      <CapabilityGate
        supported={caps.supportsEqualizer}
        noteTitle="The equalizer is not available on this model"
        note={
          app.profile.id === 'unknown' || (app.connected && app.identification !== 'verified') ? (
            <>
              This device’s model identification is uncertain or mismatched. Equalizer commands and byte layouts
              differ per model, and SoundControl never guesses a payload for unknown firmware — a
              wrong frame could overwrite a personalised hearing profile. EQ stays disabled until
              the model-specific state layout is confirmed. A manual model candidate cannot
              override the command boundary.
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
              {caps.supportsCustomEq ? (
                <CustomFaders />
              ) : (
                /* Phase 18: A3949 (R50i / P20i / P25i) accepts factory
                   presets only — OpenSCQ30's device definition sets
                   custom_preset_id None and no live capture ever used FEFE —
                   so the custom editor is hidden rather than shown as if it
                   worked. Factory presets (right column) keep working. */
                <p className="mt-3 rounded-xl border border-edge bg-sunken px-4 py-3 text-xs leading-relaxed text-mute">
                  Custom curves are not supported by{' '}
                  <span className="font-semibold text-ink">{app.profile.name}</span> (
                  {app.profile.sku}) — this model supports factory presets only; the factory
                  presets on the right are everything it accepts. SoundControl does not send the{' '}
                  <span className="font-mono text-[11px]">FE FE</span> custom frame to hardware
                  that has no documented support for it.
                </p>
              )}
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
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const name = prompt('Name for this EQ preset:', 'My Custom EQ') ?? 'My Custom EQ';
    exportEqPreset(app.bands, name.trim() || 'My Custom EQ');
  };

  const handleImport = async () => {
    setImportError(null);
    const preset = await importEqPreset();
    if (!preset) {
      setImportError('Invalid file — make sure it is a SoundControl EQ preset (.json).');
      return;
    }
    preset.bands.forEach((v, i) => app.setBand(i, v));
    if (app.connected) void app.commitEq().catch(() => {});
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={false} onClick={handleExport}>
            Export preset
          </Button>
          <Button size="sm" disabled={false} onClick={handleImport}>
            Import preset
          </Button>
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
      {importError && (
        <p className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {importError}
        </p>
      )}

      <div className="flex items-end justify-between gap-1 overflow-x-auto rounded-xl border border-edge bg-sunken px-4 pb-3 pt-4">
        {app.bands.map((db, i) => (
          <label key={EQ_HZ[i]} className="flex min-w-10 flex-col items-center gap-1.5">
            <span className={`font-mono text-[11px] font-bold ${db === 0 ? 'text-mute' : 'text-accent-soft'}`}>
              {db > 0 ? `+${db}` : db}
            </span>
            <input
              className="eq-fader"
              type="range"
              min={EQ_BAND_MIN}
              max={EQ_BAND_MAX}
              step={EQ_BAND_STEP}
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
      <SavedPresets />
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Dragging commits the custom curve (preset id FE FE) to the device after a short debounce;
        the device's own EQ reports keep this view in sync when anything changes from the phone
        app. Use <strong>Export preset</strong> to save your custom curve as a JSON file, and{' '}
        <strong>Import preset</strong> to load a saved curve. Named curves are also kept
        locally under <strong>My presets</strong>, per model. HearID personalisation is deliberately absent: per-model reference writes exist,
        but this app has no measured-profile read/verify workflow and will not overwrite a
        hearing profile or invent a hearing test.
      </p>
    </div>
  );
}

/**
 * Named custom curves kept in local storage — build-order item 1 of the parity
 * plan (`replica/parity.md`). Saving is local-only and never sends a frame;
 * applying goes through `applyStoredPreset`, which reuses the guarded custom-EQ
 * path in the store, so a model without `FE FE` support still refuses it.
 *
 * A preset remembers the SKU it was built for. Applying one to a different
 * model stays possible — the same curve may be wanted on two devices — but the
 * mismatch is labelled, because EQ byte layouts are model-specific and a
 * foreign curve should be a decision, never a surprise.
 */
function SavedPresets() {
  const app = useApp();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = app.busy === 'eq';

  const handleSave = () => {
    const result = app.saveEqPreset(name);
    if (!result.ok) {
      setError(result.error ?? 'Could not save this preset.');
      setNotice(null);
      return;
    }
    setError(null);
    setName('');
    setNotice('Saved to My presets.');
  };

  const handleRename = (id: string, current: string) => {
    const next = window.prompt('Rename preset:', current);
    if (next === null) return;
    const result = app.renameEqPreset(id, next);
    setError(result.ok ? null : (result.error ?? 'Could not rename this preset.'));
  };

  return (
    <div className="mt-4 border-t border-edge-soft pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute">
          <IconEqualizer size={15} className="text-accent" />
          My presets
        </p>
        <span className="font-mono text-[10px] text-faint">{app.eqPresets.length} saved</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-faint">
            Preset name
          </span>
          <input
            value={name}
            maxLength={40}
            placeholder="My curve"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            className="w-full rounded-lg border border-edge bg-sunken px-3 py-2 text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/60"
          />
        </label>
        <Button size="sm" variant="primary" onClick={handleSave}>
          Save current curve
        </Button>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      {!error && notice && (
        <p className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          {notice}
        </p>
      )}

      {app.eqPresets.length === 0 ? (
        <p className="mt-3 rounded-xl border border-edge bg-sunken px-4 py-3 text-[11px] leading-relaxed text-mute">
          No saved presets yet. Move the bands above, give the curve a name, and save it — the
          library lives in this machine’s local storage, not on the device.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {app.eqPresets.map((preset) => {
            const foreign = isForeignPreset(preset, app.profile.sku);
            return (
              <li
                key={preset.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-sunken px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-bold text-ink">{preset.name}</span>
                    {foreign && (
                      <span
                        title={`Saved for ${preset.modelId}; the connected model is ${app.profile.sku}.`}
                        className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-400"
                      >
                        {preset.modelId}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex h-3 items-end gap-[2px]" aria-hidden>
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
                  disabled={!app.connected || busy}
                  onClick={() => void app.applyStoredPreset(preset.id).catch(() => {})}
                >
                  Apply
                </Button>
                <Button size="sm" onClick={() => handleRename(preset.id, preset.name)}>
                  Rename
                </Button>
                <Button size="sm" onClick={() => app.deleteEqPreset(preset.id)}>
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
