import React from 'react'

interface ToastProps {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  onRemove: (id: string) => void
}

export const Toast: React.FC<ToastProps> = ({ id, message, type, onRemove }) => {
  const colors = {
    info: 'bg-blue-600 border-blue-500',
    success: 'bg-green-600 border-green-500',
    warning: 'bg-yellow-600 border-yellow-500',
    error: 'bg-red-600 border-red-500',
  }
  
  return (
    <div className={`${colors[type]} text-white px-4 py-3 rounded-lg border shadow-lg flex items-start gap-3 animate-in fade-in slide-in-from-right-4 duration-300`}>
      <span className="flex-shrink-0">
        {type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}
      </span>
      <span className="text-sm">{message}</span>
      <button
        onClick={() => onRemove(id)}
        className="ml-auto opacity-70 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}
