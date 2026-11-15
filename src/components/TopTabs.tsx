import type { ComponentType, SVGProps } from 'react';
import type { PageId } from '../types';
import { useApp } from '../state/store';
import {
  IconControls,
  IconDashboard,
  IconDevices,
  IconEqualizer,
  IconLogo,
  IconSettings,
} from './Icons';
import type { ConnectionPhase } from '../state/derive';

/**
 * Horizontal top tab bar — mobile-style navigation replacing the vertical sidebar.
 * Same five destinations: Home, Devices, Equalizer, Noise Control, Settings.
 * Active state uses the blue accent; tabs are native buttons for keyboard focus.
 */

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const NAV: Array<{ id: PageId; label: string; icon: IconComponent }> = [
  { id: 'dashboard', label: 'Home', icon: IconDashboard },
  { id: 'devices', label: 'Devices', icon: IconDevices },
  { id: 'equalizer', label: 'Equalizer', icon: IconEqualizer },
  { id: 'controls', label: 'Noise Control', icon: IconControls },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

const DOT: Record<ConnectionPhase, string> = {
  connected: 'bg-accent shadow-[0_0_6px_rgb(61_123_255/0.8)]',
  connecting: 'bg-warn blink',
  error: 'bg-danger',
  disconnected: 'bg-faint',
};

export function TopTabs() {
  const app = useApp();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-edge bg-sunken/95 backdrop-blur supports-[backdrop-filter]:bg-sunken/80">
      <div className="mx-auto max-w-[1440px] px-4 py-2 xl:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand + tabs on mobile stack, on desktop side by side */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
            {/* Brand mark */}
            <div className="flex items-center gap-2 px-2 py-1">
              <IconLogo size={26} />
              <span className="hidden text-[15px] font-bold tracking-tight text-ink sm:block">
                SoundControl
              </span>
            </div>

            {/* Horizontal tab bar */}
            <nav aria-label="Main navigation" className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1 w-full sm:pb-0">
              {NAV.map((item) => {
                const active = app.page === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => app.setPage(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                      active
                        ? 'bg-accent/12 text-accent-soft'
                        : 'text-mute hover:bg-raised/70 hover:text-ink'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {/* Active indicator underline */}
                    <span
                      aria-hidden
                      className={`absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 bg-accent transition-all duration-200 ${
                        active ? 'w-[calc(100%-1rem)] opacity-100' : 'opacity-0'
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Connection status chip (moved from sidebar bottom) */}
          <button
            onClick={() => app.setPage('devices')}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-1.5 text-left transition-colors duration-150 hover:border-accent/40"
            title={app.connected ? `Connected to ${app.deviceName}` : 'Open Devices to connect'}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[app.connectionPhase]}`}
              aria-hidden
            />
            <span className="hidden min-w-0 flex-1 sm:block">
              <span className="block truncate text-xs font-semibold text-ink">
                {app.connected ? app.deviceName : app.connecting ? 'Connecting…' : 'No device'}
              </span>
              <span className="block truncate text-[10px] text-faint">
                {app.connected ? app.profile.name : app.connecting ? 'Establishing link' : 'Not connected'}
              </span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}