import { EQ_HZ } from '../types';

export function EqCurve({ bands }: { bands: number[] }) {
  const w = 640;
  const h = 160;
  const pad = 18;
  const pts = bands.map((db, i) => {
    const x = pad + (i / (bands.length - 1)) * (w - pad * 2);
    const y = h / 2 - (db / 6) * (h / 2 - pad);
    return [x, y] as const;
  });
  const d = pts
    .map(([x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      const [px] = pts[i - 1];
      const cpx = (px + x) / 2;
      return `C ${cpx} ${pts[i - 1][1]}, ${cpx} ${y}, ${x} ${y}`;
    })
    .join(' ');
  const area = `${d} L ${pts[pts.length - 1][0]} ${h - 8} L ${pts[0][0]} ${h - 8} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
      <defs>
        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[-6, -3, 0, 3, 6].map((g) => {
        const y = h / 2 - (g / 6) * (h / 2 - pad);
        return (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(28,30,36,0.08)" />
            <text x={4} y={y + 3} fill="#8b909c" fontSize="9" fontFamily="IBM Plex Mono, monospace">
              {g > 0 ? `+${g}` : g}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#eqFill)" />
      <path d={d} fill="none" stroke="#ff8a3d" strokeWidth="2.2" />
      {pts.map(([x, y], i) => (
        <g key={EQ_HZ[i]}>
          <circle cx={x} cy={y} r="4.5" fill="#07080c" stroke="#ff6a1a" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
