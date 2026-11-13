import React from 'react';

interface ModePillProps {
  mode: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const ModePill: React.FC<ModePillProps> = ({
  mode,
  active,
  onClick,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${active ? 'bg-soundcore-600 text-white shadow-soundcore-600/20' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'}`}
    >
      {mode}
    </button>
  );
};
