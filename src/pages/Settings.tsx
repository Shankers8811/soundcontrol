import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { Sun, Moon, Bell, Globe, RefreshCw, ShieldAlert, AlertTriangle } from 'lucide-react';
import { getHotkeys, registerHotkey } from '../api/tauri';

interface HotkeysState {
  anc: string;
  game_mode: string;
  eq: string;
}

export const SettingsPage: React.FC = () => {
  const { settings, loadSettings, updateSetting } = useSettingsStore();
  const { showToast } = useUIStore();
  const [hotkeys, setHotkeys] = useState<HotkeysState | null>(null);
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null);
  const [hotkeyInput, setHotkeyInput] = useState('');

  useEffect(() => {
    loadSettings();
    loadHotkeys();
  }, []);

  const loadHotkeys = async () => {
    try {
      const hk = await getHotkeys();
      setHotkeys(hk);
    } catch (e) {
      console.error('Failed to load hotkeys', e);
    }
  };

  const handleThemeChange = (theme: string) => {
    updateSetting('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    showToast(`Theme changed to ${theme}`, 'success');
  };

  const handleHotkeyChange = async (action: string, combo: string) => {
    try {
      await registerHotkey(combo, action);
      await loadHotkeys();
      showToast(`Hotkey for ${action} updated`, 'success');
      setEditingHotkey(null);
      setHotkeyInput('');
    } catch (e) {
      showToast('Failed to update hotkey', 'error');
    }
  };

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">Configure SoundControl preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Appearance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                    <Sun className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Light Mode</p>
                    <p className="text-xs text-gray-500">Bright theme for daytime</p>
                  </div>
                </div>
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`w-6 h-6 rounded-full transition-colors ${settings.theme === 'light' ? 'ring-2 ring-soundcore-600' : ''}`}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <Moon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Dark Mode</p>
                    <p className="text-xs text-gray-500">Dark theme for nighttime</p>
                  </div>
                </div>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`w-6 h-6 rounded-full transition-colors ${settings.theme === 'dark' ? 'ring-2 ring-soundcore-600' : ''}`}
                />
              </div>
            </div>
          </Card>

          <Card padding="md" className="mt-6">
            <h3 className="text-lg font-semibold mb-4">General</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Auto Update</p>
                    <p className="text-xs text-gray-500">Automatically check for updates</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.auto_update === 'true'}
                  onChange={(checked) => updateSetting('auto_update', checked ? 'true' : 'false')}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Notifications</p>
                    <p className="text-xs text-gray-500">Show system notifications</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.notifications === 'true'}
                  onChange={(checked) => updateSetting('notifications', checked ? 'true' : 'false')}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Language</p>
                    <p className="text-xs text-gray-500">Interface language</p>
                  </div>
                </div>
                <select
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                  className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-soundcore-500"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Global Hotkeys</h3>
            <div className="space-y-4">
              {[
                { action: 'anc', label: 'Toggle ANC', current: hotkeys?.anc || settings.hotkey_anc },
                { action: 'game_mode', label: 'Game Mode', current: hotkeys?.game_mode || settings.hotkey_game },
                { action: 'eq', label: 'Equalizer', current: hotkeys?.eq || settings.hotkey_eq },
              ].map((item) => (
                <div key={item.action} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-xs text-gray-400">{item.current}</span>
                  </div>
                  {editingHotkey === item.action ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={hotkeyInput}
                        onChange={(e) => setHotkeyInput(e.target.value)}
                        placeholder="Press keys..."
                        className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-soundcore-500"
                        readOnly
                      />
                      <Button variant="outline" size="sm" onClick={() => {
                        if (hotkeyInput) {
                          handleHotkeyChange(item.action, hotkeyInput);
                        }
                      }}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingHotkey(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditingHotkey(item.action)}>
                      Edit
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md" className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Danger Zone</h3>
            <div className="space-y-3">
              <Button variant="danger" onClick={() => {
                if (confirm('Reset all settings to defaults?')) {
                  showToast('Settings reset', 'info');
                }
              }}>
                <AlertTriangle className="w-4 h-4 mr-2" /> Reset Settings
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};