import React, { useState } from 'react';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { useDevicesStore } from '../stores/devices';
import { Moon, Wind, Droplets, Flame, TreePine, Music2, RefreshCw, Volume2 } from 'lucide-react';

const sounds = [
  { id: 'rain', name: 'Rain', icon: Droplets, description: 'Gentle rain for relaxation and sleep' },
  { id: 'ocean', name: 'Ocean Waves', icon: Wind, description: 'Calm ocean waves for meditation' },
  { id: 'forest', name: 'Forest', icon: TreePine, description: 'Birds and rustling leaves in the woods' },
  { id: 'fireplace', name: 'Fireplace', icon: Flame, description: 'Cozy fireplace crackling sounds' },
  { id: 'white-noise', name: 'White Noise', icon: Music2, description: 'Masking noise for focus and sleep' },
  { id: 'lullaby', name: 'Lullaby', icon: RefreshCw, description: 'Soothing lullaby melodies' },
];

export const RelaxingSoundsPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const playSound = (soundId: string) => {
    setPlayingSound(soundId);
    showToast(`Playing ${sounds.find(s => s.id === soundId)?.name}`, 'info');
  };

  const stopSound = () => {
    setPlayingSound(null);
    showToast('Sound stopped', 'info');
  };

  if (!connectedDevice) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Moon className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold">No device selected</h3>
        <p className="text-gray-500 dark:text-gray-400">Please connect a Soundcore device first</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relaxing Sounds</h1>
          <p className="text-gray-500 dark:text-gray-400">White noise, nature sounds, and healing music</p>
        </div>
        {playingSound && (
          <Button variant="danger" onClick={stopSound} size="sm">
            <Volume2 className="w-4 h-4 mr-2" /> Stop
          </Button>
        )}
      </div>

      <DeviceInfoCard
        name={connectedDevice.name}
        model={connectedDevice.profile?.model || 'Unknown'}
        address={connectedDevice.address}
        connected={connectedDevice.connected}
        batteryCount={connectedDevice.profile?.battery_count || 3}
      />

      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sounds.map((sound) => (
            <Card
              key={sound.id}
              padding="sm"
              className={`cursor-pointer hover:border-soundcore-500 transition-colors ${
                playingSound === sound.id ? 'border-soundcore-600 bg-soundcore-50 dark:bg-soundcore-900/20' : ''
              }`}
              onClick={() => playSound(sound.id)}
            >
              <div className="flex items-center gap-3 mb-3">
                <sound.icon className="w-6 h-6 text-soundcore-600" />
                <span className="text-sm font-medium">{sound.name}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{sound.description}</p>
              {playingSound === sound.id && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-soundcore-600 animate-pulse">● Playing</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <h3 className="text-lg font-semibold mb-4">Usage Tips</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5">
          <li>Use with earbuds for best noise masking</li>
          <li>Sounds play through your connected Soundcore device</li>
          <li>Volume can be adjusted from your device or system volume</li>
          <li>Ideal for sleep, focus, meditation, or relaxation</li>
        </ul>
      </Card>
    </div>
  );
};