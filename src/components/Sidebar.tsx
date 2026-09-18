import type { ComponentType, SVGProps } from 'react';
import type { PageId } from '../types';
import { useApp } from '../state/store';
import {
  IconControls,
  IconDashboard,
  IconDevices,
  IconEqualizer,
  IconInfo,
  IconLogo,
  IconSettings,
} from './Icons';
import type { ConnectionPhase } from '../state/derive';

/**
 * Desktop left navigation (PART D). Six real pages, each fully working.
 * Active state uses the blue accent; every item is a native button, so
 * keyboard focus and activation come for free.
 */

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const NAV: Array<{ id: PageId; label: string; icon: IconComponent }> = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'devices', label: 'Devices', icon: IconDevices },
  { id: 'equalizer', label: 'Equalizer', icon: IconEqualizer },
  { id: 'controls', label: 'Controls', icon: IconControls },
  { id: 'settings', label: 'Settings', icon: IconSettings },
  { id: 'about', label: 'About', icon: IconInfo },
];

const DOT: Record<ConnectionPhase, string> = {
  connected: 'bg-accent shadow-[0_0_6px_rgb(61_123_255/0.8)]',
  connecting: 'bg-warn blink',
  error: 'bg-danger',
  disconnected: 'bg-faint',
};

export function Sidebar() {
  const app = useApp();

  return (
    <aside className="flex w-[216px] shrink-0 flex-col border-r border-edge bg-sunken xl:w-[240px]">
      {/* SoundControl's own branding — no third-party marks. */}
      <div className="flex items-center gap-2.5 px-4 py-4 xl:px-5">
        <IconLogo size={30} />
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-ink">SoundControl</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">for Windows</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-1 px-2.5 py-2 xl:px-3">
        {NAV.map((item) => {
          const active = app.page === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => app.setPage(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? 'bg-accent/12 text-accent-soft'
                  : 'text-mute hover:bg-raised/70 hover:text-ink'
              }`}
            >
              {/* Active indicator bar in the accent color. */}
              <span
                aria-hidden
                className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity duration-200 ${
                  active ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Live connection chip — real store state, click goes to Devices. */}
      <button
        onClick={() => app.setPage('devices')}
        className="m-2.5 flex items-center gap-2.5 rounded-xl border border-edge bg-panel px-3 py-2.5 text-left transition-colors duration-150 hover:border-accent/40 xl:m-3"
        title={app.connected ? `Connected to ${app.deviceName}` : 'Open Devices to connect'}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[app.connectionPhase]}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-ink">
            {app.connected ? app.deviceName : app.connecting ? 'Connecting…' : 'No device'}
          </span>
          <span className="block truncate text-[10px] text-faint">
            {app.connected ? app.profile.name : app.connecting ? 'Establishing link' : 'Not connected'}
          </span>
        </span>
      </button>
    </aside>
  );
}
