import React from 'react';
import { useDevicesStore } from '../stores/devices';
import { Card } from '../components/Card';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { ShieldAlert } from 'lucide-react';

export const TouchControlsPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();

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
  );
};