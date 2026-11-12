import { useEffect, useState } from 'react';
import { 
  Volume2, 
  Mic, 
  Cpu, 
  Wind, 
  MapPin,
  VolumeX
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ANC_MODES, TRANSPARENCY_MODES } from '../types';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/ui/Card';
import { ModePill } from '../components/ui/ModePill';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { BatteryRing } from '../components/ui/BatteryRing';

const ANC_ICONS: Record<string, React.ReactNode> = {
  off: <VolumeX className="w-4 h-4" />,
  anc: <Volume2 className="w-4 h-4" />,
  transparency: <Mic className="w-4 h-4" />,
  adaptive: <Cpu className="w-4 h-4" />,
  wind: <Wind className="w-4 h-4" />,
  scene: <MapPin className="w-4 h-4" />,
};

export const NoiseControlPage = () => {
  const { activeDevice, activeSession, setAncMode, setTransparencyMode } = useDevicesStore();
  const { showError } = useUIStore();
  const [transparencyMode, setTransparencyModeState] = useState<'full' | 'vocal'>('full');
  
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
  
  const profile = activeSession.profile;
  const hasANC = profile?.ancLevels && profile.ancLevels > 0;
  
  const handleAncChange = (mode: ANC_MODES[number]['value']) => {
    if (!activeDevice) return;
    setAncMode(activeDevice.mac, mode);
  };
  
  const handleTransparencyChange = (mode: 'full' | 'vocal') => {
    if (!activeDevice) return;
    setTransparencyModeState(mode);
    setTransparencyMode(activeDevice.mac, mode);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-bold">Noise Control</h1>
          <p className="text-text-muted mt-1">{activeDevice.name || activeDevice.mac}</p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>
      
      {!hasANC ? (
        <Card className="p-8 text-center">
          <VolumeX className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">Noise Control Not Available</h3>
          <p className="text-text-muted">
            This device ({profile?.marketingNames.join(', ') || 'unknown'}) does not support ANC or transparency modes.
          </p>
        </Card>
      ) : (
        <>
          {/* Main ANC Modes */}
          <Card>
            <div className="p-4 border-b border-border">
              <h2 className="text-h3 font-medium">Noise Control</h2>
              <p className="text-text-muted text-sm mt-1">Select your preferred noise control mode</p>
            </div>
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ANC_MODES
                  .filter(m => {
                    if (m.value === 'scene' && !profile?.transparencyModes?.length) return false;
                    if (m.value === 'wind' && !profile?.hasWindNoise) return false;
                    if (m.value === 'adaptive' && !profile?.hasWindNoise) return false; // adaptive often paired with wind
                    return true;
                  })
                  .map((mode) => (
                    <ModePill
                      key={mode.value}
                      mode={mode.value}
                      active={activeDevice.ancMode === mode.value}
                      disabled={!hasANC}
                      onClick={() => handleAncChange(mode.value)}
                    >
                      {ANC_ICONS[mode.value]}
                      <span>{mode.label}</span>
                    </ModePill>
                  ))}
              </div>
            </div>
          </Card>
          
          {/* Transparency sub-modes */}
          {profile?.transparencyModes?.length && (
            <Card>
              <div className="p-4 border-b border-border">
                <h2 className="text-h3 font-medium">Transparency Mode</h2>
                <p className="text-text-muted text-sm mt-1">Choose transparency style when in Transparency mode</p>
              </div>
              <div className="p-4">
                <div className="flex gap-3">
                  {TRANSPARENCY_MODES.map((mode) => (
                    <ModePill
                      key={mode.value}
                      mode={`transparency-${mode.value}` as any}
                      active={activeDevice.transparencyMode === mode.value && activeDevice.ancMode === 'transparency'}
                      disabled={activeDevice.ancMode !== 'transparency'}
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
          {profile?.hasWindNoise && activeDevice.ancMode === 'adaptive' && (
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
                    checked={true} // Would come from device state
                    onChange={() => {}}
                    subLabel="Enabled"
                  />
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};