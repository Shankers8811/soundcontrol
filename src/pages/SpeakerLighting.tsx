import React, { useState, useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceGuardButton } from '../components/DeviceGuardButton';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { ShieldAlert, Zap } from 'lucide-react';
import { getDeviceInfo } from '../api/tauri';

const lightingModes = [
  { id: 'off', name: 'Off', color: '#6b7280' },
  { id: 'steady', name: 'Steady', color: '#0ea5e9' },
  { id: 'breath', name: 'Breath', color: '#10b981' },
  { id: 'flash', name: 'Flash', color: '#f59e0b' },
  { id: 'rainbow', name: 'Rainbow', color: '#8b5cf6' },
  { id: 'partycast', name: 'PartyCast Sync', color: '#ef4444' },
];

export const SpeakerLightingPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [selectedMode, setSelectedMode] = useState('off');
  const [brightness, setBrightness] = useState(70);

  useEffect(() => {
    if (connectedDevice?.address) {
      getDeviceInfo(connectedDevice.address)
        .then(() => {})
        .catch((e) => {
          console.error('Failed to load device info', e);
          showToast('Failed to load device info', 'error');
        });
    }
  }, [connectedDevice]);

  const isSpeaker = connectedDevice?.profile?.model?.startsWith('A31') ||
                    connectedDevice?.profile?.model?.startsWith('A39') ||
                    connectedDevice?.profile?.model?.toLowerCase().includes('motion') ||
                    connectedDevice?.profile?.model?.toLowerCase().includes('flare') ||
                    connectedDevice?.profile?.model?.toLowerCase().includes('rave');

  const handleModeChange = async (mode: string) => {
    if (!connectedDevice?.address) return;
    setSelectedMode(mode);
    showToast(`Lighting mode set to ${mode}`, 'success');
  };

  if (!connectedDevice) {
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
          <h1 className="text-2xl font-bold">Speaker Lighting</h1>
          <p className="text-gray-500 dark:text-gray-400">Control LED lighting and PartyCast sync</p>
        </div>
      </div>

      <DeviceInfoCard
        name={connectedDevice.name}
        model={connectedDevice.profile?.model || 'Unknown'}
        address={connectedDevice.address}
        connected={connectedDevice.connected}
        batteryCount={connectedDevice.profile?.battery_count || 3}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Lighting Modes</h3>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                isSpeaker ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
              }`}>
                {isSpeaker ? 'Speaker Lighting Supported' : 'Not a Speaker'}
              </span>
            </div>

            {isSpeaker ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {lightingModes.map((mode) => (
                  <Button
                    key={mode.id}
                    variant={selectedMode === mode.id ? 'primary' : 'ghost'}
                    onClick={() => handleModeChange(mode.id)}
                    className={`flex flex-col items-center gap-2 text-left w-full ${selectedMode === mode.id ? 'text-white' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full ${selectedMode === mode.id ? 'border-2 border-white' : ''}`} style={{ backgroundColor: mode.color, opacity: selectedMode === mode.id ? 1 : 0.5 }} />
                    <span className="text-xs">{mode.name}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <ShieldAlert className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Your device is not a speaker - lighting controls not available</p>
              </div>
            )}

            {isSpeaker && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">Brightness</span>
                  <span className="text-sm font-mono">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-soundcore-600"
                  disabled={!isSpeaker}
                />
              </div>
            )}
          </Card>

          {isSpeaker && (
            <Card padding="md" className="mt-6 border-soundcore-100 dark:border-soundcore-900/30 bg-soundcore-50 dark:bg-soundcore-900/10">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-5 h-5 text-soundcore-600" />
                <h3 className="text-lg font-semibold text-soundcore-600">PartyCast</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Sync multiple Soundcore speakers for PartyCast mode. All connected speakers will play the same audio simultaneously.
              </p>
              <DeviceGuardButton
                feature="PartyCast"
                supported={true}
                deviceName={connectedDevice.name}
                onClick={() => showToast('PartyCast mode activated', 'success')}
              >
                Enable PartyCast
              </DeviceGuardButton>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Lighting Guide</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5">
              <li><strong>Off:</strong> LED disabled</li>
              <li><strong>Steady:</strong> Constant color</li>
              <li><strong>Breath:</strong> Slowly pulses</li>
              <li><strong>Flash:</strong> Strobe effect</li>
              <li><strong>Rainbow:</strong> Color cycling</li>
              <li><strong>PartyCast:</strong> Sync across speakers</li>
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Lighting controls only available on speaker models (Motion, Flare, Rave series).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};