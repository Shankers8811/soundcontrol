import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EQ_HZ, EQ_BAND_MIN, EQ_BAND_MAX, EQ_BAND_STEP } from '../../types';

interface EQSliderProps {
  bandIndex: number;
  value: number;
  onChange: (index: number, value: number) => void;
  disabled?: boolean;
  vertical?: boolean;
}

export const EQSlider = forwardRef<HTMLInputElement, EQSliderProps>(
  ({ bandIndex, value, onChange, disabled, vertical = true, ...props }, ref) => {
    const freq = EQ_HZ[bandIndex];
    const freqLabel = freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`;
    const percent = ((value - EQ_BAND_MIN) / (EQ_BAND_MAX - EQ_BAND_MIN)) * 100;
    
    const sliderStyle: React.CSSProperties = vertical
      ? { height: '120px', width: '20px' }
      : { width: '120px', height: '20px' };
    
    return (
      <div className={twMerge('flex flex-col items-center gap-1', vertical ? 'flex-col' : 'flex-row')}>
        <label htmlFor={`eq-band-${bandIndex}`} className="text-caption text-text-muted font-mono">
          {freqLabel}
        </label>
        <div className="relative" style={sliderStyle}>
          <input
            ref={ref}
            type="range"
            id={`eq-band-${bandIndex}`}
            min={EQ_BAND_MIN}
            max={EQ_BAND_MAX}
            step={EQ_BAND_STEP}
            value={value}
            onChange={(e) => onChange(bandIndex, parseFloat(e.target.value))}
            disabled={disabled}
            aria-label={`Band ${bandIndex + 1}: ${freqLabel}, ${value} dB`}
            aria-valuemin={EQ_BAND_MIN}
            aria-valuemax={EQ_BAND_MAX}
            aria-valuenow={value}
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            className={twMerge(
              'appearance-none bg-transparent w-full h-full cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              vertical ? 'rotate-180' : ''
            )}
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              background: 'transparent',
            }}
            {...props}
          />
          {/* Custom track */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div 
              className={twMerge(
                'bg-accent rounded-full transition-all duration-150',
                vertical 
                  ? 'w-1 h-full bottom-0' 
                  : 'h-1 w-full left-0'
              )}
              style={{
                [vertical ? 'height' : 'width']: `${percent}%`,
              }}
            />
          </div>
          {/* Track background */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div className={twMerge(
              'bg-border rounded-full',
              vertical ? 'w-1 h-full' : 'h-1 w-full'
            )} />
          </div>
          {/* Center line */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div className={twMerge(
              'bg-border/50',
              vertical ? 'w-px h-1/2 bottom-0' : 'h-px w-1/2 left-1/2'
            )} />
          </div>
        </div>
        <span className={twMerge('font-mono text-body-sm font-medium tabular-nums', value > 0 && 'text-accent', value < 0 && 'text-danger')}>
          {value > 0 ? '+' : ''}{value.toFixed(1)}
        </span>
      </div>
    );
  }
);

EQSlider.displayName = 'EQSlider';