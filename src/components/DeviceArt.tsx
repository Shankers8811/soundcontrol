/**
 * Original SoundControl device illustrations — purely visual, never
 * interactive (PART O). Colors follow the dark-navy/blue-accent theme; the
 * `live` state lights the accent instead of implying any data.
 */

export function EarbudsArt({ live = false }: { live?: boolean }) {
  const accent = live ? '#3d7bff' : '#39435a';
  return (
    <svg viewBox="0 0 280 180" className="h-auto w-full" aria-hidden>
      <defs>
        <radialGradient id="eb-glow" cx="50%" cy="40%">
          <stop offset="0%" stopColor={accent} stopOpacity={live ? 0.3 : 0.12} />
          <stop offset="100%" stopColor="#0a0e17" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="140" cy="96" rx="112" ry="52" fill="url(#eb-glow)" />
      {live && (
        <g opacity="0.4" stroke={accent} fill="none">
          <ellipse cx="140" cy="96" rx="78" ry="34">
            <animate attributeName="rx" values="70;88;70" dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.45;0.12;0.45" dur="3.2s" repeatCount="indefinite" />
          </ellipse>
        </g>
      )}
      <Bud x={78} flip={false} live={live} accent={accent} />
      <Bud x={202} flip live={live} accent={accent} />
    </svg>
  );
}

function Bud({ x, flip, live, accent }: { x: number; flip: boolean; live: boolean; accent: string }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} 88) scale(${s} 1)`}>
      <rect x="-22" y="-48" width="44" height="62" rx="20" fill="#1a2338" stroke="rgba(233,238,247,0.10)" />
      <rect x="-16" y="-42" width="32" height="36" rx="14" fill="#0e1422" />
      <circle cx="0" cy="-24" r="5" fill={accent} opacity={live ? 1 : 0.5} />
      <path d="M-10 12 C-10 38 10 48 10 58" stroke="#253150" strokeWidth="10" fill="none" strokeLinecap="round" />
      <ellipse cx="10" cy="62" rx="11" ry="8" fill="#141b2d" stroke="rgba(233,238,247,0.08)" />
    </g>
  );
}

export function OverEarArt({ live = false }: { live?: boolean }) {
  const accent = live ? '#3d7bff' : '#39435a';
  return (
    <svg viewBox="0 0 280 180" className="h-auto w-full" aria-hidden>
      <defs>
        <radialGradient id="oe-glow" cx="50%" cy="40%">
          <stop offset="0%" stopColor={accent} stopOpacity={live ? 0.28 : 0.1} />
          <stop offset="100%" stopColor="#0a0e17" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="140" cy="100" rx="120" ry="48" fill="url(#oe-glow)" />
      <path d="M70 88 C70 28 210 28 210 88" fill="none" stroke="#253150" strokeWidth="14" strokeLinecap="round" />
      <path d="M78 86 C90 48 190 48 202 86" fill="none" stroke="#1a2338" strokeWidth="8" />
      <Cup x={68} live={live} accent={accent} />
      <Cup x={212} live={live} accent={accent} />
    </svg>
  );
}

function Cup({ x, live, accent }: { x: number; live: boolean; accent: string }) {
  return (
    <g transform={`translate(${x} 108)`}>
      <rect x="-28" y="-38" width="56" height="72" rx="18" fill="#1a2338" stroke="rgba(233,238,247,0.10)" />
      <rect x="-20" y="-28" width="40" height="52" rx="14" fill="#0e1422" />
      <circle cx="0" cy="-2" r="8" fill={accent} opacity={live ? 0.9 : 0.4} />
    </g>
  );
}
