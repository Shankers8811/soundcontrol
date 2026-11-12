import { useState, useEffect } from 'react';
import { 
  Sun, 
  Moon, 
  Monitor, 
  Bell, 
  Globe,
  Key,
  Shield,
  Info,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSettingsStore } from '../../stores/settings';
import { useUIStore } from '../../stores/ui';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { HotkeyRecorder } from '../components/ui/HotkeyRecorder';

export const SettingsPage = () => {
  const { settings, updateSettings, loadSettings } = useSettingsStore();
  const { showSuccess, showError, showInfo } = useUIStore();
  
  const [hotkeys, setHotkeys] = useState<Record<string, string>>({
    anc_cycle: 'Ctrl+Alt+N',
    game_mode: 'Ctrl+Alt+G',
    show_window: 'Ctrl+Alt+S',
  });
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  
  const handleThemeChange = (theme: 'system' | 'light' | 'dark') => {
    updateSettings({ theme });
  };
  
  const getThemeIcon = () => {
    switch (settings.theme) {
      case 'light': return <Sun className="w-5 h-5" />;
      case 'dark': return <Moon className="w-5 h-5" />;
      default: return <Monitor className="w-5 h-5" />;
    }
  };
  
  const getThemeLabel = () => {
    switch (settings.theme) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      default: return 'System';
    }
  };
  
  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    try {
      // Would call Tauri updater
      showInfo('Checking', 'Looking for updates...');
      setCheckingUpdates(false);
    } catch (e) {
      showError('Check failed', 'Could not check for updates');
      setCheckingUpdates(false);
    }
  };
  
  const installUpdate = async () => {
    if (!updateAvailable) return;
    // Would call Tauri updater
    showInfo('Installing', 'Downloading and installing update...');
  };
  
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-h1 font-bold">Settings</h1>
      
      {/* Appearance */}
      <Card>
        <div className="p-4 border-b border-border">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Sun className="w-5 h-5" />
            Appearance
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Theme</h3>
              <p className="text-text-muted text-sm">Choose your preferred color scheme</p>
            </div>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    settings.theme === theme
                      ? 'bg-accent text-on-accent shadow-sm'
                      : 'bg-surface text-text border border-border hover:bg-surface/80'
                  )}
                >
                  {theme === 'system' && <Monitor className="w-4 h-4 mr-1" />}
                  {theme === 'light' && <Sun className="w-4 h-4 mr-1" />}
                  {theme === 'dark' && <Moon className="w-4 h-4 mr-1" />}
                  {getThemeLabel()}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Language</h3>
              <p className="text-text-muted text-sm">Application language</p>
            </div>
            <select
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value })}
              className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent w-48"
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Start Minimized</h3>
              <p className="text-text-muted text-sm">Launch to system tray instead of opening window</p>
            </div>
            <ToggleSwitch
              checked={settings.startMinimized}
              onChange={(v) => updateSettings({ startMinimized: v })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Show in System Tray</h3>
              <p className="text-text-muted text-sm">Keep app running in background when window closed</p>
            </div>
            <ToggleSwitch
              checked={settings.showTray}
              onChange={(v) => updateSettings({ showTray: v })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Auto-check Updates</h3>
              <p className="text-text-muted text-sm">Automatically check for new versions on startup</p>
            </div>
            <ToggleSwitch
              checked={settings.autoCheckUpdates}
              onChange={(v) => updateSettings({ autoCheckUpdates: v })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Log Level</h3>
              <p className="text-text-muted text-sm">Verbosity of application logs</p>
            </div>
            <select
              value={settings.logLevel}
              onChange={(e) => updateSettings({ logLevel: e.target.value })}
              className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent w-40"
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      </Card>
      
      {/* General */}
      <Card>
        <div className="p-4 border-b border-border">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Globe className="w-5 h-5" />
            General
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Bluetooth Adapter</h3>
              <p className="text-text-muted text-sm">Specific adapter to use (empty = default)</p>
            </div>
            <input
              type="text"
              value={settings.bluetoothAdapter || ''}
              onChange={(e) => updateSettings({ bluetoothAdapter: e.target.value || undefined })}
              placeholder="Default"
              className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent w-64"
            />
          </div>
        </div>
      </Card>
      
      {/* Hotkeys */}
      <Card>
        <div className="p-4 border-b border-border">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Key className="w-5 h-5" />
            Global Hotkeys
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Cycle ANC Mode</label>
              <HotkeyRecorder
                value={hotkeys.anc_cycle}
                onChange={(v) => setHotkeys({ ...hotkeys, anc_cycle: v })}
                action="anc_cycle"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Toggle Game Mode</label>
              <HotkeyRecorder
                value={hotkeys.game_mode}
                onChange={(v) => setHotkeys({ ...hotkeys, game_mode: v })}
                action="game_mode"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Show/Hide Window</label>
              <HotkeyRecorder
                value={hotkeys.show_window}
                onChange={(v) => setHotkeys({ ...hotkeys, show_window: v })}
                action="show_window"
              />
            </div>
          </div>
          <p className="text-caption text-text-muted">
            Hotkeys work globally. Conflicts with system shortcuts will be shown.
          </p>
        </div>
      </Card>
      
      {/* Notifications */}
      <Card>
        <div className="p-4 border-b border-border">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Desktop Notifications</h3>
              <p className="text-text-muted text-sm">Show notifications for battery alerts, connection changes, etc.</p>
            </div>
            <ToggleSwitch
              checked={true}
              onChange={() => {}}
              label="Enabled"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Low Battery Alerts</h3>
              <p className="text-text-muted text-sm">Notify when battery drops below threshold</p>
            </div>
            <ToggleSwitch
              checked={true}
              onChange={() => {}}
              label="Enabled"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Connection Alerts</h3>
              <p className="text-text-muted text-sm">Notify when device connects/disconnects</p>
            </div>
            <ToggleSwitch
              checked={true}
              onChange={() => {}}
              label="Enabled"
            />
          </div>
        </div>
      </Card>
      
      {/* Updates */}
      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Download className="w-5 h-5" />
            Updates
          </h2>
          <Button 
            variant="secondary" 
            onClick={checkForUpdates} 
            disabled={checkingUpdates}
            loading={checkingUpdates}
          >
            <RefreshCw className={clsx('w-4 h-4', checkingUpdates && 'animate-spin')} />
            Check Now
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="w-6 h-6 text-accent" />
              <div>
                <h3 className="font-medium">Auto-update</h3>
                <p className="text-text-muted text-sm">Automatically download and install updates</p>
              </div>
            </div>
            <ToggleSwitch
              checked={true}
              onChange={() => {}}
            />
          </div>
          
          {updateAvailable && (
            <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-success" />
                  <div>
                    <h3 className="font-medium">Update Available</h3>
                    <p className="text-text-muted text-sm">Version {updateVersion} is ready to install</p>
                  </div>
                </div>
                <Button onClick={installUpdate} variant="primary">
                  Install Now
                </Button>
              </div>
            </div>
          )}
          
          <div className="pt-4 border-t border-border">
            <h3 className="font-medium mb-2">Current Version</h3>
            <p className="text-text-muted font-mono">1.0.0-beta</p>
          </div>
        </div>
      </Card>
      
      {/* About */}
      <Card>
        <div className="p-4 border-b border-border">
          <h2 className="text-h3 font-medium flex items-center gap-2">
            <Info className="w-5 h-5" />
            About
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-accent/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-accent">SC</span>
            </div>
            <div>
              <h3 className="font-bold text-lg">SoundControl</h3>
              <p className="text-text-muted">Version 1.0.0-beta</p>
              <p className="text-caption text-text-muted mt-1">Native Windows/Linux desktop companion for Soundcore devices</p>
            </div>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 bg-surface rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                License
              </h4>
              <p className="text-sm text-text-muted">MIT License — Open source</p>
            </div>
            <div className="p-4 bg-surface rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Repository
              </h4>
              <p className="text-sm text-text-muted">github.com/Shankers8811/soundcontrol</p>
            </div>
          </div>
          
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => window.open('https://github.com/Shankers8811/soundcontrol', '_blank')}>
              <Globe className="w-4 h-4" />
              GitHub
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.open('https://github.com/Shankers8811/soundcontrol/issues', '_blank')}>
              <AlertCircle className="w-4 h-4" />
              Report Issue
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.open('https://github.com/Shankers8811/soundcontrol/blob/main/LICENSE', '_blank')}>
              <Shield className="w-4 h-4" />
              License
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}