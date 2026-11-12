import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ToastContainer } from './components/ui/Toast';
import { useUIStore } from './stores/ui';
import { useSettingsStore } from './stores/settings';
import { useDevicesStore } from './stores/devices';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export default function App() {
  const { showSuccess, showError, showInfo } = useUIStore();
  const { loadSettings } = useSettingsStore();
  const { loadDeviceProfiles, loadKnownDevices, scanDevices } = useDevicesStore();

  useEffect(() => {
    // Initialize app
    const init = async () => {
      try {
        // Load settings
        await loadSettings();
        
        // Load device profiles and known devices
        await Promise.all([
          loadDeviceProfiles(),
          loadKnownDevices(),
        ]);
        
        // Register global hotkeys
        await invoke('register_hotkeys');
        
        // Listen for global shortcut events
        const unlisten = await listen('global-shortcut', (event) => {
          const { action } = event.payload as { action: string };
          handleGlobalShortcut(action);
        });
        
        // Initial device scan
        scanDevices();
        
        return () => {
          unlisten();
        };
      } catch (error) {
        showError('Initialization failed', error instanceof Error ? error.message : 'Unknown error');
      }
    };
    
    init();
  }, [loadSettings, loadDeviceProfiles, loadKnownDevices, scanDevices, showError]);

  const handleGlobalShortcut = (action: string) => {
    switch (action) {
      case 'anc_cycle':
        showInfo('ANC', 'Cycling noise control mode');
        // Emit to device component
        window.dispatchEvent(new CustomEvent('global-shortcut', { detail: { action } }));
        break;
      case 'game_mode':
        showInfo('Game Mode', 'Toggling game mode');
        window.dispatchEvent(new CustomEvent('global-shortcut', { detail: { action } }));
        break;
      case 'show_window':
        // Window show is handled by Tauri
        break;
    }
  };

  return (
    <>
      <AppShell />
      <ToastContainer />
    </>
  );
}