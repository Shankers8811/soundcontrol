import React, { useState, useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { ShieldAlert, Play, SkipForward, SkipBack, Phone, Volume2 } from 'lucide-react';
import { setGestures } from '../api/tauri';

const gestures = [
  { id: 'left_single', name: 'Left - Single Tap', icon: Play, default: 'Play / Pause' },
  { id: 'left_double', name: 'Left - Double Tap', icon: SkipBack, default: 'Previous Track' },
  { id: 'left_hold', name: 'Left - Hold', icon: Volume2, default: 'Volume Down' },
  { id: 'right_single', name: 'Right - Single Tap', icon: Play, default: 'Play / Pause' },
  { id: 'right_double', name: 'Right - Double Tap', icon: SkipForward, default: 'Next Track' },
  { id: 'right_hold', name: 'Right - Hold', icon: Volume2, default: 'Volume Up' },
  { id: 'both_hold', name: 'Both - Hold', icon: Phone, default: 'Voice Assistant' },
];

export const TouchControlsPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [editingGesture, setEditingGesture] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (connectedDevice?.address) {
      // Device info loading would happen here
    }
  }, [connectedDevice]);

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
          <h1 className="text-2xl font-bold">Touch Controls</h1>
          <p className="text-gray-500 dark:text-gray-400">Customize touch gestures on your earbuds</p>
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
              <h3 className="text-lg font-semibold">Gesture Customization</h3>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                Not Supported
              </span>
            </div>
            <div className="py-8 text-center">
              <ShieldAlert className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Your device does not support touch control customization</p>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Default Gestures</h3>
            <div className="space-y-3">
              {gestures.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{g.name}</span>
                  <span className="text-xs font-mono text-gray-400">{g.default}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};