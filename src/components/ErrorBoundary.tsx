import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Last line of defence: a renderer bug must never leave the user staring at a
 * blank Electron window with no explanation. Shows the error, offers a
 * reload, and keeps the stack visible for bug reports (the diagnostics
 * console log is still the richer source — Settings → export).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SoundControl crashed:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#0b0d12',
            color: '#e8eaf0',
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: '100%',
              background: '#151821',
              borderRadius: 16,
              padding: 24,
              border: '1px solid #2a2f3d',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <p style={{ color: '#9aa1ad' }}>
              SoundControl hit an unexpected error. Your earbuds are unaffected —
              reconnecting after a reload is safe.
            </p>
            <pre
              style={{
                background: '#0b0d12',
                padding: 12,
                borderRadius: 8,
                overflow: 'auto',
                fontSize: 12,
                color: '#fb7185',
              }}
            >
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reload app
            </button>
            <details style={{ marginTop: 16, color: '#9aa1ad', fontSize: 12 }}>
              <summary>Technical details (attach to bug reports)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
