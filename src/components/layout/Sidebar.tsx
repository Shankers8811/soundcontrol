import { NavLink, useLocation } from 'react-router-dom';
import { 
  Headphones, 
  Volume2, 
  Equalizer, 
  Battery, 
  Terminal, 
  Settings,
  ChevronRight,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const NAV_ITEMS = [
  { id: 'devices', label: 'Devices', icon: Headphones },
  { id: 'noise-control', label: 'Noise Control', icon: Volume2 },
  { id: 'equalizer', label: 'Equalizer', icon: Equalizer },
  { id: 'battery', label: 'Battery', icon: Battery },
  { id: 'diagnostics', label: 'Diagnostics', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  
  return (
    <>
      <aside
        className={twMerge(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-bg-elevated border-r border-border flex flex-col transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        {/* Logo / App title */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Headphones className="w-5 h-5 text-on-accent" />
          </div>
          <span className="font-semibold text-lg text-text">SoundControl</span>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === `/${item.id}`;
            
            return (
              <NavLink
                key={item.id}
                to={`/${item.id}`}
                className={({ isActive }) => twMerge(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-body transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-muted hover:bg-surface hover:text-text'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={twMerge('w-5 h-5 flex-shrink-0', isActive && 'text-accent')} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        
        {/* Footer */}
        <div className="p-3 border-t border-border">
          <p className="text-caption text-text-muted text-center">
            v2.0.0-beta
          </p>
        </div>
      </aside>
      
      {/* Close button for mobile */}
      {isOpen && (
        <button
          onClick={onClose}
          className="fixed top-4 right-4 lg:hidden z-50 p-2 rounded-lg bg-bg-elevated border border-border shadow-lg"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5 text-text" />
        </button>
      )}
    </>
  );
};