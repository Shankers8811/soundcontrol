import { useUIStore } from '../stores/ui'

export const useToast = () => {
  const { showToast, removeToast } = useUIStore()

  const toast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    showToast(message, type)
  }

  const dismiss = (id: string) => {
    removeToast(id)
  }

  return { toast, dismiss }
}