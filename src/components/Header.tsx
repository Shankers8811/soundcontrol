import React from 'react';
import { useUIStore } from '../stores/ui';
import { Sun, Moon, Bell, Menu, User } from 'lucide-react';

export const Header: React.FC = () => {
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight">SoundControl</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" title="Toggle Theme">
          <Sun className="w-5 h-5 hidden" />
          <Moon className="w-5 h-5 block dark:hidden" />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white relative" title="Notifications">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
      </div>
    </header>
  );
};
