import React from 'react';

interface BatteryRingProps {
  level: number | null;
  label: string;
  charging?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const BatteryRing: React.FC<BatteryRingProps> = ({
  level,
  label,
  charging = false,
  size = 'md',
}) => {
  const sizes = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const getColor = (l: number | null) => {
    if (l === null) return 'text-gray-400';
    if (l < 20) return 'text-red-500';
    if (l < 50) return 'text-yellow-500';
    return 'text-soundcore-600';
  };

  const display = level === null ? '--' : `${level}%`;

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sizes[size]}`}>
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="42"
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            className="text-gray-200 dark:text-gray-700"
          />
          <circle
            cx="50%"
            cy="50%"
            r="42"
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            className={`${getColor(level)} transition-all duration-500`}
            strokeDasharray="264"
            strokeDashoffset={level === null ? 0 : 264 - (level / 100) * 264}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center h-full w-full">
          <span className={`text-sm font-bold ${getColor(level)}`}>{display}</span>
          {charging && <span className="text-xs text-soundcore-600">⚡</span>}
        </div>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</span>
    </div>
  );
};
