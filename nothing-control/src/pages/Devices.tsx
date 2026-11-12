import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Bluetooth, 
  BluetoothOff, 
  RefreshCw, 
  Search,
  Plus,
  HelpCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useDevicesStore } from '../../stores/devices';
import { useUIStore } from '../../stores/ui';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { BatteryRing } from '../components/ui/BatteryRing';

export const DevicesPage = () => {
  const { 
    pairedDevices, 
    isScanning, 
    isConnecting,
    scanDevices, 
    connectDevice,
    activeDevice 
  } = useDevicesStore();
  const { showSuccess, showError, showInfo } = useUIStore();
  
  useEffect(() => {
    scanDevices();
  }, [scanDevices]);
  
  const handleConnect = async (mac: string) => {
    const device = await connectDevice(mac);
    if (device) {
      showSuccess('Connected', `${device.name || mac} connected successfully`);
    } else {
      showError('Connection failed', 'Could not connect to device');
    }
  };
  
  const handleScan = () => {
    showInfo('Scanning', 'Looking for paired devices...');
    scanDevices();
  };
  
  if (pairedDevices.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-bold">Devices</h1>
            <p className="text-text-muted mt-1">No Soundcore devices paired yet</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleScan} disabled={isScanning}>
              <Search className="w-4 h-4" />
              <RefreshCw className={clsx('w-4 h-4', isScanning && 'animate-spin')} />
              Scan
            </Button>
          </div>
        </div>
        
        <Card className="p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-surface flex items-center justify-center">
            <BluetoothOff className="w-10 h-10 text-text-muted" />
          </div>
          <h3 className="text-h3 font-medium mb-2">No Devices Found</h3>
          <p className="text-text-muted mb-6 max-w-md mx-auto">
            Pair your Soundcore earbuds or headphones in your system's Bluetooth settings, then click "Scan" to discover them.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleScan} disabled={isScanning}>
              <Search className="w-4 h-4" />
              <RefreshCw className={clsx('w-4 h-4', isScanning && 'animate-spin')} />
              Scan for Devices
            </Button>
            <Button variant="ghost" onClick={() => showInfo('Help', 'Open system Bluetooth settings to pair your device')}>
              <HelpCircle className="w-4 h-4" />
              Help Me Pair
            </Button>
          </div>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h1 font-bold">Devices</h1>
          <p className="text-text-muted mt-1">
            {pairedDevices.length} device{pairedDevices.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Button onClick={handleScan} disabled={isScanning} variant="secondary">
          <Search className="w-4 h-4" />
          <RefreshCw className={clsx('w-4 h-4', isScanning && 'animate-spin')} />
          Scan
        </Button>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pairedDevices.map((device) => {
          const isConnected = device.mac === activeDevice?.mac;
          const isConnecting = isConnecting && device.mac === activeDevice?.mac;
          
          return (
            <Card 
              key={device.mac} 
              variant={isConnected ? 'interactive' : 'hover'}
              className={clsx(
                'relative',
                isConnected && 'ring-2 ring-accent'
              )}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                        <Bluetooth className="w-6 h-6 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-text truncate">
                          {device.name || 'Unknown Device'}
                        </h3>
                        <p className="text-caption text-text-muted font-mono">{device.mac}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {device.connected && (
                        <span className="badge badge-success text-xs flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          Connected
                        </span>
                      )}
                      {device.paired && !device.connected && (
                        <span className="badge text-xs flex items-center gap-1">
                          <Bluetooth className="w-3 h-3" />
                          Paired
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Battery indicator */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <BatteryRing 
                      percent={100} // Would come from device state
                      size="sm" 
                    />
                  </div>
                </div>
                
                <div className="px-4 pb-4 pt-0 border-t border-border">
                  <div className="flex gap-2">
                    {isConnected ? (
                      <>
                        <Button 
                          variant="secondary" 
                          className="flex-1"
                          onClick={() => {}}
                        >
                          <Link to={`/devices/${device.mac}`} className="w-full flex justify-center">
                            Open Controls
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="flex-1"
                        onClick={() => handleConnect(device.mac)}
                        disabled={isConnecting}
                        loading={isConnecting}
                      >
                        {isConnecting ? 'Connecting...' : 'Connect'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}