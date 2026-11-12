import { useEffect, useState } from 'react';
import { 
  Volume2, 
  Mic, 
  Cpu, 
  Wind, 
  MapPin,
  VolumeX,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ANC_MODES, TRANSPARENCY_MODES } from '../../types';
import { useDevicesStore } from '../../stores/devices';
import { useUIStore } from '../../stores/ui';
import { Card } from '../components/ui/Card';
import { ModePill } from '../components/ui/ModePill';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { BatteryRing } from '../components/ui/BatteryRing';
import { Button } from '../components/ui/Button';

export const NoiseControlPage = () => {
  const { activeDevice, activeSession, setAncMode, setTransparencyMode } = useDevicesStore();
  const { showError, showInfo, showWarning } = useUIStore();
  const [transparencyMode, setTransparencyModeState] = useState<'full' | 'vocal'>('full');
  const [windNoiseEnabled, setWindNoiseEnabled] = useState(false);
  const [adaptiveAncEnabled, setAdaptiveAncEnabled] = useState(false);
  
  if (!activeDevice || !activeSession) {
    return (
      <div className="space-y-6">
        <h1 className="text-h1 font-bold">Noise Control</h1>
        <Card className="p-8 text-center">
          <VolumeX className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">No Device Connected</h3>
          <p className="text-text-muted">Connect a Soundcore device to control noise cancellation</p>
        </Card>
      </div>
    );
  }
  
  const profile = activeSession?.profile;
  const hasANC = profile?.supports_anc ?? false;
  const hasTransparency = profile?.supports_transparency ?? false;
  const hasAdaptive = profile?.supports_adaptive_anc ?? false;
  const hasWindNoise = profile?.supports_wind_noise ?? false;
  const transparencyModes = profile?.transparency_modes ?? [];
  
  const handleAncChange = (mode: 'off' | 'anc' | 'transparency' | 'adaptive' | 'wind' | 'scene') => {
    if (!activeDevice) return;
    setAncMode(activeDevice.mac, mode);
  };
  
  const handleTransparencyChange = (mode: 'full' | 'vocal') => {
    if (!activeDevice) return;
    setTransparencyModeState(mode);
    setTransparencyMode(activeDevice.mac, mode);
  };
  
  const handleWindNoiseToggle = (enabled: boolean) => {
    setWindNoiseEnabled(enabled);
    showInfo('Wind Noise', enabled ? 'Wind noise reduction enabled' : 'Wind noise reduction disabled');
  };
  
  const handleAdaptiveToggle = (enabled: boolean) => {
    setAdaptiveAncEnabled(enabled);
    showInfo('Adaptive ANC', enabled ? 'Adaptive ANC enabled' : 'Adaptive ANC disabled');
  };
  
  if (!hasANC) {
    return (
      <div className="space-y-6">
        <h1 className="text-h1 font-bold">Noise Control</h1>
        <Card className="p-8 text-center">
          <VolumeX className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">Noise Control Not Available</h3>
          <p className="text-text-muted max-w-md mx-auto">
            This device ({profile?.display_name || 'unknown'}) does not support ANC or transparency modes.
          </p>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h1 font-bold">Noise Control</h1>
          <p className="text-text-muted mt-1">{activeDevice.name || activeDevice.mac}</p>
        </div>
        <div className="flex items-center gap-2">
          <BatteryRing 
            percent={activeDevice.battery?.leftPct ?? null} 
            charging={activeDevice.battery?.leftCharging ?? false}
            size="sm" 
            label="L"
          />
          <BatteryRing 
            percent={activeDevice.battery?.rightPct ?? null} 
            charging={activeDevice.battery?.rightCharging ?? false}
            size="sm" 
            label="R"
          />
          {activeDevice.battery?.casePct !== null && (
            <BatteryRing 
              percent={activeDevice.battery?.casePct ?? null} 
              charging={activeDevice.battery?.caseCharging ?? false}
              size="sm" 
              label="Case"
            />
          )}
        </div>
      </div>
      
      {/* Main ANC Modes */}
      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-h3 font-medium">Noise Control</h2>
          <p className="text-text-muted text-sm">Select your preferred noise control mode</p>
        </div>
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ANC_MODES
              .filter(m => {
                if (m.value === 'scene' && !profile?.transparency_modes?.length) return false;
                if (m.value === 'wind' && !hasWindNoise) return false;
                if (m.value === 'adaptive' && !hasAdaptive) return false;
                return true;
              })
              .map((mode) => (
                <ModePill
                  key={mode.value}
                  mode={mode.value}
                  active={activeDevice.anc_mode === mode.value}
                  disabled={!hasANC}
                  onClick={() => handleAncChange(mode.value)}
                >
                  {mode.icon}
                  <span>{mode.label}</span>
                </ModePill>
              ))}
          </div>
        </div>
      </Card>
      
      {/* Transparency sub-modes */}
      {hasTransparency && (
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-h3 font-medium">Transparency Mode</h2>
            <p className="text-text-muted text-sm">Choose transparency style when in Transparency mode</p>
          </div>
          <div className="p-4">
            <div className="flex gap-3">
              {TRANSPARENCY_MODES.map((mode) => (
                <ModePill
                  key={mode.value}
                  mode={`transparency-${mode.value}` as any}
                  active={activeDevice.transparency_mode === mode.value && activeDevice.anc_mode === 'transparency'}
                  disabled={activeDevice.anc_mode !== 'transparency'}
                  onClick={() => handleTransparencyChange(mode.value)}
                >
                  <span>{mode.label}</span>
                </ModePill>
              ))}
            </div>
          </div>
        </Card>
      )}
      
      {/* Adaptive ANC settings */}
      {hasAdaptive && activeDevice.anc_mode === 'adaptive' && (
        <Card>
          <div className="p-4 border-b border-border">
            <h2 className="text-h3 font-medium">Adaptive ANC Settings</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Wind Noise Reduction</h3>
                <p className="text-text-muted text-sm">Automatically reduce wind noise during calls</p>
              </div>
              <ToggleSwitch
                checked={windNoiseEnabled}
                onChange={handleWindNoiseToggle}
                label="Wind Noise Reduction"
                subLabel={windNoiseEnabled ? 'Enabled' : 'Disabled'}
              />
            </div>
          </div>
        </Card>
      )}
      
      {/* Wind Noise (standalone) */}
      {hasWindNoise && !hasAdaptive && (
        <Card>
          <div className="p-4 border-b border-border">
            <h2 className="text-h3 font-medium">Wind Noise Reduction</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Wind Noise Reduction</h3>
                <p className="text-text-muted text-sm">Reduce wind noise during outdoor activities</p>
              </div>
              <ToggleSwitch
                checked={windNoiseEnabled}
                onChange={handleWindNoiseToggle}
                label="Enabled"
              />
            </div>
          </div>
        </Card>
      )}
      
      {/* Scene modes */}
      {profile?.transparency_modes?.length && profile.transparency_modes.length > 1 && (
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-h3 font-medium">ANC Scenes</h2>
            <p className="text-text-muted text-sm">Select scene-specific ANC mode</p>
          </div>
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.transparency_modes.map((scene) => (
                <ModePill
                  key={scene}
                  mode={scene}
                  active={activeDevice.anc_mode === scene}
                  disabled={!hasANC}
                  onClick={() => handleAncChange(scene)}
                >
                  <span>{scene.charAt(0).toUpperCase() + scene.slice(1)}</span>
                </ModePill>
              ))}
            </div>
          </div>
        </Card>
      )}
      
      {/* Info card for unsupported devices */}
      {!hasANC && (
        <Card className="p-8 text-center">
          <VolumeX className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">Noise Control Not Available</h3>
          <p className="text-text-muted max-w-md mx-auto">
            This device ({profile?.display_name || 'unknown'}) does not support ANC or transparency modes.
          </p>
        </Card>
      )}
    </div>
  );
};

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}