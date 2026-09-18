import { useApp } from '../state/store';
import type { ThemePref } from '../types';
import { IconCheck } from './Icons';

/**
 * Settings → Appearance (Pass 8). Theme selection lives ONLY here — never in
 * the sidebar. Three honest options:
 *
 *  - System: follows the OS prefers-color-scheme (resolved live in the shell
 *    via matchMedia, so it reacts to an OS theme change without a restart),
 *  - Dark:   the original SoundControl dark-navy appearance,
 *  - Light:  the same design language on light surfaces (accent untouched).
 *
 * The choice persists through the same store/localStorage mechanism as every
 * other real setting (`sc.theme`). Visually this reuses the segmented
 * aria-pressed button pattern the ANC mode picker already established — no
 * new design vocabulary, no new dependencies.
 */

const OPTIONS: Array<{ id: ThemePref; label: string; sub: string }> = [
  { id: 'system', label: 'System', sub: 'Follow Windows' },
  { id: 'dark', label: 'Dark', sub: 'SoundControl navy' },
  { id: 'light', label: 'Light', sub: 'Same design, light surfaces' },
];

export function ThemeSection() {
  const app = useApp();
  return (
    <div
      role="group"
      aria-label="Theme"
      className="grid grid-cols-3 gap-2"
    >
      {OPTIONS.map((o) => {
        const active = app.theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => app.setTheme(o.id)}
            aria-pressed={active}
            className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
              active
                ? 'border-accent/60 bg-accent/12 shadow-[0_0_14px_rgb(61_123_255/0.18)]'
                : 'border-edge bg-sunken hover:border-accent/40 hover:bg-raised'
            }`}
          >
            <span className="flex items-center justify-between gap-1.5">
              <span className={`text-xs font-bold ${active ? 'text-accent-soft' : 'text-ink'}`}>
                {o.label}
              </span>
              {active && <IconCheck size={13} className="shrink-0 text-accent" />}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-mute">{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
