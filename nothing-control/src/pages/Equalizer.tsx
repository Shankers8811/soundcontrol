import { useState, useEffect } from 'react';
import { 
  Equalizer, 
  Music, 
  Save, 
  Download, 
  Upload, 
  Trash2,
  Plus,
  SlidersHorizontal,
  RotateCcw,
  Speaker,
  Headphones
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EQ_HZ, EQ_FACTORY_PRESET_NAMES, EQ_BAND_MIN, EQ_BAND_MAX, EQ_BAND_STEP, EQ_BAND_COUNT } from '../../types';
import { useDevicesStore } from '../../stores/devices';
import { useUIStore } from '../../stores/ui';
import { Card } from '../components/ui/Card';
import { EQSlider } from '../components/ui/EQSlider';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { BatteryRing } from '../components/ui/BatteryRing';

export const EqualizerPage = () => {
  const { activeDevice, activeSession, setEqPreset, setCustomEq, saveEqPreset, listEqPresets } = useDevicesStore();
  const { showSuccess, showError, showInfo } = useUIStore();
  
  const [customBands, setCustomBands] = useState<number[]>(Array(EQ_BAND_COUNT).fill(0));
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [savedPresets, setSavedPresets] = useState<Array<{id: number, name: string, bands: number[]}>>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [importJson, setImportJson] = useState('');
  
  const profile = activeSession?.profile;
  const hasCustomEQ = profile?.supports_advanced_eq ?? profile?.supports_eq === 'custom_8band' ?? profile?.supports_eq === 'custom_10band';
  const isFactoryOnly = profile?.supports_eq === 'factory';
  
  useEffect(() => {
    if (activeDevice && activeSession?.model) {
      loadPresets();
    }
  }, [activeDevice, activeSession]);
  
  const loadPresets = async () => {
    if (!activeSession?.model) return;
    try {
      const presets = await listEqPresets(activeSession.model);
      setSavedPresets(presets.filter(p => !p.is_factory).map(p => ({
        id: p.id,
        name: p.name,
        bands: p.bands,
      })));
    } catch (e) {
      console.error('Failed to load presets:', e);
    }
  };
  
  const handleBandChange = (index: number, value: number) => {
    const newBands = [...customBands];
    newBands[index] = value;
    setCustomBands(newBands);
    
    if (activeDevice) {
      setCustomEq(activeDevice.mac, newBands);
    }
  };
  
  const handlePresetSelect = (presetId: number) => {
    if (!activeDevice) return;
    setActivePreset(presetId);
    setShowCustom(false);
    setEqPreset(activeDevice.mac, presetId);
    
    if (presetId < EQ_FACTORY_PRESET_NAMES.length) {
      // Factory preset - could load the bands here
    }
  };
  
  const handleSavePreset = async () => {
    if (!activeSession?.model || !newPresetName.trim()) return;
    
    try {
      await saveEqPreset(activeSession.model, newPresetName.trim(), customBands);
      showSuccess('Preset saved', `"${newPresetName}" added to your presets`);
      setNewPresetName('');
      loadPresets();
    } catch (e) {
      showError('Save failed', 'Could not save preset');
    }
  };
  
  const handleImport = () => {
    try {
      const data = JSON.parse(importJson);
      if (data.bands && Array.isArray(data.bands) && data.bands.length === EQ_BAND_COUNT) {
        const validated = data.bands.map((v: number) => 
          Math.max(EQ_BAND_MIN, Math.min(EQ_BAND_MAX, Math.round(v * 2) / 2))
        );
        setCustomBands(validated);
        if (activeDevice) setCustomEq(activeDevice.mac, validated);
        setShowCustom(true);
        setActivePreset(null);
        showSuccess('Imported', 'Custom EQ loaded from JSON');
      } else {
        showError('Invalid format', 'JSON must contain "bands" array with 8 values');
      }
    } catch {
      showError('Import failed', 'Invalid JSON format');
    }
  };
  
  const handleExport = () => {
    const data = {
      name: activePreset !== null && activePreset < EQ_FACTORY_PRESET_NAMES.length 
        ? EQ_FACTORY_PRESET_NAMES[activePreset] 
        : 'Custom EQ',
      bands: customBands,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eq-preset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  if (!activeDevice || !activeSession) {
    return (
      <div className="space-y-6">
        <h1 className="text-h1 font-bold">Equalizer</h1>
        <Card className="p-8 text-center">
          <Equalizer className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">No Device Connected</h3>
          <p className="text-text-muted">Connect a Soundcore device to adjust equalizer settings</p>
        </Card>
      </div>
    );
  
  const isFactoryOnly = profile?.eq_type === 'factory';
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h1 font-bold">Equalizer</h1>
          <p className="text-text-muted mt-1">{activeDevice.name || activeDevice.mac}</p>
        </div>
        <div className="flex items-center gap-2">
          <BatteryRing 
            percent={activeDevice.battery?.leftPct ?? null} 
            charging={activeDevice.battery?.leftCharging ?? false}
            size="sm" 
            label="L"
          />
          <BatteryRing 
            percent={activeDevice.battery?.rightPct ?? null} 
            charging={activeDevice.battery?.rightCharging ?? false}
            size="sm" 
            label="R"
          />
        </div>
      </div>
      
      {!hasCustomEQ && isFactoryOnly ? (
        <Card className="p-8 text-center">
          <Equalizer className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">Custom EQ Not Available</h3>
          <p className="text-text-muted max-w-md mx-auto">
            This device ({profile?.display_name || 'unknown'}) only supports factory EQ presets.
            Use the preset buttons below to select a sound profile.
          </p>
        </Card>
      ) : (
        <>
          {/* Custom EQ Editor */}
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-h3 font-medium">Custom EQ</h2>
                <ToggleSwitch
                  checked={showCustom}
                  onChange={setShowCustom}
                  disabled={!hasCustomEQ}
                  label="Custom EQ"
                  subLabel={showCustom ? 'Editing custom curve' : 'Using preset'}
                />
              </div>
            </div>
            <div className="p-4">
              {showCustom ? (
                <div className="flex flex-wrap gap-2 justify-center items-end pb-8">
                  {Array.from({ length: EQ_BAND_COUNT }, (_, i) => (
                    <EQSlider
                      key={i}
                      bandIndex={i}
                      value={customBands[i]}
                      onChange={handleBandChange}
                      disabled={!hasCustomEQ}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-text-muted text-center py-8">
                  Enable Custom EQ to adjust the 8-band equalizer
                </p>
              )}
            </div>
          </Card>
          
          {/* Factory Presets */}
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-h3 font-medium">Factory Presets</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowCustom(false); setActivePreset(null); }}>
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {EQ_FACTORY_PRESET_NAMES.map((name, index) => (
                  <button
                    key={index}
                    onClick={() => handlePresetSelect(index)}
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                      activePreset === index
                        ? 'bg-accent text-on-accent shadow-sm'
                        : 'bg-surface text-text border border-border hover:bg-surface/80'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </Card>
          
          {/* Saved Presets */}
          {savedPresets.length > 0 && (
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-h3 font-medium">My Presets</h2>
                <Button variant="ghost" size="sm" onClick={() => setImportJson('')}>
                  <Plus className="w-4 h-4" />
                  Import
                </Button>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2 mb-4">
                  {savedPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center gap-2 bg-surface rounded-lg p-2">
                      <span className="font-medium text-sm truncate max-w-[150px]">{preset.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setCustomBands(preset.bands);
                        setShowCustom(true);
                        setActivePreset(null);
                        if (activeDevice) setCustomEq(activeDevice.mac, preset.bands);
                      }}>
                        <SlidersHorizontal className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        const blob = new Blob([JSON.stringify({ name: preset.name, bands: preset.bands }, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${preset.name}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { /* delete */ }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-4">
                  <textarea
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder='Paste JSON here: {"name": "My EQ", "bands": [0, 1, -1, ...]}'
                    className="w-full p-3 rounded-md bg-bg-elevated border border-border-input text-text placeholder:text-text-muted text-sm font-mono min-h-[80px] resize-y mb-2"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleImport} disabled={!importJson.trim()}>
                      <Upload className="w-4 h-4" />
                      Import
                    </Button>
                    <Button variant="secondary" onClick={handleExport} disabled={!showCustom && activePreset === null}>
                      <Download className="w-4 h-4" />
                      Export Current
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          
          {/* Save Custom Preset */}
          {showCustom && (
            <Card className="bg-accent/5 border-accent/20">
              <div className="p-4">
                <h3 className="font-medium mb-3">Save Custom EQ</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Preset name (e.g., \"My Bass Boost\")"
                    className="flex-1 px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text placeholder:text-text-muted text-sm focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <Button onClick={handleSavePreset} disabled={!newPresetName.trim()}>
                    <Save className="w-4 h-4" />
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}