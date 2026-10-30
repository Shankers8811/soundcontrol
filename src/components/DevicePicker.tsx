import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { scanDevices } from '../api/bridge';
import { matchDevice, DeviceProfile } from '../protocol/devices';
import { Button, Card, StatusBadge, Spinner } from './ui';

interface DevicePickerProps {
  onSelect: (device: { mac: string; name: string; profile: any }) => void;
  onClose: () => void;
}

export function DevicePicker({ onSelect, onClose }: DevicePickerProps) {
  const [devices, setDevices] = useState<Array<{
    mac: string;
    name: string;
    connected?: boolean;
    battery?: number;
    profile: any;
    isKnown: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDevices = async () => {
      try {
        setLoading(true);
        const devices = await import('../api/bridge').then(m => m.scanDevices(true));
        
        if (!cancelled) {
          const matched = devices.map(device => {
            const profile = matchDevice(device.name || '');
            return {
              mac: device.mac,
              name: device.name,
              connected: device.connected,
              battery: device.battery,
              profile: profile.id === 'unknown' ? null : profile,
              isKnown: profile.id !== 'unknown',
            };
          });
          setDevices(devices);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to scan devices');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDevices();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (device: typeof devices[0]) => {
    if (!device.isKnown) {
      alert('This device is not fully supported. Some features may not work.');
    }
    onSelect({
      mac: device.mac,
      name: device.name,
      profile: device.profile,
    });
    onClose();
  };

  if (loading) {
    return (
      <Card title="Select Device">
        <Spinner size="lg" />
        <p className="text-center text-faint mt-4">Scanning for devices...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Error">
        <p className="text-danger">{error}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Select Device" subtitle="Choose a Soundcore device to connect">
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {devices.length === 0 ? (
          <div className="text-center py-8 text-faint">
            <p>No devices found</p>
            <p className="text-xs mt-1">Make sure your device is paired and connected in Bluetooth settings</p>
          </div>
        ) : (
          devices.map(device => (
            <button
              key={device.mac}
              onClick={() => handleSelect(device)}
              className="w-full text-left p-4 rounded-xl border border-edge bg-sunken hover:border-accent/50 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{device.name}</span>
                  <span className="font-mono text-[10px] text-faint">{device.mac}</span>
                  {device.connected && (
                    <StatusBadge phase="connected" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-500/15 text-blue-400">
                    {device.battery !== undefined ? `${device.battery}%` : 'Battery unknown'}
                  </span>
                  {device.isKnown && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-500/15 text-green-400">
                      Fully Supported
                    </span>
                  )}
                  {!device.isKnown && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-warning/15 text-warning">
                      Limited Support
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}