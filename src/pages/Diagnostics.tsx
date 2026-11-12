import { useState, useEffect } from 'react';
import { 
  Terminal, 
  Copy, 
  Download, 
  Trash2, 
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const DiagnosticsPage = () => {
  const { activeDevice, getFrameLog, exportDiagnostics } = useDevicesStore();
  const { showSuccess, showError, showInfo } = useUIStore();
  
  const [frameLog, setFrameLog] = useState<Array<{id: number, direction: 'tx' | 'rx', frameHex: string, parsedJson: string | null, timestamp: string}>>([]);
  const [filter, setFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'tx' | 'rx'>('all');
  const [paused, setPaused] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<typeof frameLog[0] | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  useEffect(() => {
    if (activeDevice) {
      loadFrames();
      const interval = setInterval(() => {
        if (!paused && activeDevice) {
          loadFrames();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeDevice, paused]);
  
  const loadFrames = async () => {
    if (!activeDevice) return;
    try {
      const frames = await getFrameLog(activeDevice.mac, 200);
      setFrameLog(frames.reverse()); // Oldest first
    } catch (e) {
      console.error('Failed to load frame log:', e);
    }
  };
  
  const handleExport = async () => {
    if (!activeDevice) return;
    try {
      const data = await exportDiagnostics(activeDevice.mac);
      const blob = new Blob([data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soundcontrol-diagnostics-${activeDevice.mac.replace(/:/g, '')}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Exported', 'Diagnostics bundle downloaded');
    } catch (e) {
      showError('Export failed', 'Could not export diagnostics');
    }
  };
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showInfo('Copied', 'Frame copied to clipboard');
  };
  
  const filteredFrames = frameLog
    .filter(f => {
      if (directionFilter !== 'all' && f.direction !== directionFilter) return false;
      if (!filter) return true;
      const search = filter.toLowerCase();
      return f.frameHex.toLowerCase().includes(search) ||
        f.parsedJson?.toLowerCase().includes(search) ||
        f.direction.includes(search);
    });
  
  if (!activeDevice) {
    return (
      <div className="space-y-6">
        <h1 className="text-h1 font-bold">Diagnostics</h1>
        <Card className="p-8 text-center">
          <Terminal className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">No Device Connected</h3>
          <p className="text-text-muted">Connect a Soundcore device to view diagnostics</p>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h1 font-bold">Diagnostics</h1>
          <p className="text-text-muted mt-1">{activeDevice.name || activeDevice.mac}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Export Diagnostics
          </Button>
          <Button variant="ghost" onClick={() => { /* clear */ }} disabled={frameLog.length === 0}>
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>
      </div>
      
      {/* Controls */}
      <Card>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter frames (hex, direction, command)..."
                className="w-full pl-10 pr-4 py-2 rounded-md bg-bg-elevated border border-border-input text-text placeholder:text-text-muted text-sm focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as any)}
                className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Directions</option>
                <option value="tx">TX (Host → Device)</option>
                <option value="rx">RX (Device → Host)</option>
              </select>
              <Button 
                variant={paused ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setPaused(!paused)}
              >
                {paused ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2" />
                    Pause
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAutoScroll(!autoScroll)}>
                {autoScroll ? 'Auto-scroll: On' : 'Auto-scroll: Off'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      
      {/* Frame Log */}
      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-h3 font-medium">Frame Log ({filteredFrames.length} frames)</h2>
          <div className="flex items-center gap-2 text-caption text-text-muted">
            <span>{frameLog.length} total</span>
            <span>•</span>
            <span>{filteredFrames.filter(f => f.direction === 'tx').length} TX</span>
            <span>•</span>
            <span>{filteredFrames.filter(f => f.direction === 'rx').length} RX</span>
          </div>
        </div>
        <div className="h-96 overflow-auto" ref={autoScroll ? (el) => { if (el && autoScroll) el.scrollTop = el.scrollHeight; } : undefined}>
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 bg-bg-elevated border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-caption text-text-muted">Time</th>
                <th className="px-3 py-2 text-left text-caption text-text-muted">Dir</th>
                <th className="px-3 py-2 text-left text-caption text-text-muted">Frame</th>
                <th className="px-3 py-2 text-left text-caption text-text-muted">Parsed</th>
                <th className="px-3 py-2 text-left text-caption text-text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {filteredFrames.map((frame) => (
                <tr 
                  key={frame.id}
                  className={clsx(
                    'border-b border-border/50 hover:bg-surface/50 transition-colors',
                    frame.direction === 'tx' ? 'bg-green-500/5' : 'bg-blue-500/5'
                  )}
                  onClick={() => setSelectedFrame(frame)}
                >
                  <td className="px-3 py-1.5 text-caption text-text-muted whitespace-nowrap">
                    {new Date(frame.timestamp).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      frame.direction === 'tx' 
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    )}>
                      {frame.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-caption font-mono text-text break-all max-w-[400px]">
                    {frame.frameHex.match(/.{1,2}/g)?.join(' ') || frame.frameHex}
                  </td>
                  <td className="px-3 py-1.5 text-caption text-text-muted max-w-[300px] truncate">
                    {frame.parsedJson ? JSON.parse(frame.parsedJson).type || 'Decoded' : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(frame.frameHex); }}
                      className="p-1 hover:bg-surface rounded transition-colors"
                      aria-label="Copy frame hex"
                    >
                      <Copy className="w-4 h-4 text-text-muted hover:text-text" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredFrames.length === 0 && (
            <div className="flex items-center justify-center h-64 text-text-muted">
              <p>No frames match the current filter</p>
            </div>
          )}
        </div>
      </Card>
      
      {/* Frame Detail Modal */}
      {selectedFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={() => setSelectedFrame(null)}>
          <div className="bg-bg-elevated border border-border rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-h3 font-medium">Frame Details</h3>
              <button onClick={() => setSelectedFrame(null)} className="p-1 hover:bg-surface rounded transition-colors" aria-label="Close">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-text-muted">Direction:</span> <span className="font-mono">{selectedFrame.direction.toUpperCase()}</span></div>
                  <div><span className="text-text-muted">Time:</span> <span>{new Date(selectedFrame.timestamp).toLocaleString()}</span></div>
                  <div><span className="text-text-muted">Frame ID:</span> <span className="font-mono">#{selectedFrame.id}</span></div>
                </div>
                <div>
                  <span className="text-text-muted">Raw Hex:</span>
                  <div className="mt-1 p-3 bg-bg rounded font-mono text-xs break-all border border-border">
                    {selectedFrame.frameHex.match(/.{1,2}/g)?.join(' ') || selectedFrame.frameHex}
                  </div>
                </div>
                {selectedFrame.parsedJson && (
                  <div>
                    <span className="text-text-muted">Decoded:</span>
                    <div className="mt-1 p-3 bg-bg rounded font-mono text-xs break-all border border-border">
                      {JSON.stringify(JSON.parse(selectedFrame.parsedJson), null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button variant="secondary" onClick={() => handleCopy(selectedFrame.frameHex)}>
                <Copy className="w-4 h-4" />
                Copy Raw Hex
              </Button>
              <Button variant="secondary" onClick={() => handleCopy(selectedFrame.parsedJson || '')} disabled={!selectedFrame.parsedJson}>
                <Copy className="w-4 h-4" />
                Copy Decoded
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};