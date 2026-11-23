import { useEffect, useState } from 'react';
import { getAppVersion, isDesktop } from '../lib/appSettings';
import { LATEST_RELEASE_URL } from '../lib/downloads';
import { checkForUpdates, type UpdateCheckResult } from '../lib/reporting';
import { IconExternal, IconRefresh } from './Icons';
import { Button, Spinner } from './ui';

/**
 * Settings → Updates. Two real paths, never a fake one:
 *
 *  - Installed Windows app: the main process owns electron-updater. This card
 *    triggers a check, shows real download progress, and offers
 *    "Restart to update" once the release metadata (latest.yml) says the newer
 *    build has finished downloading.
 *  - Browser / dev: there is no updater process, so the card falls back to the
 *    read-only GitHub Releases API check and links to the release page.
 *
 * Nothing is pre-rendered as a result: every status line below appears only
 * after the main process or GitHub actually answered.
 */

const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function formatMb(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdatesSection() {
  const [version, setVersion] = useState<string>(BUILD_VERSION);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [fallback, setFallback] = useState<UpdateCheckResult | null>(null);
  const [fallbackChecking, setFallbackChecking] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  const desktopUpdater = isDesktop() && typeof api?.checkForUpdates === 'function';

  useEffect(() => {
    let stopped = false;
    if (isDesktop()) {
      void getAppVersion().then((v) => {
        if (!stopped && v) setVersion(v);
      });
    }
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (!desktopUpdater) return;
    const off = api?.onUpdateStatus?.((next) => setStatus(next));
    return () => off?.();
  }, [desktopUpdater, api]);

  const check = async () => {
    if (desktopUpdater) {
      setStatus({ state: 'checking' });
      const result = await api!.checkForUpdates!();
      if (!result.ok) {
        setStatus({ state: 'error', message: result.reason ?? 'The update check failed.' });
      }
      return;
    }
    setFallbackChecking(true);
    setFallback(null);
    const r = await checkForUpdates(version);
    setFallbackChecking(false);
    setFallback(r);
  };

  const restart = async () => {
    setInstallBusy(true);
    const result = await api?.quitAndInstall?.();
    if (!result?.ok) {
      setInstallBusy(false);
      setStatus({ state: 'error', message: result?.reason ?? 'Could not start the installer.' });
    }
  };

  const busy = status.state === 'checking' || fallbackChecking;
  const downloading = status.state === 'downloading';
  const downloaded = status.state === 'downloaded';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-mute">
          Installed version:{' '}
          <span className="font-mono font-semibold text-ink">{version}</span>
        </p>
        <span className="flex items-center gap-2">
          <Button
            size="sm"
            variant={downloaded ? 'primary' : undefined}
            disabled={busy || downloading || installBusy}
            onClick={() => void (downloaded ? restart() : check())}
          >
            {busy ? (
              <Spinner size={14} />
            ) : downloaded ? (
              <IconRefresh size={14} />
            ) : (
              <IconRefresh size={14} />
            )}
            {busy
              ? 'Checking…'
              : downloading
                ? 'Downloading…'
                : downloaded
                  ? 'Restart to update'
                  : 'Check for updates'}
          </Button>
          <a
            href={LATEST_RELEASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 text-xs font-semibold text-accent-soft transition-colors hover:border-accent/50"
          >
            Releases <IconExternal size={12} />
          </a>
        </span>
      </div>

      {busy && (
        <p className="text-[11px] text-faint" role="status">
          Contacting the official GitHub Releases for this repository…
        </p>
      )}

      {desktopUpdater && status.state === 'available' && (
        <p className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-ink" role="status">
          Update {status.version ?? ''} found — downloading the installer…
        </p>
      )}

      {desktopUpdater && downloading && (
        <div role="status">
          <div className="flex items-center justify-between gap-3 text-[11px] text-mute">
            <span>Downloading update{status.version ? ` ${status.version}` : ''}…</span>
            <span className="font-mono text-ink">{status.percent ?? 0}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, status.percent ?? 0))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-faint">
            {formatMb(status.transferred)}
            {status.total ? ` of ${formatMb(status.total)}` : ''}
          </p>
        </div>
      )}

      {desktopUpdater && downloaded && (
        <p className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-ink" role="status">
          Update {status.version ?? ''} is ready. Choose <span className="font-semibold">Restart to update</span> —
          the installer upgrades this installation in place and reopens SoundControl.
        </p>
      )}

      {desktopUpdater && status.state === 'error' && (
        <p className="rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn" role="status">
          The update check failed: {status.message ?? 'unknown error'}. No update state is claimed either
          way — try again when the network is available.
        </p>
      )}

      {!desktopUpdater && fallback && !fallbackChecking && (
        <div role="status">
          {fallback.kind === 'latest' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              You are on the latest release{' '}
              <span className="font-mono text-ink">{fallback.release.tag}</span>. Nothing to do.
            </p>
          )}
          {fallback.kind === 'available' && (
            <p className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-ink">
              A newer release is available:{' '}
              <span className="font-mono font-semibold">{fallback.release.tag}</span> (installed:{' '}
              <span className="font-mono">{version}</span>).{' '}
              <a
                href={fallback.release.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-accent-soft underline-offset-2 hover:underline"
              >
                open the release <IconExternal size={11} />
              </a>{' '}
              and run the installer; it upgrades in place.
            </p>
          )}
          {fallback.kind === 'none' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              No releases have been published for this repository yet — there is nothing to compare
              against. This is the repository's real answer, not a failure.
            </p>
          )}
          {fallback.kind === 'unconfigured' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              Update checking is not configured: this build has no repository URL to query.
            </p>
          )}
          {fallback.kind === 'error' && (
            <p className="rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
              The check failed: {fallback.message}. No update state is claimed either way — try again
              when the network is available.
            </p>
          )}
        </div>
      )}

      {!busy && !downloading && !downloaded && status.state !== 'error' && !fallback && (
        <p className="text-[11px] leading-relaxed text-faint">
          SoundControl checks the official GitHub Releases when it starts and when you press the
          button above. There is no background service, and nothing installs without your click.
        </p>
      )}
    </div>
  );
}
