import { useEffect, useState } from 'react';
import { getAppVersion, isDesktop } from '../lib/appSettings';
import { LATEST_RELEASE_URL } from '../lib/downloads';
import { checkForUpdates, type UpdateCheckResult } from '../lib/reporting';
import { IconExternal, IconRefresh } from './Icons';
import { Button, Spinner } from './ui';

/**
 * Settings → Updates (Pass 8). Truthful by construction:
 *
 *  - "Check for updates" queries the OFFICIAL GitHub Releases API for this
 *    repository (derived from the build-time REPO_URL) — a real, trusted,
 *    read-only source. No invented update server, no fabricated versions.
 *  - The response is validated (tag must exist; html_url must be a
 *    github.com URL) before anything is displayed, and versions compare
 *    numerically against the installed one.
 *  - Every outcome is shown as what it is: up to date, newer release
 *    available (link only — installing stays manual via the real installer),
 *    no releases published, unreachable, or not configured. The app NEVER
 *    claims an update was downloaded or installed: updating is manual by
 *    design (NSIS upgrades in place).
 */

const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function UpdatesSection() {
  const [version, setVersion] = useState<string>(BUILD_VERSION);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

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

  const check = async () => {
    setChecking(true);
    setResult(null);
    const r = await checkForUpdates(version);
    setChecking(false);
    setResult(r);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-mute">
          Installed version:{' '}
          <span className="font-mono font-semibold text-ink">{version}</span>
        </p>
        <span className="flex items-center gap-2">
          <Button size="sm" disabled={checking} onClick={() => void check()}>
            {checking ? <Spinner size={14} /> : <IconRefresh size={14} />}
            {checking ? 'Checking…' : 'Check for updates'}
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

      {checking && (
        <p className="text-[11px] text-faint" role="status">
          Contacting the official GitHub releases API for this repository…
        </p>
      )}

      {result && !checking && (
        <div role="status">
          {result.kind === 'latest' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              You are on the latest release{' '}
              <span className="font-mono text-ink">{result.release.tag}</span>. Nothing to do.
            </p>
          )}
          {result.kind === 'available' && (
            <p className="rounded-lg border border-accent/40 bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-ink">
              A newer release is available:{' '}
              <span className="font-mono font-semibold">{result.release.tag}</span> (installed:{' '}
              <span className="font-mono">{version}</span>). Updating is manual by design —{' '}
              <a
                href={result.release.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-accent-soft underline-offset-2 hover:underline"
              >
                open the release <IconExternal size={11} />
              </a>{' '}
              and run the installer; it upgrades in place.
            </p>
          )}
          {result.kind === 'none' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              No releases have been published for this repository yet — there is nothing to
              compare against. This is the repository's real answer, not a failure.
            </p>
          )}
          {result.kind === 'unconfigured' && (
            <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute">
              Update checking is not configured: this build has no repository URL to query.
            </p>
          )}
          {result.kind === 'error' && (
            <p className="rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
              The check failed: {result.message}. No update state is claimed either way — try
              again when the network is available.
            </p>
          )}
        </div>
      )}

      {!result && !checking && (
        <p className="text-[11px] leading-relaxed text-faint">
          SoundControl has no background updater and never downloads anything on its own. This
          check reads the official GitHub releases for this repository and compares versions;
          installing a newer release stays a deliberate, manual action.
        </p>
      )}
    </div>
  );
}
