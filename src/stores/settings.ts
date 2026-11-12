import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Settings, ThemePref } from '../types';
import { api } from '../api/tauri';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSettings: (settings: Settings) => void;
  setTheme: (theme: ThemePref) => void;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        settings: {
          theme: 'system',
          language: 'en',
          autoCheckUpdates: true,
          startMinimized: false,
          showTray: true,
          logLevel: 'info',
          bluetoothAdapter: null,
        },
        isLoading: false,
        error: null,

        // Actions
        setSettings: (settings) => set({ settings }),
        setTheme: (theme) => set((state) => ({ 
          settings: { ...state.settings, theme } 
        })),

        loadSettings: async () => {
          set({ isLoading: true });
          try {
            const settings = await api.getSettings();
            set({ settings, isLoading: false });
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to load settings', isLoading: false });
          }
        },

        updateSettings: async (updates) => {
          const current = get().settings;
          const newSettings = { ...current, ...updates };
          try {
            const saved = await api.updateSettings(newSettings);
            set({ settings: saved });
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to update settings' });
          }
        },
      }),
      {
        name: 'soundcontrol-settings',
      }
    ),
    { name: 'SettingsStore' }
  )
);