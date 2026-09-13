export function EarbudsArt({ live = false }: { live?: boolean }) {
  return (
    <svg viewBox="0 0 280 180" className="w-full h-auto" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="50%" cy="40%">
          <stop offset="0%" stopColor={live ? '#ff6a1a' : '#3ee0c5'} stopOpacity="0.45" />
          <stop offset="100%" stopColor="#07080c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="140" cy="96" rx="110" ry="50" fill="url(#glow)" />
      {live && (
        <g opacity="0.45" stroke="#ff6a1a" fill="none">
          <ellipse cx="140" cy="96" rx="78" ry="34">
            <animate attributeName="rx" values="70;88;70" dur="2.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2.8s" repeatCount="indefinite" />
          </ellipse>
        </g>
      )}
      <Bud x={78} flip={false} live={live} />
      <Bud x={202} flip live={live} />
    </svg>
  );
}

function Bud({ x, flip, live }: { x: number; flip: boolean; live: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} 88) scale(${s} 1)`}>
      <rect x="-22" y="-48" width="44" height="62" rx="20" fill="#1b1f2a" stroke="rgba(255,255,255,0.14)" />
      <rect x="-16" y="-42" width="32" height="36" rx="14" fill="#0e1118" />
      <circle cx="0" cy="-24" r="5" fill={live ? '#ff6a1a' : '#3ee0c5'} />
      <path d="M-10 12 C-10 38 10 48 10 58" stroke="#2a3140" strokeWidth="10" fill="none" strokeLinecap="round" />
      <ellipse cx="10" cy="62" rx="11" ry="8" fill="#151922" stroke="rgba(255,255,255,0.1)" />
    </g>
  );
}

export function OverEarArt({ live = false }: { live?: boolean }) {
  return (
    <svg viewBox="0 0 280 180" className="w-full h-auto" aria-hidden>
      <defs>
        <radialGradient id="og" cx="50%" cy="40%">
          <stop offset="0%" stopColor={live ? '#ff6a1a' : '#3ee0c5'} stopOpacity="0.4" />
          <stop offset="100%" stopColor="#07080c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="140" cy="100" rx="120" ry="48" fill="url(#og)" />
      <path
        d="M70 88 C70 28 210 28 210 88"
        fill="none"
        stroke="#2a3140"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path d="M78 86 C90 48 190 48 202 86" fill="none" stroke="#1a1e28" strokeWidth="8" />
      <Cup x={68} live={live} />
      <Cup x={212} live={live} />
    </svg>
  );
}

function Cup({ x, live }: { x: number; live: boolean }) {
  return (
    <g transform={`translate(${x} 108)`}>
      <rect x="-28" y="-38" width="56" height="72" rx="18" fill="#1b1f2a" stroke="rgba(255,255,255,0.12)" />
      <rect x="-20" y="-28" width="40" height="52" rx="14" fill="#0c0e14" />
      <circle cx="0" cy="-2" r="8" fill={live ? '#ff6a1a' : '#3ee0c5'} opacity="0.85" />
    </g>
  );
}
