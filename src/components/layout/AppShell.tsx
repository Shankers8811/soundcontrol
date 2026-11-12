import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  Headphones, 
  Volume2, 
  Equalizer, 
  Battery, 
  Terminal, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '../../stores/ui';
import { useDevicesStore } from '../../stores/devices';
import { Button } from '../ui/Button';
import { BatteryRing } from '../ui/BatteryRing';

const NAV_ITEMS = [
  { id: 'devices', label: 'Devices', icon: Headphones },
  { id: 'noise-control', label: 'Noise Control', icon: Volume2 },
  { id: 'equalizer', label: 'Equalizer', icon: Equalizer },
  { id: 'battery', label: 'Battery', icon: Battery },
  { id: 'diagnostics', label: 'Diagnostics', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export const AppShell = () => {
  const { sidebarOpen, toggleSidebar, toasts, removeToast } = useUIStore();
  const { activeDevice, activeSession } = useDevicesStore();
  const location = useLocation();
  
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-overlay lg:hidden" 
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={toggleSidebar} />
      
      {/* Main content */}
      <div className={twMerge('flex-1 flex flex-col min-w-0', sidebarOpen && 'lg:ml-64')}>
        {/* Header */}
        <Header onMenuClick={toggleSidebar} />
        
        {/* Main content area */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <div className="max-w-[1100px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
        
        {/* Active device indicator bar */}
        {activeDevice && activeSession && (
          <div className={twMerge(
            'border-t border-border bg-bg-elevated px-4 py-2 lg:px-6 transition-transform duration-200',
            sidebarOpen ? 'lg:ml-64' : ''
          )}>
            <div className="max-w-[1100px] mx-auto flex items-center gap-3">
              <BatteryRing 
                percent={activeDevice.battery?.leftPct ?? null} 
                charging={activeDevice.battery?.leftCharging ?? false}
                size="sm" 
                label="L"
              />
              <BatteryRing 
                percent={activeDevice.battery?.rightPct ?? null} 
                charging={activeDevice.battery?.rightCharging ?? false}
                size="sm" 
                label="R"
              />
              {activeDevice.battery?.casePct !== null && (
                <BatteryRing 
                  percent={activeDevice.battery?.casePct ?? null} 
                  charging={activeDevice.battery?.caseCharging ?? false}
                  size="sm" 
                  label="Case"
                />
              )}
              <span className="text-body-sm text-text-muted flex-1 truncate">
                {activeDevice.name || activeDevice.mac}
              </span>
              <span className="badge badge-success text-xs">Connected</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={twMerge(
              'pointer-events-auto animate-slide-up flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-md',
              toast.type === 'success' && 'bg-success text-white',
              toast.type === 'error' && 'bg-danger text-white',
              toast.type === 'info' && 'bg-accent text-white',
              toast.type === 'warning' && 'bg-warning text-white'
            )}
            role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
          >
            <span className="flex-1">{toast.title}</span>
            {toast.message && <span className="text-sm opacity-90">{toast.message}</span>}
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};