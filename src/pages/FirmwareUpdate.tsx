import React, { useState, useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { ShieldAlert, RefreshCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { checkFirmwareUpdate } from '../api/tauri';

export const FirmwareUpdatePage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [firmwareInfo, setFirmwareInfo] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  [true]; // placeholder to avoid unused var warning

  useEffect(() => {
    if (connectedDevice?.address && connectedDevice.profile?.model) {
      checkFirmwareUpdate(connectedDevice.profile.model).then(setFirmwareInfo).catch(() => {});
    }
  }, [connectedDevice]);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      if (connectedDevice?.profile?.model) {
        const info = await checkFirmwareUpdate(connectedDevice.profile.model);
        setFirmwareInfo(info);
      }
    } catch (e) {
      showToast('Failed to check for updates', 'error');
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    showToast('Firmware update installation started', 'info');
    // In a real implementation, this would download and flash firmware
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
          <h1 className="text-2xl font-bold">Firmware Update</h1>
          <p className="text-gray-500 dark:text-gray-400">Keep your Soundcore device up to date</p>
        </div>
        <Button onClick={checkForUpdates} disabled={checking}>
          {checking ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Checking</span> : <><RefreshCw className="w-4 h-4 mr-2" /> Check Updates</>}</>
        </Button>
      </div>

      <DeviceInfoCard
        name={connectedDevice.name}
        model={connectedDevice.profile?.model || 'Unknown'}
        address={connectedDevice.address}
        connected={connectedDevice.connected}
        batteryCount={connectedDevice.profile?.battery_count || 3}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <h3 className="text-lg font-semibold mb-4">Current Firmware</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800 pb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Device</span>
              <span className="text-sm font-mono">{connectedDevice.profile?.model}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800 pb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Current Version</span>
              <span className="text-sm font-mono">{firmwareInfo?.cached?.version || 'Unknown'}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                firmwareInfo?.update_available ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400'
              }`}>
                {firmwareInfo?.update_available ? 'Update Available' : 'Up to Date'}
              </span>
            </div>
          </div>
        </Card>

        {firmwareInfo?.update_available ? (
          <Card padding="md" className="border-soundcore-600 bg-soundcore-50 dark:bg-soundcore-900/10">
            <h3 className="text-lg font-semibold mb-4">Update Available</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-soundcore-600" />
                <div>
                  <p className="text-sm font-medium">Version {firmwareInfo?.cached?.version}</p>
                  <p className="text-xs text-gray-500">New firmware with improvements and bug fixes</p>
                </div>
              </div>
              <Button variant="primary" onClick={installUpdate} className="w-full">
                Install Update
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Do not disconnect your device during the update process.
              </p>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">No Updates</h3>
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Your device is running the latest firmware.</p>
            </div>
          </Card>
        )}
      </div>

      <Card padding="md">
        <h3 className="text-lg font-semibold mb-4">Why Update?</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5">
          <li>Improved Bluetooth connection stability</li>
          <li>Enhanced ANC performance</li>
          <li>New features and sound modes</li>
          <li>Bug fixes and security patches</li>
          <li>Better battery life</li>
        </ul>
      </Card>
    </div>
  );
};
