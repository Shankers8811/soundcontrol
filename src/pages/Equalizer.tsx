import React, { useEffect, useState } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EQSlider } from '../components/EQSlider';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { Save, Trash2, Loader2, Music, ShieldAlert } from 'lucide-react';
import { getEQPresets, saveEQPreset, deleteEQPreset, applyEQPreset, setEQBand } from '../api/tauri';

interface EQPresetItem {
  name: string;
  bands: string;
}

export const EqualizerPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [eqBands, setEqBands] = useState<number[]>(Array(8).fill(0));
  const [presets, setPresets] = useState<EQPresetItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const p = await getEQPresets();
      setPresets(p);
    } catch (e) {
      console.error('Failed to load presets', e);
    }
  };

  const handleBandChange = async (band: number, gain: number) => {
    const newBands = [...eqBands];
    newBands[band] = gain;
    setEqBands(newBands);

    if (connectedDevice?.address) {
      try {
        await setEQBand(connectedDevice.address, band, gain);
      } catch (e) {
        showToast('Failed to set EQ band', 'error');
      }
    }
  };

  const handleSavePreset = async () => {
    const name = prompt('Enter preset name:');
    if (!name) return;
    try {
      await saveEQPreset(name, eqBands.join(','));
      await loadPresets();
      showToast('Preset saved', 'success');
    } catch (e) {
      showToast('Failed to save preset', 'error');
    }
  };

  const handleApplyPreset = async (preset: EQPresetItem) => {
    if (!connectedDevice?.address) return;
    try {
      setLoading(true);
      await applyEQPreset(connectedDevice.address, preset.name);
      const bands = preset.bands.split(',').map(Number);
      setEqBands(bands);
      showToast(`Applied preset: ${preset.name}`, 'success');
    } catch (e) {
      showToast('Failed to apply preset', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreset = async (name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
      await deleteEQPreset(name);
      await loadPresets();
      showToast('Preset deleted', 'success');
    } catch (e) {
      showToast('Failed to delete preset', 'error');
    }
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

  const eqBandCount = connectedDevice.profile?.eq_bands ?? 8;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equalizer</h1>
          <p className="text-gray-500 dark:text-gray-400">Customize your sound with EQ bands</p>
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
              <h3 className="text-lg font-semibold">Custom EQ</h3>
              <Button variant="outline" size="sm" onClick={handleSavePreset}>
                <Save className="w-4 h-4 mr-2" /> Save Preset
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              {Array.from({ length: eqBandCount }).map((_, i) => (
                <div key={i} className="flex flex-col items-center">
                  <EQSlider
                    band={i}
                    gain={eqBands[i] ?? 0}
                    onChange={(gain) => handleBandChange(i, gain)}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Factory Presets</h3>
            <div className="space-y-3">
              {[
                { name: 'Flat', bands: '0,0,0,0,0,0,0,0' },
                { name: 'Bass Boost', bands: '6,4,2,0,-2,-4,-6,-8' },
                { name: 'Vocal', bands: '-2,-1,0,2,4,4,2,0' },
                { name: 'Treble Boost', bands: '-8,-6,-4,-2,0,2,4,6' },
                { name: 'Rock', bands: '4,2,0,-2,-4,-4,-2,0' },
                { name: 'Hip-Hop', bands: '8,6,4,2,0,-2,-4,-6' },
                { name: 'Dance', bands: '6,4,2,0,-2,-4,-6,-8' },
                { name: 'Jazz', bands: '2,4,6,4,2,0,-2,-4' },
                { name: 'Classical', bands: '-2,0,2,4,6,4,2,0' },
                { name: 'Country', bands: '0,2,4,6,4,2,0,-2' },
                { name: 'Acoustic', bands: '-4,-2,0,2,4,4,2,0' },
                { name: 'Electronic', bands: '4,6,4,2,0,-2,-4,-6' },
                { name: 'R&B', bands: '2,4,6,4,2,0,-2,-4' },
                { name: 'Reggae', bands: '0,2,4,6,4,2,0,-2' },
                { name: 'Blues', bands: '-2,0,2,4,6,4,2,0' },
                { name: 'Metal', bands: '6,4,2,0,-2,-4,-6,-8' },
                { name: 'Punk', bands: '4,2,0,-2,-4,-4,-2,0' },
                { name: 'Folk', bands: '-4,-2,0,2,4,4,2,0' },
                { name: 'Gospel', bands: '2,4,6,4,2,0,-2,-4' },
                { name: 'Latin', bands: '0,2,4,6,4,2,0,-2' },
                { name: 'New Age', bands: '-2,0,2,4,6,4,2,0' },
                { name: 'Podcast', bands: '-4,-2,0,4,6,4,2,0' },
              ].map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  onClick={() => {
                    const bands = preset.bands.split(',').map(Number);
                    setEqBands(bands);
                    if (connectedDevice?.address) {
                      bands.forEach((gain, i) => {
                        setEQBand(connectedDevice.address, i, gain).catch((e) => {
                          showToast('Failed to apply preset band', 'error');
                          console.error(e);
                        });
                      });
                    }
                  }}
                  className="w-full text-left"
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </Card>

          <Card padding="md" className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Saved Presets</h3>
            <div className="space-y-2">
              {presets.length === 0 ? (
                <p className="text-sm text-gray-500 text-center">No saved presets</p>
              ) : (
                presets.map((preset) => (
                  <div key={preset.name} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{preset.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleApplyPreset(preset)} disabled={loading}>
                        {loading ? <Loader2 className="w-3 h-3" /> : 'Apply'}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeletePreset(preset.name)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};