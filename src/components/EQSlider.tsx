import React from 'react';

interface EQSliderProps {
  band: number;
  gain: number;
  onChange: (gain: number) => void;
  disabled?: boolean;
}

export const EQSlider: React.FC<EQSliderProps> = ({
  band,
  gain,
  onChange,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{band + 1}</span>
      <div className="relative w-12 h-24">
        <input
          type="range"
          min="-12"
          max="12"
          value={gain}
          onChange={handleChange}
          disabled={disabled}
          className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-soundcore-600"
          style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <span className={`text-xs font-bold ${gain >= 0 ? 'text-soundcore-600' : 'text-red-500'}`}>{gain > 0 ? `+${gain}` : gain}</span>
        </div>
      </div>
    </div>
  );
};