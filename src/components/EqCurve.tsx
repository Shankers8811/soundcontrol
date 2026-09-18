import { EQ_HZ } from '../types';

/**
 * The EQ curve graph — a smooth blue line over the real band values that are
 * sent to (or reported by) the device. Pure visualization of `bands`; it
 * never holds state of its own.
 */
export function EqCurve({ bands }: { bands: number[] }) {
  const w = 640;
  const h = 170;
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
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label="Equalizer curve">
      <defs>
        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d7bff" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#3d7bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[-6, -3, 0, 3, 6].map((g) => {
        const y = h / 2 - (g / 6) * (h / 2 - pad);
        return (
          <g key={g}>
            <line
              x1={pad}
              x2={w - pad}
              y1={y}
              y2={y}
              stroke={g === 0 ? 'rgba(147,160,180,0.22)' : 'rgba(147,160,180,0.10)'}
              strokeDasharray={g === 0 ? undefined : '3 5'}
            />
            <text x={2} y={y + 3} fill="#64718a" fontSize="9" fontFamily="IBM Plex Mono, monospace">
              {g > 0 ? `+${g}` : g}
            </text>
          </g>
        );
      })}
      {EQ_HZ.map((hz, i) => (
        <text
          key={hz}
          x={pts[i]?.[0]}
          y={h - 2}
          fill="#64718a"
          fontSize="9"
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
        >
          {hz >= 1000 ? `${hz / 1000}k` : hz}
        </text>
      ))}
      <path d={area} fill="url(#eqFill)" />
      <path d={d} fill="none" stroke="#3d7bff" strokeWidth="2.4" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <g key={EQ_HZ[i]}>
          <circle cx={x} cy={y} r="6" fill="#3d7bff" opacity="0.18" />
          <circle cx={x} cy={y} r="4" fill="#0a0e17" stroke="#6ea1ff" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
