import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label className="relative inline-flex w-11 h-6 items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-full h-6 rounded-full bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-soundcore-500 dark:peer-focus:ring-soundcore-400 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-700 peer-checked:bg-soundcore-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"></div>
      </label>
      {label && <span className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{label}</span>}
    </div>
  );
};
