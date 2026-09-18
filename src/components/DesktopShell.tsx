import { useApp } from '../state/store';
import { AboutPage } from '../pages/AboutPage';
import { ControlsPage } from '../pages/ControlsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DevicesPage } from '../pages/DevicesPage';
import { EqualizerPage } from '../pages/EqualizerPage';
import { SettingsPage } from '../pages/SettingsPage';
import { Sidebar } from './Sidebar';
import { InlineError } from './ui';

/**
 * Desktop application frame: fixed left sidebar + scrollable content region.
 * Page switches are pure React state changes (no window reload); the keyed
 * wrapper replays a 180ms fade/slide, and all application state lives in the
 * provider above this component, so it survives navigation.
 */
export function DesktopShell() {
  const app = useApp();

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* App-level error surface: classified, human-readable transport /
            helper / device errors from the hardened bridge stack. Never
            contains tokens (redacted at the helper, asserted in e2e). */}
        {app.error && (
          <div className="border-b border-danger/25 bg-danger/8 px-6 py-2.5">
            <InlineError message={app.error} onDismiss={app.clearError} />
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div key={app.page} className="page-enter mx-auto max-w-[1440px] px-6 py-5 xl:px-8 xl:py-6">
            {app.page === 'dashboard' && <DashboardPage />}
            {app.page === 'devices' && <DevicesPage />}
            {app.page === 'equalizer' && <EqualizerPage />}
            {app.page === 'controls' && <ControlsPage />}
            {app.page === 'settings' && <SettingsPage />}
            {app.page === 'about' && <AboutPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
