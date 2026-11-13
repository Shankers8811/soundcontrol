import React from 'react';
import { Bluetooth, Battery, Wifi, ShieldCheck } from 'lucide-react';
import { Card } from './Card';

interface DeviceInfoCardProps {
  name: string;
  model: string;
  address: string;
  connected: boolean;
  batteryCount: number;
  singleEarbudMode?: boolean;
}

export const DeviceInfoCard: React.FC<DeviceInfoCardProps> = ({
  name,
  model,
  address,
  connected,
  batteryCount,
  singleEarbudMode = false,
}) => {
  return (
    <Card padding="md">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{model}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${connected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span className="text-xs font-medium">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Bluetooth className="w-5 h-5 text-soundcore-600" />
            <div>
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-sm font-mono">{address}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Battery className="w-5 h-5 text-soundcore-600" />
            <div>
              <p className="text-xs text-gray-500">Battery Sensors</p>
              <p className="text-sm font-medium">{batteryCount} sensor{batteryCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {singleEarbudMode && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-900">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Single earbud mode active - all features work with one earbud connected
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
