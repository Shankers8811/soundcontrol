import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { AppShell } from './components/AppShell';
import { DevicesPage } from './pages/Devices';
import { NoiseControlPage } from './pages/NoiseControl';
import { EqualizerPage } from './pages/Equalizer';
import { BatteryPage } from './pages/Battery';
import { DiagnosticsPage } from './pages/Diagnostics';
import { SettingsPage } from './pages/Settings';
import { HearIDPage } from './pages/HearID';
import { RelaxingSoundsPage } from './pages/RelaxingSounds';
import { TouchControlsPage } from './pages/TouchControls';
import { FirmwareUpdatePage } from './pages/FirmwareUpdate';
import { SpeakerLightingPage } from './pages/SpeakerLighting';
import { useDevicesStore } from './stores/devices';
import { useSettingsStore } from './stores/settings';
import { useUIStore } from './stores/ui';

function App() {
  const [initialized, setInitialized] = useState(false);
  const { loadDevices, devices } = useDevicesStore();
  const { loadSettings } = useSettingsStore();
  const { showToast } = useUIStore();

  useEffect(() => {
    const init = async () => {
      try {
        await loadSettings();
        await loadDevices();
        setInitialized(true);
      } catch (e) {
        console.error('Init failed', e);
        setInitialized(true);
      }
    };
    init();
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-soundcore-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-soundcore-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">SoundControl</h1>
          <p className="text-soundcore-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<DevicesPage />} />
          <Route path="/noise-control" element={<NoiseControlPage />} />
          <Route path="/equalizer" element={<EqualizerPage />} />
          <Route path="/battery" element={<BatteryPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/hearid" element={<HearIDPage />} />
          <Route path="/relaxing-sounds" element={<RelaxingSoundsPage />} />
          <Route path="/touch-controls" element={<TouchControlsPage />} />
          <Route path="/firmware" element={<FirmwareUpdatePage />} />
          <Route path="/speaker-lighting" element={<SpeakerLightingPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
