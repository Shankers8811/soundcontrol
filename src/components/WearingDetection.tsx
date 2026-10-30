import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Button, Card, StatusBadge } from './ui';
import type { EarbudSideState } from '../state/derive';

/**
 * Wearing Detection Component - Auto-pause/play based on earbud presence
 * Supports single-earbud mode as shown in Soundcore videos
 */
export function WearingDetection() {
  const app = useApp();
  const [showGuide, setShowGuide] = useState(false);
  const [animationState, setAnimationState] = useState<'idle' | 'checking' | 'wearing' | 'removed'>('idle');

  const { earbudState, capabilities, connected } = app;

  // Only show for TWS devices with earbud state support
  if (!connected || !capabilities.supportsEarbudState) {
    return null;
  }

  const leftState = earbudState.left.state;
  const rightState = earbudState.right.state;

  const isConnected = (state: EarbudSideState) => state === 'connected';
  const isDisconnected = (state: EarbudSideState) => state === 'disconnected';

  useEffect(() => {
    if (isConnected(leftState) && isConnected(rightState)) {
      setAnimationState('wearing');
    } else if (isDisconnected(leftState) && isDisconnected(rightState)) {
      setAnimationState('removed');
    } else if (isConnected(leftState) || isConnected(rightState)) {
      setAnimationState('wearing');
    } else {
      setAnimationState('idle');
    }
  }, [leftState, rightState]);

  const isSingleEarbud = isConnected(leftState) && isDisconnected(rightState) ||
                         isDisconnected(leftState) && isConnected(rightState);

  return (
    <Card
      title="Wearing Detection"
      subtitle="Auto-pause when removed, auto-play when worn"
      actions={
        <>
          <StatusBadge phase={app.connectionPhase} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowGuide(!showGuide)}
          >
            Guide
          </Button>
        </>
      }
    >
      {/* Wearing Animation */}
      <div className="flex items-center justify-center gap-4 py-6">
        <div className={`relative w-24 h-24 transition-all duration-300 ${animationState === 'wearing' ? 'scale-100 opacity-100' : 'scale-95 opacity-60'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Left earbud */}
            <g className={`${leftState === 'connected' ? '' : 'opacity-30'}`}>
              <ellipse cx="30" cy="50" rx="15" ry="25" fill="currentColor" opacity="0.9" />
              <ellipse cx="30" cy="42" rx="8" ry="8" fill="#fff" opacity="0.3" />
            </g>
            {/* Right earbud */}
            <g className={`${rightState === 'connected' ? '' : 'opacity-30'}`}>
              <ellipse cx="70" cy="50" rx="15" ry="25" fill="currentColor" opacity="0.9" />
              <ellipse cx="70" cy="42" rx="8" ry="8" fill="#fff" opacity="0.3" />
            </g>
            {/* Head outline */}
            <path
              d="M15 30 Q50 10 85 30 Q85 70 15 70 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.2"
            />
          </svg>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-col gap-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
            leftState === 'connected' ? 'bg-green-500/15 border-green-500/30' : 'bg-sunken border-edge'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${leftState === 'connected' ? 'bg-green-500' : 'bg-faint'}`} />
            <span className="text-sm font-medium">Left</span>
            <span className={`text-xs font-mono ${leftState === 'connected' ? 'text-green-400' : 'text-faint'}`}>
              {leftState === 'connected' ? 'Wearing' : leftState === 'disconnected' ? 'Removed' : 'Unknown'}
            </span>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
            rightState === 'connected' ? 'bg-green-500/15 border-green-500/30' : 'bg-sunken border-edge'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${rightState === 'connected' ? 'bg-green-500' : 'bg-faint'}`} />
            <span className="text-sm font-medium">Right</span>
            <span className={`text-xs font-mono ${rightState === 'connected' ? 'text-green-400' : 'text-faint'}`}>
              {rightState === 'connected' ? 'Wearing' : rightState === 'disconnected' ? 'Removed' : 'Unknown'}
            </span>
          </div>

          {isSingleEarbud && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
              <span className="text-xs font-medium text-amber-400">Single Earbud Mode</span>
              <span className="text-xs text-amber-300">Auto-pause disabled</span>
            </div>
          )}
        </div>
      </div>

      {/* Wearing Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ink">Proper Wearing Guide</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-faint hover:text-ink hover:bg-raised transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="text-center py-2">
                <div className="w-32 h-32 mx-auto mb-4 relative">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <g>
                      <ellipse cx="30" cy="50" rx="15" ry="25" fill="#4ade80" opacity="0.9" />
                      <ellipse cx="70" cy="50" rx="15" ry="25" fill="#4ade80" opacity="0.9" />
                    </g>
                    <path
                      d="M15 30 Q50 10 85 30 Q85 70 15 70 Z"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="2"
                      opacity="0.5"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl">✓</span>
                  </div>
                </div>
                <p className="font-semibold text-ink">Correct Position</p>
              </div>

              <div className="space-y-3 text-sm text-muted">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">1</span>
                  <div>
                    <p className="font-medium text-ink">Align with ear canal</p>
                    <p className="text-xs text-muted">Point the earbud tip toward your ear canal opening</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">2</span>
                  <div>
                    <p className="font-medium text-ink">Twist to lock</p>
                    <p className="text-xs text-muted">Gently twist the earbud backward until it locks securely</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">3</span>
                  <div>
                    <p className="font-medium text-ink">Check seal</p>
                    <p className="text-xs text-muted">You should feel a gentle seal - no gaps around the ear tip</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">!</span>
                  <div>
                    <p className="font-medium text-ink">Single earbud mode</p>
                    <p className="text-xs text-muted">Remove one earbud to enable mono mode - audio plays in the worn earbud only</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-edge">
                  <p className="text-xs text-faint">
                    Tip: Use the Ear Tip Fit Test in the app to verify proper seal and get the best noise cancellation.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-accent text-ink font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}