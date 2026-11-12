import { Menu, Sun, Moon, Monitor, Bell, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useUIStore } from '../../stores/ui';
import { useSettingsStore } from '../../stores/settings';
import { Button } from '../ui/Button';
import { ToggleSwitch } from '../ui/ToggleSwitch';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const { settings, setTheme } = useSettingsStore();
  const { showSuccess, showError } = useUIStore();
  
  const toggleTheme = () => {
    const themes: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
    const currentIndex = themes.indexOf(settings.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
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