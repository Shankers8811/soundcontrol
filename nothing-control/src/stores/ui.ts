import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PageId, CommandResponse } from '../types';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface UIState {
  // Navigation
  currentPage: PageId;
  sidebarOpen: boolean;
  
  // Toasts
  toasts: Toast[];
  
  // Modals
  activeModal: string | null;
  
  // Loading states
  globalLoading: boolean;
  
  // Actions
  setPage: (page: PageId) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  
  openModal: (modalId: string) => void;
  closeModal: () => void;
  
  setGlobalLoading: (loading: boolean) => void;
  
  // Success/error helpers
  showSuccess: (title: string, message?: string) => void;
  showError: (title: string, message?: string) => void;
  showInfo: (title: string, message?: string) => void;
  showWarning: (title: string, message?: string) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentPage: 'devices',
      sidebarOpen: true,
      toasts: [],
      activeModal: null,
      globalLoading: false,

      // Navigation
      setPage: (page) => set({ currentPage: page }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Toasts
      addToast: (toast) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { ...toast, id };
        set((state) => ({ toasts: [...state.toasts, newToast] }));
        
        // Auto-remove
        setTimeout(() => {
          get().removeToast(id);
        }, toast.duration || 4000);
      },
      
      removeToast: (id) => set((state) => ({ 
        toasts: state.toasts.filter((t) => t.id !== id) 
      })),
      
      clearToasts: () => set({ toasts: [] }),

      // Modals
      openModal: (modalId) => set({ activeModal: modalId }),
      closeModal: () => set({ activeModal: null }),

      // Loading
      setGlobalLoading: (loading) => set({ globalLoading: loading }),

      // Helpers
      showSuccess: (title, message) => get().addToast({ type: 'success', title, message }),
      showError: (title, message) => get().addToast({ type: 'error', title, message, duration: 8000 }),
      showInfo: (title, message) => get().addToast({ type: 'info', title, message }),
      showWarning: (title, message) => get().addToast({ type: 'warning', title, message }),
    }),
    { name: 'UIStore' }
  )
);