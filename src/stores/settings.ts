import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettings, updateSetting } from '../api/tauri';
import type { AppSettings } from '../types';

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSetting: (key: keyof AppSettings, value: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      loading: false,

      loadSettings: async () => {
        set({ loading: true });
        try {
          const settings = await getSettings();
          set({ settings, loading: false });
        } catch (e) {
          console.error('Failed to load settings', e);
          set({ loading: false });
        }
      },

      updateSetting: async (key, value) => {
        try {
          await updateSetting(key, value);
          set((state) => ({
            settings: state.settings ? { ...state.settings, [key]: value } : null,
          }));
        } catch (e) {
          console.error('Failed to update setting', e);
          throw e;
        }
      },
    }),
    {
      name: 'soundcontrol-settings',
    }
  )
);