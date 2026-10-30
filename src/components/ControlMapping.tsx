import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Card, Button, StatusBadge } from './ui';
import { DEVICES } from '../protocol/devices';
import { matchDevice } from '../protocol/devices';

/**
 * Touch/Button Control Mapping - Visual guide for device controls
 * Based on Soundcore Support videos showing touch/button controls
 */
export function ControlMapping() {
  const app = useApp();
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const { connected, profile, capabilities } = app;

  if (!connected) return null;

  const device = DEVICES.find(d => d.id === profile.id);
  const isAeroClip = profile.id === 'aeroclip';
  const isAeroFit = profile.id?.includes('aerofit');
  const isP30i = profile.id === 'p30i';
  const isR50i = profile.id === 'p20i';

  // Touch control mapping based on device
  const touchControls = getTouchControls(profile.id);
  const buttonControls = getButtonControls(profile.id);

  return (
    <Card
      title="Control Mapping"
      subtitle="Touch & button controls for your device"
      actions={
        <StatusBadge phase="connected" />
      }
    >
      <div className="space-y-4">
        {/* Touch Controls */}
        {touchControls.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-ink">Touch Controls</h4>
            <div className="space-y-2">
              {touchControls.map((control, index) => (
                <div
                  key={index}
                  className="relative rounded-xl border border-edge bg-sunken p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                      <span className="text-xl">{getTouchIcon(control.action)}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{control.action}</p>
                      <p className="text-sm text-muted">{control.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {control.gestures.map(g => (
                          <span
                            key={g}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent/15 text-accent"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDetails(showDetails === control.action ? null : control.action)}
                      className="ml-auto p-1 rounded-lg text-faint hover:text-ink hover:bg-raised transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Button Controls (for AeroClip 2, etc.) */}
        {buttonControls.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-ink">Button Controls</h4>
            <div className="space-y-2">
              {buttonControls.map((control, index) => (
                <div
                  key={index}
                  className="relative rounded-xl border border-edge bg-sunken p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                      <span className="text-xl">🔘</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{control.button}</p>
                      <p className="text-sm text-muted">{control.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {control.actions.map(a => (
                          <span
                            key={a}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-purple-500/15 text-purple-400"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Reference Card */}
        <div className="rounded-xl border border-edge bg-sunken p-4">
          <h4 className="font-semibold text-ink mb-3">Quick Reference</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-edge bg-sunken p-3">
              <p className="font-medium text-ink mb-1">Single Tap</p>
              <p className="text-sm text-muted">Play/Pause, Answer Call</p>
            </div>
            <div className="rounded-xl border border-edge bg-sunken p-3">
              <p className="font-medium text-ink mb-1">Double Tap</p>
              <p className="text-sm text-muted">Next Track, End Call</p>
            </div>
            <div className="rounded-xl border border-edge bg-sunken p-3">
              <p className="font-medium text-ink mb-1">Triple Tap</p>
              <p className="text-sm text-muted">Previous Track, Voice Assistant</p>
            </div>
            <div className="rounded-xl border border-edge bg-sunken p-3">
              <p className="font-medium text-ink mb-1">Long Press (2s)</p>
              <p className="text-sm text-muted">ANC Toggle, Reject Call</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Helper functions
function getTouchControls(profileId: string) {
  const controls: Record<string, Array<{
    action: string;
    description: string;
    gestures: string[];
  }>> = {
    'p30i': [
      { action: 'Single Tap', description: 'Play/Pause, Answer/End Call', gestures: ['Tap once'] },
      { action: 'Double Tap', description: 'Next Track / Answer Call', gestures: ['Double tap'] },
      { action: 'Triple Tap', description: 'Previous Track / Voice Assistant', gestures: ['Triple tap'] },
      { action: 'Long Press (2s)', description: 'ANC Toggle / Reject Call', gestures: ['Hold 2s'] },
    ],
    'p20i': [
      { action: 'Single Tap', description: 'Play/Pause, Answer/End Call', gestures: ['Tap once'] },
      { action: 'Double Tap', description: 'Next Track / Answer Call', gestures: ['Double tap'] },
      { action: 'Triple Tap', description: 'Previous Track / Voice Assistant', gestures: ['Triple tap'] },
      { action: 'Long Press (2s)', description: 'Game Mode Toggle / Reject Call', gestures: ['Hold 2s'] },
    ],
    'aeroclip': [
      { action: 'Single Press', description: 'Play/Pause, Answer/End Call', gestures: ['Press once'] },
      { action: 'Double Press', description: 'Next Track / Answer Call', gestures: ['Double press'] },
      { action: 'Long Press (2s)', description: 'ANC Toggle / Reject Call', gestures: ['Hold 2s'] },
    ],
    'aerofit': [
      { action: 'Single Tap', description: 'Play/Pause, Answer/End Call', gestures: ['Tap once'] },
      { action: 'Double Tap', description: 'Next Track / Answer Call', gestures: ['Double tap'] },
      { action: 'Triple Tap', description: 'Previous Track / Voice Assistant', gestures: ['Triple tap'] },
      { action: 'Long Press (2s)', description: 'ANC Toggle / Reject Call', gestures: ['Hold 2s'] },
    ],
  };

  return controls[profileId] || controls['p30i'];
}

function getButtonControls(profileId: string) {
  const controls: Record<string, Array<{
    button: string;
    description: string;
    actions: string[];
  }>> = {
    'aeroclip': [
      { button: 'Left Earbud', description: 'Left earbud button', actions: ['Single: Play/Pause', 'Double: Next', 'Long: ANC'] },
      { button: 'Right Earbud', description: 'Right earbud button', actions: ['Single: Play/Pause', 'Double: Prev', 'Long: Voice Assistant'] },
    ],
    'aerofit': [
      { button: 'Left Button', description: 'Left earbud button', actions: ['Single: Play/Pause', 'Double: Next', 'Long: ANC'] },
      { button: 'Right Button', description: 'Right earbud button', actions: ['Single: Play/Pause', 'Double: Prev', 'Long: Voice Assistant'] },
    ],
  };

  return controls[profileId] || [];
}

function getTouchIcon(action: string) {
  if (action.includes('Single')) return '👆';
  if (action.includes('Double')) return '👆👆';
  if (action.includes('Triple')) return '👆👆👆';
  if (action.includes('Long') || action.includes('Hold')) return '👇';
  if (action.includes('Press')) return '👇';
  return '👆';
}