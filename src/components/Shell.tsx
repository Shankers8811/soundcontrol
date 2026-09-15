import type { ReactNode } from 'react';
import type { StackId, TabId } from '../types';
import { useApp } from '../state/store';
import { AmbientPage } from './AmbientPage';
import { AboutPage, SettingsPage } from './SettingsPage';
import { ConnectSheet } from './ConnectSheet';
import { ControlsPage, TouchPage } from './ControlsPage';
import { CustomEqPage, SafeVolumePage, SoundsPage } from './SoundsPage';
import { DeviceHome } from './DeviceHome';
import { HearIdPage } from './HearId';
import { HexConsole } from './HexConsole';
import { SleepPage } from './SleepPage';
import { FindDeviceModal } from './FindDeviceModal';
import { DeviceSelectModal } from './DeviceSelectModal';
import { IconBack, IconDevice, IconEq, IconHand, IconMenu, IconSleep } from './Icons';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'device', label: 'Device', icon: <IconDevice /> },
  { id: 'sounds', label: 'Sounds', icon: <IconEq /> },
  { id: 'controls', label: 'Controls', icon: <IconHand /> },
  { id: 'sleep', label: 'Sleep', icon: <IconSleep /> },
  { id: 'settings', label: 'Menu', icon: <IconMenu /> },
];

const STACK_TITLE: Partial<Record<Exclude<StackId, null>, string>> = {
  ambient: 'Ambient Sound',
  'eq-custom': 'Custom Equalizer',
  hearid: 'HearID Sound',
  touch: 'Button Controls',
  diagnostics: 'Diagnostics & Protocol',
  about: 'About SoundControl',
  'safe-volume': 'Safe Volume Limiter',
  connect: 'Add Soundcore Device',
  'find-device': 'Find My Device',
  'device-select': 'Switch Model Profile',
};

export function Shell() {
  const app = useApp();
  const stacked = Boolean(app.stack);

  return (
    <div className="min-h-screen bg-[#d8e2ef] md:py-6 md:px-4">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col bg-white md:min-h-[840px] md:rounded-[36px] md:shadow-2xl overflow-hidden border border-slate-200/80">
        {stacked ? (
          <header className="flex items-center gap-1.5 border-b border-line px-3 py-3 bg-white">
            <button
              onClick={app.back}
              className="rounded-full p-2 text-ink hover:bg-slate-100 transition"
              aria-label="Back"
            >
              <IconBack />
            </button>
            <h1 className="text-[17px] font-bold text-ink">{STACK_TITLE[app.stack!] ?? ''}</h1>
          </header>
        ) : null}

        {app.error && (
          <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-2xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 shadow-xs">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{app.error}</span>
            </div>
            <button onClick={app.clearError} className="font-semibold text-rose-800 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {app.stack === 'ambient' && <AmbientPage />}
          {app.stack === 'eq-custom' && <CustomEqPage />}
          {app.stack === 'hearid' && <HearIdPage />}
          {app.stack === 'touch' && <TouchPage />}
          {app.stack === 'diagnostics' && <HexConsole />}
          {app.stack === 'about' && <AboutPage />}
          {app.stack === 'safe-volume' && <SafeVolumePage />}
          {app.stack === 'connect' && <ConnectSheet />}
          {app.stack === 'find-device' && <FindDeviceModal onClose={app.back} />}
          {app.stack === 'device-select' && <DeviceSelectModal onClose={app.back} />}

          {!stacked && app.tab === 'device' && <DeviceHome />}
          {!stacked && app.tab === 'sounds' && <SoundsPage />}
          {!stacked && app.tab === 'controls' && <ControlsPage />}
          {!stacked && app.tab === 'sleep' && <SleepPage />}
          {!stacked && app.tab === 'settings' && <SettingsPage />}
        </div>

        {!stacked && (
          <nav className="grid grid-cols-5 border-t border-line bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
            {TABS.map((t) => {
              const on = app.tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => app.setTab(t.id)}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    on ? 'text-blue' : 'text-mute hover:text-ink'
                  }`}
                >
                  <span className={on ? 'scale-110 transition-transform' : ''}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
