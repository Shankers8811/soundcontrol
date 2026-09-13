import { Shell } from './components/Shell';
import { AppProvider } from './state/store';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
