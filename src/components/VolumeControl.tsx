import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';
import { IconVolume } from './Icons';

/**
 * Volume (PART F) — Windows playback volume.
 *
 * No Soundcore RFCOMM capture and no OpenSCQ30 command table contains a
 * volume read or set frame, so this card controls the Windows default output
 * device instead — the earbuds when they are the active output. The desktop
 * app exposes Core Audio over IPC; in a browser/dev preview that surface is
 * absent and the slider stays disabled rather than faking a device change.
 *
 * The earbuds' own hardware volume is still adjusted by their buttons. This
 * card is deliberately labelled as the Windows output level so the two are
 * never confused.
 */
export function VolumeControl() {
  const [volume, setVolume] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<number | null>(null);

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!api?.getSystemVolume) {
      setNote('Windows volume control is available in the desktop app.');
      return;
    }
    let cancelled = false;
    void api
      .getSystemVolume()
      .then((value) => {
        if (cancelled) return;
        if (typeof value === 'number' && Number.isFinite(value)) {
          setVolume(value);
          latest.current = value;
          setAvailable(true);
        } else {
          setNote('Windows did not report a default output device.');
        }
      })
      .catch(() => {
        if (!cancelled) setNote('Could not read the Windows volume.');
      });
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const change = (value: number) => {
    setVolume(value);
    latest.current = value;
    if (timer.current !== null) window.clearTimeout(timer.current);
    // Coalesce a drag into one Core Audio write shortly after the last move.
    timer.current = window.setTimeout(() => {
      const target = latest.current;
      if (target !== null) void window.electronAPI?.setSystemVolume?.(target).catch(() => {});
    }, 120);
  };

  return (
    <Card title="Volume" subtitle="Windows playback volume · controls the default output device">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge bg-sunken text-faint">
          <IconVolume size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 0}
              disabled={!available}
              aria-label="Windows playback volume"
              onChange={(e) => change(Number(e.target.value))}
              className="h-range w-full max-w-[260px]"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs text-mute">
              {volume === null ? '—' : `${volume}%`}
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-mute">
            {note ?? (
              <>
                Adjusts the Windows default output — the earbuds when they are the active
                output. The earbuds' own buttons still change their hardware volume.
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
