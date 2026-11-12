import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ToggleSwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  subLabel?: string;
  loading?: boolean;
}

export const ToggleSwitch = forwardRef<HTMLInputElement, ToggleSwitchProps>(
  ({ className, label, subLabel, loading, disabled, checked, onChange, id, ...props }, ref) => {
    const inputId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;
    
    return (
      <label className={twMerge('inline-flex items-start gap-3 cursor-pointer select-none', className)}>
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            id={inputId}
            className="sr-only peer"
            checked={checked}
            onChange={onChange}
            disabled={disabled || loading}
            aria-checked={checked}
            aria-disabled={disabled || loading}
            {...props}
          />
          <div className={twMerge(
            'relative w-11 h-6 rounded-full border-2 transition-all duration-150 ease-out',
            'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
            'after:content-[""] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-text after:shadow-sm after:transition-transform after:duration-150',
            'peer-checked:after:translate-x-5',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-checked:hover:bg-accent-hover',
            'peer-unchecked:bg-surface peer-unchecked:border-border-input',
            'peer-unchecked:hover:border-accent/50',
            loading && 'opacity-75 cursor-wait'
          )} aria-hidden="true" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="animate-spin h-4 w-4 text-text-muted" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
        </div>
        {(label || subLabel) && (
          <div className="flex flex-col leading-tight min-w-0">
            {label && (
              <span className={twMerge(
                'font-medium text-text truncate',
                disabled && 'opacity-50'
              )}>
                {label}
              </span>
            )}
            {subLabel && (
              <span className={twMerge(
                'text-body-sm text-text-muted truncate',
                disabled && 'opacity-50'
              )}>
                {subLabel}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

ToggleSwitch.displayName = 'ToggleSwitch';