import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../stores/ui';
import { Devices, Activity, BarChart3, Battery, Settings, LayoutDashboard, Ear, Moon, Settings2, ShieldAlert } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Devices' },
  { path: '/noise-control', icon: Activity, label: 'Noise Control' },
  { path: '/equalizer', icon: BarChart3, label: 'Equalizer' },
  { path: '/battery', icon: Battery, label: 'Battery' },
  { path: '/diagnostics', icon: Devices, label: 'Diagnostics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/hearid', icon: Ear, label: 'HearID' },
  { path: '/relaxing-sounds', icon: Moon, label: 'Relaxing Sounds' },
  { path: '/touch-controls', icon: Settings2, label: 'Touch Controls' },
  { path: '/firmware', icon: ShieldAlert, label: 'Firmware' },
];

export const Sidebar: React.FC = () => {
  const { sidebarOpen, toggleSidebar, activePage, setActivePage } = useUIStore();

  return (
    <aside className={`fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} z-50 sm:relative sm:translate-x-0 sm:w-64 sm:border-r-0 sm:border-b sm:border-gray-200 dark:sm:border-gray-800`}>
      <div className="flex h-full flex-col">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-soundcore-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">SoundControl</span>
          </div>
          <button onClick={toggleSidebar} className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white sm:hidden">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-soundcore-50 text-soundcore-600 dark:bg-soundcore-900 dark:text-soundcore-400'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`
                }
                onClick={() => {
                  setActivePage(item.label.toLowerCase().replace(' ', '-'));
                  if (!sidebarOpen) toggleSidebar();
                }}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium">Shankers8811</p>
              <p className="text-xs text-gray-500">soundcontrol@github.com</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
