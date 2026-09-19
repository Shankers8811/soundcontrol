import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/store';
import type { AncMode, AncScene } from '../types';
import { CapabilityGate, Card, Toggle } from './ui';
import { IconAdaptive, IconAnc, IconNormal, IconTalk, IconTrans, IconWind } from './Icons';

/**
 * Noise control (PART G) — the three ambient modes every ANC-capable
 * Soundcore model implements over the `06:81` frame, plus only the sub-
 * options the connected model's documented layout actually carries
 * (derived per layout in src/state/derive.ts, never guessed).
 *
 * Truthfulness contract:
 *  - Every click sends the real per-model frame through the bridge.
 *  - The store rolls the selection back when the write fails, so the
 *    animation and the settled ring always end on the REAL device state.
 *  - Models without a sound-mode module (P20i/P25i/R50i/A20i) get an
 *    explanatory unsupported note instead of buttons.
 */

const MODES: Array<{
  id: 'anc' | 'normal' | 'transparency';
  label: string;
  icon: ReactNode;
  matches: (m: AncMode) => boolean;
}> = [
  { id: 'anc', label: 'Noise Cancellation', icon: <IconAnc size={26} />, matches: (m) => m === 'anc' || m === 'adaptive' },
  { id: 'normal', label: 'Normal', icon: <IconNormal size={26} />, matches: (m) => m === 'normal' },
  { id: 'transparency', label: 'Transparency', icon: <IconTrans size={26} />, matches: (m) => m === 'transparency' },
];

const SCENES: Array<{ id: AncScene; label: string }> = [
  { id: 'transport', label: 'Transport' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'indoor', label: 'Indoor' },
];

/** Total duration of the icon transition (~750ms; PART G asks 500–800ms). */
const PULSE_MS = 760;

/**
 * One mode icon with the layered transition effect. The pulse layer mounts
 * only while a real mode change is in flight or just settled; CSS drives the
 * sequence (illuminate → travelling glow → two ripple waves → settle) and
 * `prefers-reduced-motion` collapses it to a static highlight. The effect is
 * confined to this icon — the card around it never glows.
 */
