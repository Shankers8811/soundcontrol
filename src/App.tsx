import { DesktopShell } from './components/DesktopShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './state/store';

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <DesktopShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
