import type { SVGProps } from 'react';

/**
 * SoundControl icon set — original 24px stroke icons, one consistent visual
 * language (1.8px round-cap strokes). No emoji, no third-party icon package.
 */

type P = SVGProps<SVGSVGElement> & { size?: number };

function S({ size = 22, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------- navigation */

export function IconDashboard(p: P) {
  return (
    <S {...p}>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="3.5" width="7" height="5.5" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="12" width="7" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    </S>
  );
}

export function IconDevices(p: P) {
  return (
    <S {...p}>
      <path d="M5 11c0-4 3-7.5 7-7.5s7 3.5 7 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="11" width="5.5" height="9" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
      <rect x="15.5" y="11" width="5.5" height="9" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
    </S>
  );
}

export function IconEqualizer(p: P) {
  return (
    <S {...p}>
      <path d="M6 4v6M6 14v6M12 4v3M12 11v9M18 4v9M18 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
      <circle cx="18" cy="15" r="2" fill="currentColor" />
    </S>
  );
}

export function IconControls(p: P) {
  return (
    <S {...p}>
      <rect x="3" y="5.5" width="18" height="6" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="8.5" r="1.6" fill="currentColor" />
      <rect x="3" y="13.5" width="18" height="6" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="16.5" r="1.6" fill="currentColor" />
    </S>
  );
}

export function IconSettings(p: P) {
  return (
    <S {...p}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2M12 18.3V21M4.8 7.2l1.9 1.1M17.3 15.7l1.9 1.1M4.8 16.8l1.9-1.1M17.3 8.3l1.9-1.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </S>
  );
}

export function IconInfo(p: P) {
  return (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.15" fill="currentColor" />
    </S>
  );
}

/* ---------------------------------------------------------- ANC modes */

export function IconAnc(p: P) {
  return (
    <S {...p}>
      <path d="M4 12a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 12a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12.5" r="1.6" fill="currentColor" />
      <path d="M3 18.5l3-3M21 18.5l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconNormal(p: P) {
  return (
    <S {...p}>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconTrans(p: P) {
  return (
    <S {...p}>
      <path
        d="M3.5 12h3M17.5 12h3M7.5 7.8c2.6-2.1 6.4-2.1 9 0M7.5 16.2c2.6 2.1 6.4 2.1 9 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </S>
  );
}

export function IconAdaptive(p: P) {
  return (
    <S {...p}>
      <path d="M4 15c1.8-4.5 3.2 2 5-2s2.6 3 4.4-1.2S17 16 20 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" />
    </S>
  );
}

export function IconWind(p: P) {
  return (
    <S {...p}>
      <path
        d="M3.5 9h9.8a2.6 2.6 0 1 0-2.6-2.6M3.5 13.5h13a2.6 2.6 0 1 1-2.6 2.6M3.5 18h6.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </S>
  );
}

export function IconTalk(p: P) {
  return (
    <S {...p}>
      <path
        d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4.4 3.4a.6.6 0 0 1-.96-.47V15.5h-.64a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 10h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

/* ---------------------------------------------------------- features */

export function IconGame(p: P) {
  return (
    <S {...p}>
      <rect x="2.5" y="7.5" width="19" height="10" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 11v3M5.5 12.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15.6" cy="11.8" r="1.05" fill="currentColor" />
      <circle cx="17.9" cy="13.8" r="1.05" fill="currentColor" />
    </S>
  );
}

export function IconSurround(p: P) {
  return (
    <S {...p}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
    </S>
  );
}

export function IconDualLink(p: P) {
  return (
    <S {...p}>
      <rect x="6.5" y="2.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="14" width="8" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 14h3.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 10.5v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1.5 2.2" />
    </S>
  );
}

export function IconCodec(p: P) {
  return (
    <S {...p}>
      <path d="M4 13V9M8 16V6M12 18V4M16 16V7M20 13v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconVolume(p: P) {
  return (
    <S {...p}>
      <path d="M4 10v4h3l4 3V7L7 10H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15.5 9.5c1 1 1 4 0 5M18 7.5c2.2 2 2.2 7 0 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </S>
  );
}

export function IconEq(p: P) {
  return (
    <S {...p}>
      <path d="M6 19V9M12 19V5M18 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

/* ---------------------------------------------------------- utility */

export function IconRefresh(p: P) {
  return (
    <S {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}

export function IconCheck(p: P) {
  return (
    <S {...p}>
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}

export function IconClose(p: P) {
  return (
    <S {...p}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconAlert(p: P) {
  return (
    <S {...p}>
      <path d="M12 3.8 2.9 19.5h18.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.5v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="1.05" fill="currentColor" />
    </S>
  );
}

export function IconExternal(p: P) {
  return (
    <S {...p}>
      <path d="M13.5 4.5H19.5V10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 4.5 11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconFolder(p: P) {
  return (
    <S {...p}>
      <path
        d="M3.5 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.6.8l.9 1.2h6.9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </S>
  );
}

export function IconBolt(p: P) {
  return (
    <S {...p}>
      <path d="M13 2.5 5.5 13.2h5l-.8 8.3 7.8-10.7h-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </S>
  );
}

export function IconChevron(p: P) {
  return (
    <S size={18} {...p}>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}

export function IconPlus(p: P) {
  return (
    <S {...p}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconBt(p: P) {
  return (
    <S {...p}>
      <path d="M7 7l10 10-5 5V2l5 5L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </S>
  );
}

export function IconTerminal(p: P) {
  return (
    <S {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}

export function IconPower(p: P) {
  return (
    <S {...p}>
      <path d="M12 3.5v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.8 6.9a7.5 7.5 0 1 0 10.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconWindows(p: P) {
  return (
    <S {...p}>
      <path d="M3.5 6.2 10.4 5v6.4H3.5zM11.8 4.8 20.5 3.4v8h-8.7zM3.5 12.6h6.9V19l-6.9-1.2zM11.8 12.6h8.7v8l-8.7-1.4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </S>
  );
}

export function IconTray(p: P) {
  return (
    <S {...p}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8M12 16.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconSound(p: P) {
  return (
    <S {...p}>
      <path d="M4 10v4h3l4 3V7L7 10H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 8.5c1.2 1 1.2 6 0 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.5 6c2.4 2.2 2.4 9.8 0 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
    </S>
  );
}

/* ---------------------------------------------------------- brand + battery */

/**
 * In-app brand mark — the same "SC monogram" as the application icon
 * (assets/icon/sc-monogram.svg), drawn inline at UI scale: navy rounded
 * tile, waveform-S, signal-C with its source node. Decorative only; the
 * adjacent wordmark carries the accessible name.
 */
export function IconLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#101b31" />
      <path
        d="M 10.44 10.13
           C 9.69 8.88 7.94 8.38 6.56 9.13
           C 5.19 9.88 4.81 11.63 5.69 12.75
           C 6.44 13.75 7.81 14.25 8.94 14.88
           C 10.06 15.5 10.94 16.38 10.81 17.75
           C 10.69 19.38 9.31 20.5 7.69 20.38
           C 6.31 20.25 5.31 19.38 5.06 18.25"
        fill="none"
        stroke="#5b95ff"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        d="M 24.79 20.93 A 6.25 6.25 0 1 1 24.79 11.08"
        fill="none"
        stroke="#5b95ff"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <circle cx="24.56" cy="16" r="1.05" fill="#a9cdff" />
    </svg>
  );
}

/**
 * Battery meter. `level` is a real percentage or null — null renders an
 * empty shell with "—", never an invented charge.
 */
export function IconBattery({
  level,
  label,
  charging = false,
}: {
  level: number | null;
  label: string;
  charging?: boolean;
}) {
  const v = level ?? 0;
  const w = Math.max(0, Math.min(11, (v / 100) * 11));
  const fill = level === null ? '#2a3650' : v < 20 ? '#fb5a76' : charging ? '#f5a524' : '#3d7bff';
  return (
    <div className="flex flex-col items-center gap-0.5 text-[10px] text-mute">
      <span className="relative inline-flex items-center">
        <svg width="24" height="13" viewBox="0 0 24 13" aria-hidden>
          <rect x="0.6" y="1.1" width="19.4" height="10.8" rx="2.4" fill="none" stroke="#4a5a78" strokeWidth="1.2" />
          <rect x="20.6" y="4.2" width="2.2" height="4.6" rx="0.8" fill="#4a5a78" />
          <rect x="2.2" y="2.7" width={w} height="7.6" rx="1.2" fill={fill} />
        </svg>
        {charging && (
          <span className="absolute -right-1 -top-1.5 text-warn">
            <IconBolt size={11} />
          </span>
        )}
      </span>
      <span>
        {label} {level === null ? '—' : `${level}%`}
      </span>
    </div>
  );
}
