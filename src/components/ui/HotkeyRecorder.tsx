import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, Keyboard, Check } from 'lucide-react';
import { useUIStore } from '../../stores/ui';

interface HotkeyRecorderProps {
  value: string;
  onChange: (value: string) => void;
  action: 'anc_cycle' | 'game_mode' | 'show_window';
}

const ACTION_LABELS: Record<string, string> = {
  anc_cycle: 'Cycle ANC Mode',
  game_mode: 'Toggle Game Mode',
  show_window: 'Show/Hide Window',
};

export const HotkeyRecorder = ({ value, onChange, action }: HotkeyRecorderProps) => {
  const [recording, setRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<string | null>(null);
  const inputRef = useRef<HTMLButtonElement>(null);
  const { showError, showSuccess, showWarning } = useUIStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!recording) return;
      
      // Prevent default for modifier keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        e.preventDefault();
      }
      
      setPressedKeys(prev => new Set([...prev, formatKey(e.key)]));
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!recording) return;
      
      const newKeys = new Set(pressedKeys);
      newKeys.add(formatKey(e.key));
      
      // Build the chord
      const modifiers = ['Control', 'Alt', 'Shift', 'Meta'].filter(k => newKeys.has(k));
      const nonModifiers = Array.from(newKeys).filter(k => !['Control', 'Alt', 'Shift', 'Meta'].includes(k));
      
      if (nonModifiers.length > 0) {
        const chord = [...modifiers, nonModifiers[0]].join('+');
        setConflict(checkConflict(chord));
        
        if (!checkConflict(chord)) {
          onChange(chord);
          setRecording(false);
          setPressedKeys(new Set());
          showSuccess('Hotkey set', `${ACTION_LABELS[action]}: ${chord}`);
        } else {
          showWarning('Conflict', `${chord} is already used by ${checkConflict(chord)}`);
        }
      }
    };
    
    if (recording) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [recording, pressedKeys, action, onChange]);
  
  const formatKey = (key: string): string => {
    const keyMap: Record<string, string> = {
      'Control': 'Ctrl',
      'Alt': 'Alt',
      'Shift': 'Shift',
      'Meta': 'Meta',
      ' ': 'Space',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    };
    return keyMap[key] || key;
  };
  
  const checkConflict = (chord: string): string | null => {
    // Check against other hotkeys
    const systemShortcuts: Record<string, string> = {
      'Ctrl+Alt+Del': 'System',
      'Ctrl+Shift+Esc': 'Task Manager',
      'Win+D': 'Show Desktop',
      'Win+E': 'File Explorer',
      'Win+L': 'Lock',
      'Win+R': 'Run',
      'Alt+Tab': 'Switch Apps',
      'Alt+F4': 'Close Window',
    };
    
    if (systemShortcuts[chord]) return systemShortcuts[chord];
    
    // Could check against other registered hotkeys here
    return null;
  };
  
  const startRecording = () => {
    setRecording(true);
    setPressedKeys(new Set());
    setConflict(null);
    inputRef.current?.focus();
  };
  
  const stopRecording = () => {
    setRecording(false);
    setPressedKeys(new Set());
  };
  
  const displayKeys = recording 
    ? (pressedKeys.size > 0 ? Array.from(pressedKeys).join(' + ') : 'Press keys...')
    : value;
  
  return (
    <div className="relative">
      <button
        ref={inputRef}
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={recording && pressedKeys.size === 0}
        className={twMerge(
          'w-full px-3 py-2 rounded-md border font-mono text-sm transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          recording 
            ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 animate-pulse' 
            : 'bg-surface text-text border-border-input hover:border-accent/50',
          conflict && 'border-yellow-500'
        )}
        aria-label={recording ? 'Press key combination to set hotkey' : `Current hotkey: ${value}, click to change`}
      >
        <span className="flex items-center justify-between w-full">
          <span className="flex items-center gap-2">
            {recording ? (
              <Keyboard className="w-4 h-4 animate-pulse text-red-500" />
            ) : (
              <Check className="w-4 h-4 text-green-500" />
            )}
            <span>{displayKeys || 'Not set'}</span>
          </span>
          {conflict && (
            <span className="text-xs text-yellow-500 mr-2">
              Conflict: {conflict}
            </span>
          )}
        </span>
      </button>
      
      {conflict && (
        <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-yellow-500/10 border border-yellow-500 rounded text-yellow-700 text-xs">
          ⚠ Conflict with {conflict}. Press Escape to cancel or choose different keys.
        </div>
      )}
      
      <div className="mt-1 text-caption text-text-muted">
        {recording ? 'Press key combination (e.g., Ctrl+Alt+G). Escape to cancel.' : 'Click to change hotkey'}
      </div>
    </div>
  );
};