function ModeIcon({
  active,
  pulsing,
  label,
  icon,
  disabled,
  onClick,
}: {
  active: boolean;
  pulsing: boolean;
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="group flex flex-col items-center gap-2.5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className={`nc-icon h-[68px] w-[68px] ${active ? 'nc-active' : ''}`}>
        <span className="nc-ring" aria-hidden />
        {active && pulsing && (
          <span className="nc-pulse pointer-events-none absolute inset-0" aria-hidden>
            <span className="nc-ring" />
            <span className="nc-glow" />
            <span className="nc-ripple nc-ripple-1" />
            <span className="nc-ripple nc-ripple-2" />
          </span>
        )}
        <span
          className={`relative transition-colors duration-200 ${
            active ? 'text-accent-soft' : 'text-mute group-hover:text-ink'
          }`}
        >
          {icon}
        </span>
      </span>
      <span
        className={`text-center text-[11px] font-semibold leading-tight ${
          active ? 'text-accent-soft' : 'text-mute group-hover:text-ink'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export function NoiseControl() {
  const app = useApp();
  const caps = app.capabilities;
  const sub = caps.ancSub;

  // Pulse whenever the REAL mode changes — including a rollback after a
  // failed command, so the animation always ends on the true device state.
  const [pulsing, setPulsing] = useState(false);
  const first = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPulsing(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPulsing(false), PULSE_MS);
  }, [app.ancMode]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const disabled = !app.connected || app.busy === 'anc';
  const isAnc = app.ancHasReport && (app.ancMode === 'anc' || app.ancMode === 'adaptive');

  const changeMode = (mode: 'anc' | 'normal' | 'transparency') => {
    if (disabled) return;
    // Duplicate-command guard: ignore clicks while a mode change is in flight.
    void app.setAnc(mode).catch(() => {
      /* rolled back in the store; the error banner explains what happened */
    });
  };

  return (
    <Card
      title="Noise Control"
      subtitle={
        caps.supportsNoiseControl
          ? `${app.profile.name} · ${app.profile.ancLayout} sound-mode layout`
          : undefined
      }
      actions={
        app.connected && caps.supportsNoiseControl ? (
          <span className="font-mono text-[10px] text-faint">06:81</span>
        ) : undefined
      }
    >
      <CapabilityGate
        supported={caps.supportsNoiseControl}
        noteTitle="Noise control is not available on this model"
        note={
          app.profile.id === 'unknown' ? (
            <>
              This device’s model could not be identified, and every supported model uses a
              different <span className="font-mono">06:81</span> sound-mode byte layout — sending a
              guessed frame could silently set the wrong ANC state. Noise control stays disabled
              until the model is known (a Windows-readable device name, a previous connection, or a
              manual profile override on the Devices page).
            </>
          ) : (
            <>
              {app.profile.name} ({app.profile.sku}) registers no sound-mode module — its firmware
              has no noise-cancelling hardware to command (documented per model in PROTOCOL.md).
              SoundControl never sends a frame the device would silently discard, so no mode buttons
              are shown.
            </>
          )
        }
      >
        <p role="status" className="mb-4 text-xs text-mute">{app.ancStatus}</p>
        {app.profile.id === 'p30i' && (
          <section className="mb-4 rounded-lg border border-edge p-3 text-xs">
            <p className="font-semibold">A3959 hardware diagnostics — physical validation pending</p>
            <p className="my-2 text-mute">Use the same earbuds as Android. Start audio yourself and keep it playing. Each action reads state, sends source-derived transitions, waits for replies, then reads state again. No Windows audio settings are changed. Export TX/RX from Settings → Diagnostics.</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={disabled} onClick={() => void app.readAncState().catch(() => {})}>Read state (A/C/E/G/I)</button>
              <button disabled={disabled} onClick={() => void app.setAnc('normal').catch(() => {})}>B · Normal</button>
              <button disabled={disabled} onClick={() => void app.setAnc('transparency').catch(() => {})}>D · Transparency</button>
              <button disabled={disabled} onClick={() => void app.setAnc('anc', 1).catch(() => {})}>F · Manual 1</button>
              <button disabled={disabled} onClick={() => void app.setAnc('anc', 5).catch(() => {})}>H · Manual 5</button>
            </div>
            <p className="mt-3">Record your observation for this transition (not an automated PASS):</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button disabled={disabled} onClick={() => app.recordAncObservation('PHYSICAL ACOUSTIC EFFECT CONFIRMED BY USER')}>I felt a change</button>
              <button disabled={disabled} onClick={() => app.recordAncObservation('NO PHYSICAL EFFECT OBSERVED')}>No physical change</button>
              <button disabled={disabled} onClick={() => app.recordAncObservation('PHYSICAL EFFECT UNCERTAIN')}>Unsure</button>
            </div>
          </section>
        )}
        <div className="flex items-start justify-center gap-8 py-2 sm:gap-12" aria-label="Noise cancellation mode">
          {MODES.map((m) => (
            <ModeIcon
              key={m.id}
              active={app.ancHasReport && m.matches(app.ancMode)}
              pulsing={pulsing}
              label={m.label}
              icon={m.icon}
              disabled={disabled}
              onClick={() => changeMode(m.id)}
            />
          ))}
        </div>

        {!app.connected && (
          <p className="mt-3 text-center text-xs text-faint">
            Connect a device to change its noise-control mode.
          </p>
        )}

        {/* Sub-options — only the bytes this model's layout really carries. */}
        {(sub.level || sub.adaptive || sub.scenes || sub.wind || sub.transVocal) && (
          <div className="mt-4 space-y-3.5 border-t border-edge-soft pt-4">
            {sub.level && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink">Cancellation strength</p>
                  <p className="text-[11px] text-mute">Manual level sent in the 06:81 frame</p>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label="Noise cancellation level">
                  {[1, 2, 3, 4, 5].map((lvl) => {
                    const on = isAnc && app.ancLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        disabled={disabled}
                        aria-pressed={on}
                        onClick={() => void app.setAnc(app.profile.id === 'p30i' ? 'anc' : app.ancMode === 'adaptive' ? 'adaptive' : 'anc', lvl).catch(() => {})}
                        className={`h-8 w-8 rounded-lg border text-xs font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                          on
                            ? 'border-accent bg-accent/15 text-accent-soft shadow-[0_0_10px_rgb(61_123_255/0.25)]'
                            : 'border-edge bg-sunken text-mute hover:border-accent/40 hover:text-ink'
                        }`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sub.adaptive && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <IconAdaptive size={14} className="text-accent" /> Adaptive cancelling
                  </p>
                  <p className="text-[11px] text-mute">Device adjusts strength to your environment</p>
                </div>
                <Toggle
                  label="Adaptive noise cancelling"
                  checked={app.ancMode === 'adaptive'}
                  disabled={disabled || !isAnc}
                  onChange={(on) => void app.setAnc(on ? 'adaptive' : 'anc').catch(() => {})}
                />
              </div>
            )}

            {sub.scenes && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink">Scene</p>
                  <p className="text-[11px] text-mute">
                    {app.profile.ancLayout === 'tws-p30i'
                      ? 'Selecting a scene requests multi-scene automation, not manual strength'
                      : app.profile.ancLayout === 'tws-l4nc'
                      ? 'Transportation profile carried in the frame'
                      : 'Cancellation scene carried in every mode'}
                  </p>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label="Noise cancellation scene">
                  {SCENES.map((sc) => {
                    const on = app.ancScene === sc.id;
                    return (
                      <button
                        key={sc.id}
                        disabled={disabled}
                        aria-pressed={on}
                        onClick={() => void app.setAnc(app.profile.id === 'p30i' ? 'anc' : app.ancMode, undefined, sc.id).catch(() => {})}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                          on
                            ? 'border-accent bg-accent/15 text-accent-soft'
                            : 'border-edge bg-sunken text-mute hover:border-accent/40 hover:text-ink'
                        }`}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sub.transVocal && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <IconTalk size={14} className="text-accent" /> Vocal / talk mode
                  </p>
                  <p className="text-[11px] text-mute">
                    Transparency sub-mode focused on voices — switching it on selects Transparency
                  </p>
                </div>
                <Toggle
                  label="Vocal transparency mode"
                  checked={app.transVocal && app.ancMode === 'transparency'}
                  disabled={disabled}
                  onChange={(on) => void app.setTransVocal(on).catch(() => {})}
                />
              </div>
            )}

            {sub.wind && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <IconWind size={14} className="text-accent" /> Wind-noise suppression
                  </p>
                  <p className="text-[11px] text-mute">Reduces wind buffeting on the mics</p>
                </div>
                <Toggle
                  label="Wind noise suppression"
                  checked={app.windNoise}
                  disabled={disabled}
                  onChange={(on) => void app.setWindNoise(on).catch(() => {})}
                />
              </div>
            )}
          </div>
        )}
      </CapabilityGate>
    </Card>
  );
}
