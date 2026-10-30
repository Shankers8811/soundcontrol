import { useEffect, useState } from 'react';
import { getConnectionManager, ConnectionState } from '../transports/connectionManager';
import { Card, Button, StatusBadge } from './ui';

/**
 * Connection status component — shows current connection state
 * and provides manual connect/disconnect controls.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<{
    phase: string;
    device: { name: string; mac: string } | null;
    error: string | null;
    progress: number;
  }>({
    phase: 'idle',
    device: null,
    error: null,
    progress: 0,
  });

  useEffect(() => {
    const manager = await import('../transports/connectionManager').then(m => m.getConnectionManager());
    const unsubscribe = manager.subscribe((state) => {
      setState({
        phase: state.phase,
        device: state.device,
        error: state.error,
        progress: state.progress,
      });
    });
    return unsubscribe;
  }, []);

  const handleConnect = async () => {
    // This would open a device picker modal
    console.log('Connect clicked');
  };

  const handleDisconnect = async () => {
    const manager = await import('../transports/connectionManager').then(m => m.getConnectionManager());
    await manager.disconnect();
  };

  const isConnected = state.phase === 'connected';
  const isConnecting = state.phase === 'connecting' || state.phase === 'scanning';

  return (
    <Card
      title="Connection Status"
      subtitle={isConnected ? 'Connected to device' : 'Not connected'}
    >
      <div className="space-y-4">
        {/* Status indicator */}
        <div className="flex items-center gap-4">
          <StatusBadge phase={state.phase as any} />
          <div className="flex-1">
            <p className="font-medium text-ink">
              {state.device?.name || 'No device connected'}
            </p>
            {state.device && (
              <p className="text-xs text-faint font-mono">{state.device.mac}</p>
            )}
          </div>
        </div>

        {/* Progress bar when connecting */}
        {state.phase === 'connecting' && (
          <div className="h-2 bg-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        )}

        {/* Error display */}
        {state.error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
            {state.error}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            variant={state.phase === 'connected' ? 'secondary' : 'primary'}
            onClick={() => { /* open device picker */ }}
            disabled={state.phase === 'connecting'}
          >
            {state.phase === 'connected' ? 'Switch Device' : 'Connect Device'}
          </Button>

          {state.phase === 'connected' && (
            <Button variant="danger" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}

          {state.error && (
            <Button variant="ghost" onClick={() => { /* retry */ }}>
              Retry
            </Button>
          )}
        </div>

        {/* Auto-connect toggle */}
        <div className="flex items-center gap-2 text-sm text-faint">
          <input
            type="checkbox"
            id="auto-connect"
            checked={false} // Would read from manager
            onChange={() => { /* toggle auto-connect */ }}
          />
          <label htmlFor="auto-connect">Auto-connect to last device</label>
        </div>
      </div>
    </Card>
  );
}