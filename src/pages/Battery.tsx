import React, { useEffect, useState } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { BatteryRing } from '../components/BatteryRing';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { Battery, Ear, RefreshCw, Zap } from 'lucide-react';
import { getBatteryLevels } from '../api/tauri';
import type { BatteryLevel } from '../types';

export const BatteryPage: React.FC = () => {
  const { connectedDevice, refreshBattery } = useDevicesStore();
  const { showToast } = useUIStore();
  const [battery, setBattery] = useState<BatteryLevel | null>(null);
  const [loading, setLoading] = useState(false);
  const [singleEarbudMode, setSingleEarbudMode] = useState(false);

  useEffect(() => {
    if (connectedDevice?.address) {
      loadBattery();
    }
  }, [connectedDevice]);

  const loadBattery = async () => {
    if (!connectedDevice?.address) return;
    try {
      setLoading(true);
      const levels = await getBatteryLevels(connectedDevice.address);
      setBattery(levels);
    } catch (e) {
      showToast('Failed to load battery levels', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!connectedDevice) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Battery className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold">No device selected</h3>
        <p className="text-gray-500 dark:text-gray-400">Please connect a Soundcore device first</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Battery</h1>
          <p className="text-gray-500 dark:text-gray-400">Monitor battery levels for your earbuds</p>
        </div>
        <Button onClick={() => { refreshBattery(connectedDevice.address); loadBattery(); }} disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Loading
            </span>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      <DeviceInfoCard
        name={connectedDevice.name}
        model={connectedDevice.profile?.model || 'Unknown'}
        address={connectedDevice.address}
        connected={connectedDevice.connected}
        batteryCount={connectedDevice.profile?.battery_count || 3}
        singleEarbudMode={singleEarbudMode}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: 'Left Earbud', value: battery?.left ?? null, charging: battery?.left_charging ?? false, icon: <Ear className="w-6 h-6" /> },
          { label: 'Right Earbud', value: battery?.right ?? null, charging: battery?.right_charging ?? false, icon: <Ear className="w-6 h-6" /> },
          { label: 'Charging Case', value: battery?.case ?? null, charging: battery?.case_charging ?? false, icon: <Zap className="w-6 h-6" /> },
        ].map((item, index) => (
          <Card key={index} padding="md">
            <BatteryRing
              level={item.value}
              label={item.label}
              charging={item.charging}
              size="lg"
            />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <h3 className="text-lg font-semibold mb-4">Battery Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Combined Level</span>
              <span className="text-sm font-mono font-bold">
                {battery != null && battery.left !== null && battery.right !== null
                  ? Math.round((battery.left + battery.right) / 2) + '%'
                  : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Single Earbud Mode</span>
              <button onClick={() => setSingleEarbudMode(!singleEarbudMode)} className="text-sm text-soundcore-600 hover:underline">
                {singleEarbudMode ? 'Disable' : 'Enable'}
              </button>
            </div>
            {singleEarbudMode && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  All features work with one earbud connected. Battery shown for connected earbud only.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-lg font-semibold mb-4">Charging Indicators</h3>
          <div className="space-y-3">
            {[
              { label: 'Left', charging: battery?.left_charging ?? false },
              { label: 'Right', charging: battery?.right_charging ?? false },
              { label: 'Case', charging: battery?.case_charging ?? false },
            ].map((item, index) => (
              <div key={index} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{item.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.charging ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                  {item.charging ? '⚡ Charging' : '⚪ Not Charging'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};