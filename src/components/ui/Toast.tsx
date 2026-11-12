import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../stores/ui';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useUIStore();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted || toasts.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) => {
  const [visible, setVisible] = useState(true);
  const Icon = icons[toast.type];
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose(toast.id), 200);
    }, toast.duration || (toast.type === 'error' ? 8000 : 4000));
    return () => clearTimeout(timer);
  }, [toast, onClose]);
  
  if (!visible) return null;
  
  return (
    <div
      className={twMerge(
        'pointer-events-auto animate-slide-up flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-md',
        toast.type === 'success' && 'bg-success text-white',
        toast.type === 'error' && 'bg-danger text-white',
        toast.type === 'info' && 'bg-accent text-white',
        toast.type === 'warning' && 'bg-warning text-white'
      )}
      role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{toast.title}</p>
        {toast.message && (
          <p className="text-sm opacity-90 mt-0.5">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onClose(toast.id), 200); }}
        className="p-1 hover:bg-black/10 rounded transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};