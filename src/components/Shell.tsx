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
import { IconBack, IconDevice, IconEq, IconHand, IconMenu } from './Icons';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'device', label: 'Device', icon: <IconDevice /> },
  { id: 'sounds', label: 'Sounds', icon: <IconEq /> },
  { id: 'controls', label: 'Controls', icon: <IconHand /> },
  { id: 'settings', label: 'Menu', icon: <IconMenu /> },
];

const STACK_TITLE: Partial<Record<Exclude<StackId, null>, string>> = {
  ambient: 'Ambient Sound',
  'eq-custom': 'Custom EQ',
  hearid: 'HearID',
  touch: 'Button Controls',
  diagnostics: 'Diagnostics',
  about: 'About',
  'safe-volume': 'Safe Volume',
  connect: 'Add device',
};

export function Shell() {
  const app = useApp();
  const stacked = Boolean(app.stack);

  return (
    <div className="min-h-screen md:py-6 md:px-4">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white md:min-h-[820px] md:rounded-[32px] md:shadow-2xl overflow-hidden">
        {stacked ? (
          <header className="flex items-center gap-1 border-b border-line px-2 py-2">
            <button onClick={app.back} className="rounded-full p-2 text-ink" aria-label="Back">
              <IconBack />
            </button>
            <h1 className="text-[17px] font-semibold">{STACK_TITLE[app.stack!] ?? ''}</h1>
          </header>
        ) : null}

        {app.error && (
          <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-xl bg-[#fff1f2] px-3 py-2 text-sm text-danger">
            <p>{app.error}</p>
            <button onClick={app.clearError} className="text-mute">
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
          {!stacked && app.tab === 'device' && <DeviceHome />}
          {!stacked && app.tab === 'sounds' && <SoundsPage />}
          {!stacked && app.tab === 'controls' && <ControlsPage />}
          {!stacked && app.tab === 'settings' && <SettingsPage />}
        </div>

        {!stacked && (
          <nav className="grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
            {TABS.map((t) => {
              const on = app.tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => app.setTab(t.id)}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                    on ? 'text-blue' : 'text-mute'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
