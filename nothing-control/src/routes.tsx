import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DevicesPage } from './pages/Devices';
import { NoiseControlPage } from './pages/NoiseControl';
import { EqualizerPage } from './pages/Equalizer';
import { BatteryPage } from './pages/Battery';
import { DiagnosticsPage } from './pages/Diagnostics';
import { SettingsPage } from './pages/Settings';

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index path="devices" element={<DevicesPage />} />
          <Route path="noise-control" element={<NoiseControlPage />} />
          <Route path="equalizer" element={<EqualizerPage />} />
          <Route path="battery" element={<BatteryPage />} />
          <Route path="diagnostics" element={<DiagnosticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};