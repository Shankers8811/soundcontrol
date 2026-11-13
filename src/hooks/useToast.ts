import { useUIStore } from '../stores/ui'

export const useToast = () => {
  const { addToast, removeToast } = useUIStore()
  
  const toast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    addToast(message, type)
  }
  
  const dismiss = (id: string) => {
    removeToast(id)
  }
  
  return { toast, dismiss }
}
