import { 
  Bluetooth, 
  Battery, 
  Volume2, 
  Equalizer, 
  Headphones, 
  Info,
  CheckCircle,
  X,
  Settings
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FeatureInfoBadge } from './DeviceGuardButton';

interface DeviceInfoCardProps {
  device: {
    mac: string;
    model_name: string;
    display_name: string;
    sku: string;
    category: string;
    icon: string;
    capabilities: {
      anc: boolean;
      transparency: boolean;
      adaptive_anc: boolean;
      wind_noise: boolean;
      in_ear_detection: boolean;
      low_latency: boolean;
      gestures: boolean;
      eq_custom: boolean;
      eq_factory: boolean;
      bass_enhance: boolean;
      find_buds: boolean;
      ear_tip_test: boolean;
      ldac: boolean;
      multipoint: boolean;
      wearing_detection: boolean;
      easy_chat: boolean;
      auto_power_off: boolean;
      ldac_codec: boolean;
      case_battery: boolean;
      anc_modes: string[];
    };
  };
}

const FEATURE_DISPLAY: Record<string, { label: string; icon: React.ReactNode }> = {
  anc: { label: 'ANC', icon: <Volume2 className="w-4 h-4" /> },
  transparency: { label: 'Transparency', icon: <Info className="w-4 h-4" /> },
  adaptive_anc: { label: 'Adaptive ANC', icon: <Info className="w-4 h-4" /> },
  wind_noise: { label: 'Wind Noise', icon: <Info className="w-4 h-4" /> },
  in_ear_detection: { label: 'In-Ear Detection', icon: <Info className="w-4 h-4" /> },
  low_latency: { label: 'Game Mode', icon: <Info className="w-4 h-4" /> },
  gestures: { label: 'Touch Controls', icon: <Info className="w-4 h-4" /> },
  eq_custom: { label: 'Custom EQ', icon: <Equalizer className="w-4 h-4" /> },
  eq_factory: { label: 'Factory EQ', icon: <Equalizer className="w-4 h-4" /> },
  bass_enhance: { label: 'Bass Enhance', icon: <Info className="w-4 h-4" /> },
  find_buds: { label: 'Find My Earbuds', icon: <Info className="w-4 h-4" /> },
  ear_tip_test: { label: 'Ear Tip Test', icon: <Info className="w-4 h-4" /> },
  ldac: { label: 'LDAC', icon: <Info className="w-4 h-4" /> },
  multipoint: { label: 'Multipoint', icon: <Info className="w-4 h-4" /> },
  wearing_detection: { label: 'Wear Detection', icon: <Info className="w-4 h-4" /> },
  easy_chat: { label: 'Easy Chat', icon: <Info className="w-4 h-4" /> },
  auto_power_off: { label: 'Auto Power Off', icon: <Info className="w-4 h-4" /> },
  ldac_codec: { label: 'LDAC Codec', icon: <Info className="w-4 h-4" /> },
  case_battery: { label: 'Case Battery', icon: <Battery className="w-4 h-4" /> },
};

export const DeviceInfoCard = ({ device }: DeviceInfoCardProps) => {
  const supportedFeatures = Object.entries(device.capabilities)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key);

  return (
    <div className="bg-bg-elevated border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
          <Bluetooth className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-text">{device.display_name}</h3>
          <p className="text-sm text-text-muted">{device.model_name}</p>
          <p className="text-xs text-text-muted mt-1">SKU: {device.sku} &bull; {device.category}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-md bg-surface/50 text-text-muted text-xs">
            Connected
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h4 className="font-medium text-text">Supported Features</h4>
            <p className="text-xs text-text-muted">{supportedFeatures.length} of 19 features available</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FEATURE_DISPLAY.map(({ label, icon }) => {
            const isSupported = Object.keys(device.capabilities).some(
              key => 
                device.capabilities[key as keyof typeof device.capabilities] === true &&
                FEATURE_DISPLAY[key as keyof typeof FEATURE_DISPLAY]?.label === label
            );
            return (
              <span key={label} className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
                isSupported 
                  ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                  : 'bg-surface/50 text-text-muted border border-border/30'
              )}
            >
              {isSupported ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}; 