import { Card } from './ui';
import { IconVolume } from './Icons';

/**
 * Volume (PART F) — an honest, disabled card.
 *
 * No Soundcore RFCOMM capture and no OpenSCQ30 command table contains a
 * volume read or set frame, so SoundControl has no real device volume to
 * show and no command to send. Rather than a local-only slider pretending to
 * control the headset, this card states exactly that and points at the two
 * volume paths that genuinely work: the Windows mixer and the earbuds' own
 * buttons (whose mappings the device itself handles).
 *
 * `capabilities.supportsVolume` is a hard `false` in src/state/derive.ts; if
 * a future protocol capture ever documents a volume command, the capability
 * flips there and this card is the place to build the real control.
 */
export function VolumeControl() {
  return (
    <Card title="Volume" subtitle="Device-side volume is not part of the Soundcore RFCOMM protocol">
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
            SoundControl will not fake a headset volume: the protocol this app speaks has no
            volume command in any published capture. Adjust playback volume in the{' '}
            <span className="font-semibold text-ink">Windows mixer</span>, or with your earbuds'
            own buttons — those work without this app.
          </p>
        </div>
      </div>
    </Card>
  );
}
