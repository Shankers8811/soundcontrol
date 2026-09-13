import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function S({ size = 22, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export function IconDevice(p: P) {
  return (
    <S {...p}>
      <path d="M5 10c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3.5" y="10" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14.5" y="10" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.8" />
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

export function IconHand(p: P) {
  return (
    <S {...p}>
      <path
        d="M8 11V7.5a1.5 1.5 0 1 1 3 0V11m0-5.5V6a1.5 1.5 0 1 1 3 0v5m0-3.5V8A1.5 1.5 0 1 1 17 9.5V13c0 3-1.2 6-5 6s-5-2.2-5-5.5V11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </S>
  );
}

export function IconMenu(p: P) {
  return (
    <S {...p}>
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconGear(p: P) {
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

export function IconBack(p: P) {
  return (
    <S {...p}>
      <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}

export function IconAnc(p: P) {
  return (
    <S {...p}>
      <path d="M4 12a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </S>
  );
}

export function IconNormal(p: P) {
  return (
    <S {...p}>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
    </S>
  );
}

export function IconTrans(p: P) {
  return (
    <S {...p}>
      <path
        d="M4 12h2.5M17.5 12H20M8 8c2.2-2 5.8-2 8 0M8 16c2.2 2 5.8 2 8 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </S>
  );
}

export function IconChevron(p: P) {
  return (
    <S size={18} {...p}>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconBattery({ level, label }: { level: number | null; label: string }) {
  const v = level ?? 0;
  const w = Math.max(0, Math.min(11, (v / 100) * 11));
  return (
    <div className="flex flex-col items-center gap-0.5 text-[10px] text-mute">
      <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
        <rect x="0.6" y="1.2" width="18.5" height="9.6" rx="2" fill="none" stroke="#8b919c" strokeWidth="1.2" />
        <rect x="19.6" y="4" width="1.8" height="4" rx="0.6" fill="#8b919c" />
        <rect x="2.2" y="2.8" width={w} height="6.4" rx="1" fill={level == null ? '#d5dbe4' : v < 20 ? '#e11d48' : '#2f6bff'} />
      </svg>
      <span>
        {label} {level == null ? '—' : `${level}%`}
      </span>
    </div>
  );
}

export function IconBt(p: P) {
  return (
    <S {...p}>
      <path d="M7 7l10 10-5 5V2l5 5L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
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

export function IconGame(p: P) {
  return (
    <S {...p}>
      <rect x="3" y="8" width="18" height="10" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 13h3M9.5 11.5v3M15.2 12.2h.1M17.4 14h.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </S>
  );
}

export function IconEar(p: P) {
  return (
    <S {...p}>
      <path
        d="M16 10c0-2.8-2-5-4.6-5S7 7.2 7 10c0 4 3 4.5 3 7.2 0 1.4 1 2.3 2.3 2.3 2 0 3-1.5 3-3.2 0-1.6-1-2.3-1-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </S>
  );
}

export function IconVolume(p: P) {
  return (
    <S {...p}>
      <path d="M4 10v4h3l4 3V7L7 10H4zM16 9c1.2 1 1.8 2.2 1.8 3s-.6 2-1.8 3M18.7 7c2 1.7 3 3.5 3 5s-1 3.3-3 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  );
}
