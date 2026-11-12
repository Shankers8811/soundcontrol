import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoutes } from './routes';
import { useEffect } from 'react';
import { ToastContainer } from './components/ui/Toast';
import { useUIStore } from './stores/ui';
import { useSettingsStore } from './stores/settings';
import { useDevicesStore } from './stores/devices';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function App() {
  const { showSuccess, showError, showInfo } = useUIStore();
  const { loadSettings } = useSettingsStore();
  const { loadDeviceProfiles, loadKnownDevices, scanDevices } = useDevicesStore();

  useEffect(() => {
    const init = async () => {
      try {
        await loadSettings();
        await Promise.all([
          loadDeviceProfiles(),
          loadKnownDevices(),
        ]);
        await invoke('register_hotkeys');
        
        const unlisten = await listen('global-shortcut', (event) => {
          const { action } = event.payload as { action: string };
          handleGlobalShortcut(action);
        });
        
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
        window.dispatchEvent(new CustomEvent('global-shortcut', { detail: { action } }));
        break;
      case 'game_mode':
        showInfo('Game Mode', 'Toggling game mode');
        window.dispatchEvent(new CustomEvent('global-shortcut', { detail: { action } }));
        break;
      case 'show_window':
        break;
    }
  };

  return (
    <StrictMode>
      <AppRoutes />
      <ToastContainer />
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<App />);