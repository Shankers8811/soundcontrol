import React, { useEffect, useState } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { Search, Plus, RefreshCw, Wifi, BluetoothOff, Bluetooth, Ear, EarOff } from 'lucide-react';
import { isSoundcoreDevice } from '../utils/helpers';

export const DevicesPage: React.FC = () => {
  const { devices, connectedDevice, isScanning, scan, connect, disconnect, setConnectedDevice, bluetoothState } = useDevicesStore();
  const { showToast } = useUIStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [singleEarbudMode, setSingleEarbudMode] = useState(false);

  useEffect(() => {
    scan();
  }, []);

  const filteredDevices = devices.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const soundcoreDevices = filteredDevices.filter(d => isSoundcoreDevice(d.name));
  const nonSoundcoreDevices = filteredDevices.filter(d => !isSoundcoreDevice(d.name));

  const handleConnect = async (address: string) => {
    try {
      await connect(address);
      showToast('Device connected successfully', 'success');
    } catch (e) {
      showToast('Failed to connect device', 'error');
    }
  };

  const handleDisconnect = async (address: string) => {
    try {
      await disconnect(address);
      showToast('Device disconnected', 'info');
    } catch (e) {
      showToast('Failed to disconnect device', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your Anker/Soundcore devices</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-soundcore-500"
            />
          </div>
          <Button onClick={scan} disabled={isScanning}>
            {isScanning ? 'Scanning...' : <><RefreshCw className="w-4 h-4 mr-2" /> Scan</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {connectedDevice ? (
          <div className="lg:col-span-3">
            <DeviceInfoCard
              name={connectedDevice.name}
              model={connectedDevice.profile?.model || 'Unknown'}
              address={connectedDevice.address}
              connected={true}
              batteryCount={connectedDevice.profile?.battery_count || 3}
              singleEarbudMode={singleEarbudMode}
            />
            <div className="mt-6 flex items-center gap-3">
              <Button variant="danger" onClick={() => handleDisconnect(connectedDevice.address)}>
                Disconnect
              </Button>
              <Button onClick={() => setSingleEarbudMode(!singleEarbudMode)}>
                {singleEarbudMode ? 'Exit Single Earbud Mode' : 'Single Earbud Mode'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-3">
            <Card padding="md">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BluetoothOff className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-lg font-semibold">No device connected</h3>
                <p className="text-gray-500 dark:text-gray-400">Connect a Soundcore device to get started</p>
              </div>
            </Card>
          </div>
        )}
        
        <div className="lg:col-span-3">
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Available Devices</h3>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${bluetoothState === 'powered_on' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400'}`}>
                {bluetoothState === 'powered_on' ? 'Bluetooth On' : 'Bluetooth Off'}
              </span>
            </div>
            
            {soundcoreDevices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <Wifi className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400">No Soundcore devices found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Make sure your Soundcore device is in pairing mode</p>
              </div>
            ) : (
              <div className="space-y-3">
                {soundcoreDevices.map((device) => (
                  <div key={device.address} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-soundcore-100 dark:bg-soundcore-900/30 flex items-center justify-center text-soundcore-600">
                        <Ear className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{device.name}</p>
                        <p className="text-xs text-gray-500">{device.profile?.model || 'Soundcore Device'}</p>
                      </div>
                    </div>
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => handleConnect(device.address)}
                      disabled={device.connected}
                    >
                      {device.connected ? 'Connected' : 'Connect'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {nonSoundcoreDevices.length > 0 && (
          <div className="lg:col-span-3">
            <Card padding="md" className="border-yellow-200 dark:border-yellow-900/30 bg-yellow-50 dark:bg-yellow-900/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center text-yellow-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Non-Soundcore Devices Filtered</h3>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    {nonSoundcoreDevices.length} device(s) hidden - this app only supports Anker/Soundcore devices
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
