import React from 'react'

interface HotkeyRecorderProps {
  current: string
  onChange: (combo: string) => void
  recording?: boolean
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({
  current,
  onChange,
  recording = false,
}) => {
  const [isRecording, setIsRecording] = React.useState(recording)
  
  const startRecording = () => setIsRecording(true)
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isRecording) return
    e.preventDefault()
    const keys: string[] = []
    if (e.ctrlKey) keys.push('Ctrl')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    if (e.metaKey) keys.push('Meta')
    if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      keys.push(e.key)
    }
    if (keys.length > 0) {
      onChange(keys.join('+'))
      setIsRecording(false)
    }
  }
  
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isRecording])
  
  return (
    <button
      onClick={startRecording}
      disabled={isRecording}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        isRecording
          ? 'bg-blue-600 border-blue-500 text-white'
          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {isRecording ? <span className="animate-pulse">●</span> Recording... : <span>⌨</span>}
      <span className="text-sm">{current}</span>
    </button>
  )
}
