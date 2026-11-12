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
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { HotkeyRecorder } from '../ui/HotkeyRecorder';

export const Header = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const { settings, setTheme } = useSettingsStore();
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
      showInfo('Checking', 'Looking for updates...');
      setCheckingUpdates(false);
    } catch (e) {
      showError('Check failed', 'Could not check for updates');
      setCheckingUpdates(false);
    }
  };
  
  const installUpdate = async () => {
    if (!updateAvailable) return;
    showInfo('Installing', 'Downloading and installing update...');
  };
  
  return (
    <header className="sticky top-0 z-30 bg-bg-elevated/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-surface transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-text" />
        </button>
        
        {/* Page title - filled by pages */}
        <div className="flex-1 lg:flex-none" />
        
        {/* Actions */}
        <div className="flex items-center gap-2 lg:gap-4">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Theme: ${getThemeLabel()}, click to cycle`}
            title={`Theme: ${getThemeLabel()}`}
          >
            {getThemeIcon()}
          </Button>
          
          {/* Notifications */}
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </Button>
          
          {/* User menu placeholder */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <span className="text-accent font-medium text-sm">SC</span>
            </div>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </div>
        </div>
      </div>
    </header>
  );
};

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}