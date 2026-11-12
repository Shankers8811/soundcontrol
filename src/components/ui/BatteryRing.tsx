import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BatteryRingProps {
  percent: number | null;
  charging?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  ariaLabel?: string;
}

const sizes = {
  sm: { size: 40, stroke: 4, fontSize: 'text-xs' },
  md: { size: 56, stroke: 5, fontSize: 'text-sm' },
  lg: { size: 80, stroke: 6, fontSize: 'text-base' },
};

export const BatteryRing = ({ percent, charging = false, size = 'md', label, ariaLabel }: BatteryRingProps) => {
  const { size: ringSize, stroke, fontSize } = sizes[size];
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (percent || 0) / 100);
  
  // Determine color based on state
  const getColor = () => {
    if (percent === null) return 'text-text-muted';
    if (charging) return 'text-warning';
    if (percent <= 10) return 'text-danger';
    if (percent <= 20) return 'text-warning';
    return 'text-success';
  };
  
  const color = getColor();
  
  return (
    <div className="inline-flex flex-col items-center gap-1" role="img" aria-label={ariaLabel || `Battery: ${percent ?? 'unknown'}%${charging ? ', charging' : ''}`}>
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} className="transform -rotate-90" aria-hidden="true">
          {/* Background track */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-border"
          />
          {/* Progress */}
          {percent !== null && (
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={twMerge(color, charging && 'animate-pulse-soft')}
              style={{ transition: 'stroke-dashoffset 0.3s ease-out, stroke 0.3s ease-out' }}
            />
          )}
          {/* Unknown state - dashed */}
          {percent === null && (
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeDasharray={`${circumference / 8} ${circumference / 8}`}
              className="text-text-muted"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={twMerge(fontSize, 'font-medium', color)}>
            {percent !== null ? `${percent}%` : '?'}
          </span>
        </div>
        {charging && percent !== null && (
          <div className="absolute -top-1 -right-1">
            <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        )}
      </div>
      {label && <span className="text-caption text-text-muted">{label}</span>}
    </div>
  );
};