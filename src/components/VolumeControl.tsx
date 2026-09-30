import { Card } from './ui';
import { IconVolume } from './Icons';

/**
 * Volume (PART F) — an honest, disabled card.
 *
 * OpenSCQ30 documents an A3116 Motion+ speaker volume command (01:81),
 * but SoundControl has no A3116 model profile or support for its distinct
 * checksum/service policy. Other models cannot inherit that speaker command. Rather than a local-only slider pretending to
 * control the headset, this card states exactly that and points at the two
 * volume paths that genuinely work: the host mixer and the earbuds' own
 * buttons (whose mappings the device itself handles).
 *
 * `capabilities.supportsVolume` is a hard `false` in src/state/derive.ts; if
 * a future implementation validates this command on an exact profile, the
 * capability and this card must both be revisited.
 */
export function VolumeControl() {
  return (
    <Card title="Volume" subtitle="No verified device-volume control is enabled in SoundControl">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge bg-sunken text-faint">
          <IconVolume size={22} />
        </span>
        <div className="min-w-0">
          {/* Rendered disabled on purpose — never interactive, never wired to
              local-only state that would fake a device change. */}
          <input
            type="range"
            min={0}
            max={100}
            value={0}
            disabled
            aria-label="Device volume (not supported by the protocol)"
            className="h-range w-full max-w-[260px]"
          />
          <p className="mt-2.5 text-xs leading-relaxed text-mute">
            SoundControl will not fake a headset volume. A speaker-specific volume command
            exists in a public reference, but this app has no verified model-gated
            read/write/readback path for it. Adjust playback volume in the{' '}
            <span className="font-semibold text-ink">host mixer</span>, or with your earbuds'
            own buttons — those work without this app.
          </p>
        </div>
      </div>
    </Card>
  );
}
