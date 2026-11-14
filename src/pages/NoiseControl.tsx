import React, { useEffect, useState } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ModePill } from '../components/ModePill';
import { DeviceGuardButton } from '../components/DeviceGuardButton';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import {
  Wind, Volume2, Smartphone,
  Ear, ShieldAlert, AlertTriangle, RefreshCw, EarOff
} from 'lucide-react';
import { getDeviceInfo, setAncMode, setTransparency, setAdaptiveNoise, setWindNoise, setGameMode, setLDAC } from '../api/tauri';
import type { DeviceFeatures } from '../types';

export const NoiseControlPage: React.FC = () => {
  const { connectedDevice, refreshBattery } = useDevicesStore();
  const { showToast } = useUIStore();
  const [features, setFeatures] = useState<DeviceFeatures | null>(null);
  const [ancMode, setAncModeState] = useState('off');
  const [transparency, setTransparencyState] = useState(false);
  const [adaptive, setAdaptiveState] = useState(false);
  const [windNoise, setWindNoiseState] = useState(false);
  const [gameMode, setGameModeState] = useState(false);
  const [ldac, setLDACState] = useState(false);

  const device = connectedDevice;

  useEffect(() => {
    if (device?.address) {
      loadDeviceInfo();
    }
  }, [device?.address]);

  const loadDeviceInfo = async () => {
    if (!device?.address) return;
    try {
      const info = await getDeviceInfo(device.address);
      setFeatures(info.features);
    } catch (e) {
      showToast('Failed to load device info', 'error');
    }
  };

  const handleAncChange = async (mode: string) => {
    if (!device?.address) return;
    if (!features?.anc) {
      showToast('Your device does not support ANC', 'error');
      return;
    }
    try {
      setAncModeState(mode);
      await setAncMode(device.address, mode);
      showToast(`ANC mode set to ${mode}`, 'success');
    } catch (e) {
      showToast('Failed to set ANC mode', 'error');
    }
  };

  const handleToggle = async (feature: 'transparency' | 'adaptive' | 'wind_noise' | 'game_mode' | 'ldac', enabled: boolean) => {
    if (!device?.address) return;
    const featureMap: Record<string, keyof DeviceFeatures> = {
      transparency: 'transparency',
      adaptive: 'adaptive',
      wind_noise: 'wind_noise',
      game_mode: 'game_mode',
      ldac: 'ldac',
    };

    if (!features?.[featureMap[feature]]) {
      showToast(`Your device does not support ${feature.replace('_', ' ')}`, 'error');
      return;
    }

    try {
      switch (feature) {
        case 'transparency':
          setTransparencyState(enabled);
          await setTransparency(device.address, enabled);
          break;
        case 'adaptive':
          setAdaptiveState(enabled);
          await setAdaptiveNoise(device.address, enabled);
          break;
        case 'wind_noise':
          setWindNoiseState(enabled);
          await setWindNoise(device.address, enabled);
          break;
        case 'game_mode':
          setGameModeState(enabled);
          await setGameMode(device.address, enabled);
          break;
        case 'ldac':
          setLDACState(enabled);
          await setLDAC(device.address, enabled);
          break;
      }
      showToast(`${feature.replace('_', ' ')} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (e) {
      showToast(`Failed to ${enabled ? 'enable' : 'disable'} ${feature.replace('_', ' ')}`, 'error');
    }
  };

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold">No device selected</h3>
        <p className="text-gray-500 dark:text-gray-400">Please connect a Soundcore device first</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Noise Control</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage ANC, transparency, and audio modes</p>
        </div>
      </div>

      <DeviceInfoCard
        name={device.name}
        model={device.profile?.model || 'Unknown'}
        address={device.address}
        connected={device.connected}
        batteryCount={device.profile?.battery_count || 3}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">ANC Mode</h3>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {features?.anc ? 'Supported' : 'Not Supported'}
              </span>
            </div>

            {features?.anc ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['off', 'low', 'mid', 'high', 'adaptive'].map((mode) => (
                  <ModePill
                    key={mode}
                    mode={mode.charAt(0).toUpperCase() + mode.slice(1)}
                    active={ancMode === mode}
                    onClick={() => handleAncChange(mode)}
                    disabled={!features?.anc || mode === 'adaptive' && !features?.adaptive}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <EarOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Your device does not support ANC</p>
              </div>
            )}
          </Card>

          <Card padding="md" className="mt-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Transparency & Adaptive</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Transparency Mode</p>
                    <p className="text-xs text-gray-500">Hear your surroundings</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={transparency}
                  onChange={(checked) => handleToggle('transparency', checked)}
                  disabled={!features?.transparency}
                />
              </div>
              {features?.transparency === false && (
                <span className="text-xs text-gray-400">Not supported</span>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wind className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Wind Noise Reduction</p>
                    <p className="text-xs text-gray-500">Reduce wind noise outdoors</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={windNoise}
                  onChange={(checked) => handleToggle('wind_noise', checked)}
                  disabled={!features?.wind_noise}
                />
              </div>
              {features?.wind_noise === false && (
                <span className="text-xs text-gray-400">Not supported</span>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Adaptive Noise</p>
                    <p className="text-xs text-gray-500">Automatically adjust to environment</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={adaptive}
                  onChange={(checked) => handleToggle('adaptive', checked)}
                  disabled={!features?.adaptive}
                />
              </div>
              {features?.adaptive === false && (
                <span className="text-xs text-gray-400">Not supported</span>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Quick Modes</h3>
            <div className="space-y-3">
              <DeviceGuardButton
                feature="Game Mode"
                supported={features?.game_mode ?? false}
                deviceName={device.name}
                onClick={() => handleToggle('game_mode', !gameMode)}
              >
                {gameMode ? 'Disable' : 'Enable'} Game Mode
              </DeviceGuardButton>

              <DeviceGuardButton
                feature="LDAC"
                supported={features?.ldac ?? false}
                deviceName={device.name}
                onClick={() => handleToggle('ldac', !ldac)}
              >
                {ldac ? 'Disable' : 'Enable'} LDAC
              </DeviceGuardButton>

              <Button variant="outline" onClick={() => refreshBattery(device.address)}>
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh Battery
              </Button>
            </div>
          </Card>

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Feature Support</h3>
            <div className="space-y-2">
              {[
                { key: 'anc', label: 'ANC', value: features?.anc },
                { key: 'transparency', label: 'Transparency', value: features?.transparency },
                { key: 'adaptive', label: 'Adaptive', value: features?.adaptive },
                { key: 'wind_noise', label: 'Wind Noise', value: features?.wind_noise },
                { key: 'game_mode', label: 'Game Mode', value: features?.game_mode },
                { key: 'ldac', label: 'LDAC', value: features?.ldac },
              ].map((f) => (
                <div key={f.key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{f.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.value ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                    {f.value ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};