import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './state/store';

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
