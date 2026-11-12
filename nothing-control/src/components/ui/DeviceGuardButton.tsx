import { useState } from 'react';
import { 
  AlertTriangle, 
  Lock, 
  Info,
  HelpCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from './Button';

interface DeviceGuardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  feature: 'anc' | 'transparency' | 'adaptive' | 'wind' | 'in_ear' | 'game' | 'gestures' | 'eq_custom' | 'eq_factory' | 'bass' | 'find_buds' | 'ear_tip' | 'ldac' | 'multipoint' | 'wearing' | 'easy_chat' | 'auto_power' | 'ldac_codec' | 'case_battery';
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  featureName?: string;
}

export const DeviceGuardButton = ({ 
  feature, 
  label, 
  icon, 
  onClick, 
  featureName, 
  className, 
  disabled, 
  ...props 
}: DeviceGuardButtonProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const FEATURE_LABELS: Record<string, string> = {
    anc: 'Noise Cancelling (ANC)',
    transparency: 'Transparency Mode',
    adaptive: 'Adaptive ANC',
    wind: 'Wind Noise Reduction',
    in_ear: 'In-Ear Detection',
    game: 'Game Mode / Low Latency',
    gestures: 'Touch/Gesture Controls',
    eq_custom: 'Custom Equalizer',
    eq_factory: 'Factory EQ Presets',
    bass: 'Bass Enhance',
    find_buds: 'Find My Earbuds',
    ear_tip: 'Ear Tip Fit Test',
    ldac: 'LDAC High-Res Audio',
    multipoint: 'Multipoint Connection',
    wearing: 'Wear Detection',
    easy_chat: 'Easy Chat',
    auto_power: 'Auto Power Off',
    ldac_codec: 'LDAC Codec',
    case_battery: 'Case Battery',
  };

  const featureLabel = featureName || FEATURE_LABELS[feature] || feature;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          if (disabled) {
            setShowTooltip(true);
            setTimeout(() => setShowTooltip(false), 3000);
            return;
          }
          onClick?.();
        }}
        disabled={disabled}
        className={twMerge(
          'flex items-center justify-center gap-2 font-medium rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          disabled 
            ? 'bg-surface/50 text-text-muted border border-border/30 cursor-not-allowed opacity-60' 
            : 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover/90',
          className
        )}
        aria-disabled={disabled}
        aria-label={disabled ? `${label} - Not supported by your device` : label}
        {...props}
      >
        {icon}
        <span>{label}</span>
        {disabled && <Lock className="w-4 h-4" />}
      </button>

      {disabled && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-bg-elevated border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="font-medium">Feature Not Supported</span>
            </div>
            <p className="text-text-muted">
              Your device does not support <strong>{featureLabel}</strong>.
            </p>
            <button
              onClick={() => setShowTooltip(false)}
              className="mt-2 text-xs text-accent hover:underline"
            >
              Dismiss
            </button>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 -bottom-px w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-t-bg-elevated" />
        </div>
      )}
    </div>
  );
};

// Standalone tooltip-only version for non-button elements
export const FeatureInfoBadge = ({ 
  feature, 
  label, 
  featureName 
}: { 
  feature: DeviceGuardButtonProps['feature']; 
  label: string; 
  featureName?: string;
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const FEATURE_LABELS: Record<string, string> = {
    anc: 'Noise Cancelling (ANC)',
    transparency: 'Transparency Mode',
    adaptive: 'Adaptive ANC',
    wind: 'Wind Noise Reduction',
    in_ear: 'In-Ear Detection',
    game: 'Game Mode / Low Latency',
    gestures: 'Touch/Gesture Controls',
    eq_custom: 'Custom Equalizer',
    eq_factory: 'Factory EQ Presets',
    bass: 'Bass Enhance',
    find_buds: 'Find My Earbuds',
    ear_tip: 'Ear Tip Fit Test',
    ldac: 'LDAC High-Res Audio',
    multipoint: 'Multipoint Connection',
    wearing: 'Wear Detection',
    easy_chat: 'Easy Chat',
    auto_power: 'Auto Power Off',
    ldac_codec: 'LDAC Codec',
    case_battery: 'Case Battery',
  };

  const featureLabel = featureName || FEATURE_LABELS[feature] || feature;

  return (
    <div className="relative inline-flex items-center gap-1">
      <Info className="w-5 h-5 text-text-muted" />
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className="ml-1 text-text-muted hover:text-accent"
        aria-label={`More info about ${featureLabel}`}
      >
        <Info className="w-4 h-4" />
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-bg-elevated border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-5 h-5 text-accent" />
              <span className="font-medium">{featureLabel}</span>
            </div>
            <p className="text-text-muted text-sm">
              {feature === 'anc' ? 'Active Noise Cancellation' : 
               feature === 'transparency' ? 'Ambient/Transparency mode' :
               feature === 'adaptive' ? 'Adaptive ANC adjusts automatically based on environment' :
               feature === 'wind' ? 'Wind noise reduction during calls' :
               feature === 'in_ear' ? 'Auto-pause when earbuds are removed' :
               feature === 'game' ? 'Low latency mode for gaming' :
               feature === 'gestures' ? 'Custom touch/button controls' :
               feature === 'eq_custom' ? 'Custom 8-band equalizer' :
               feature === 'eq_factory' ? 'Factory EQ presets' :
               feature === 'bass' ? 'Bass enhancement' :
               feature === 'find_buds' ? 'Find my earbuds feature' :
               feature === 'ear_tip' ? 'Ear tip fit test' :
               feature === 'ldac' ? 'LDAC high-resolution audio' :
               feature === 'multipoint' ? 'Connect to multiple devices' :
               feature === 'wearing' ? 'Wear detection sensor' :
               feature === 'easy_chat' ? 'Easy chat mode' :
               feature === 'auto_power' ? 'Auto power off timer' :
               feature === 'ldac_codec' ? 'LDAC codec setting' :
               feature === 'case_battery' ? 'Case battery level display' :
               'Not supported by your device'}
            </p>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 -bottom-px w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-t-bg-elevated" />
        </div>
      )}
    </div>
  );
}; 