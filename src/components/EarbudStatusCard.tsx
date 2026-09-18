import { useApp } from '../state/store';
import type { EarbudSide } from '../state/derive';
import { Card } from './ui';
import { IconBolt } from './Icons';

/**
 * Earbud Connection card (PART J/K).
 *
 * The per-side state comes exclusively from the device's own telemetry: in
 * the `01:03` battery and `01:01` state frames, a side byte of `0xFF` means
 * "that bud is not connected to the host" (PROTOCOL.md, verified against
 * OpenSCQ30's request_battery_level parser). Presence is therefore
 * `both`/`left`/`right`/`none` only once the hardware answered — until then
 * (or with only a Windows aggregate battery) each side renders as
 * "Status unavailable", never a guessed "Not connected".
 *
 * Battery is shown for a side only while the device reports that side as
 * connected; a disconnected side never displays a stale level (the store's
 * mergeBatteryTelemetry clears absent sides at the source, and this card
 * renders `side.state` — never battery — as the connection truth).
 *
 * The card is rendered only for profiles with independent left/right
 * hardware (`capabilities.supportsEarbudState`); over-ears get the single
 * battery readout on the Dashboard instead — no misleading L/R status.
 */

function SidePanel({ side, label }: { side: EarbudSide; label: 'Left' | 'Right' }) {
  const connected = side.state === 'connected';
  const unknown = side.state === 'unknown';
  // State is communicated textually, never by brightness/colour alone.
  const spoken = connected
    ? side.battery !== null
      ? `${label} earbud connected, ${side.battery} percent`
      : `${label} earbud connected, battery pending`
    : unknown
      ? `${label} earbud unknown, awaiting device telemetry`
      : `${label} earbud disconnected`;

  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-colors duration-300 ${
        connected
          ? 'border-accent/45 bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_0_18px_rgb(61_123_255/0.10)]'
          : unknown
            ? 'border-edge bg-sunken'
            : /* disconnected: visibly lighter/desaturated against the dark theme */
              'border-edge/60 bg-sunken/45'
      }`}
      aria-label={spoken}
    >
      {/* Earbud glyph — darker/saturated when live, washed out when not. */}
      <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden className="mt-0.5">
        <g
          className={connected ? 'text-accent-soft' : unknown ? 'text-mute' : 'text-faint'}
          opacity={connected ? 1 : unknown ? 0.65 : 0.38}
        >
          <rect
            x="6"
            y="2"
            width="22"
            height="28"
            rx="10"
            fill="currentColor"
            opacity="0.16"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="17" cy="14" r="3.4" fill="currentColor" />
          <path
            d={label === 'Left' ? 'M13 30 C13 37 12 39 10 42' : 'M21 30 C21 37 22 39 24 42'}
            stroke="currentColor"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <span
        className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
          connected ? 'text-accent-soft' : unknown ? 'text-mute' : 'text-faint'
        }`}
      >
        {label}
      </span>

      <span className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${
            connected
              ? 'bg-accent shadow-[0_0_7px_rgb(61_123_255/0.9)]'
              : unknown
                ? 'bg-faint'
                : 'bg-[#39435a]'
          }`}
          aria-hidden
        />
        <span
          className={`text-xs font-semibold ${
            connected ? 'text-ink' : unknown ? 'text-mute' : 'text-faint'
          }`}
        >
          {connected ? 'Connected' : unknown ? 'Unknown' : 'Disconnected'}
        </span>
      </span>

      <span className="flex items-center gap-1 text-xs text-mute">
        {connected && side.battery !== null ? (
          <>
            {side.charging && <IconBolt size={12} className="text-warn" />}
            <span className="font-mono font-semibold text-ink">{side.battery}%</span>
            {side.charging && <span className="text-[10px] text-warn/90">charging</span>}
          </>
        ) : connected ? (
          <span className="text-[11px] text-faint">Battery pending…</span>
        ) : (
          <span className="text-[11px] text-faint">—</span>
        )}
      </span>
    </div>
  );
}

export function EarbudStatusCard() {
  const app = useApp();
  const state = app.earbudState;

  // Over-ears and single-body devices (`unavailable`): no per-side hardware,
  // no L/R card — never render fake sides.
  if (!state.supported) return null;

  const known = state.left.state !== 'unknown' || state.right.state !== 'unknown';

  return (
    <Card
      title="Earbud Connection"
      subtitle={
        app.connected
          ? known
            ? 'Live per-side status from the device battery telemetry (0xFF = side not connected)'
            : 'Detecting earbuds…'
          : 'Per-side status appears once a device is connected'
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <SidePanel side={state.left} label="Left" />
        <SidePanel side={state.right} label="Right" />
      </div>
    </Card>
  );
}
