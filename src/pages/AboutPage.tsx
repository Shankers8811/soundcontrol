import { useEffect, useState } from 'react';
import { getAppVersion, isDesktop } from '../lib/appSettings';
import { LATEST_RELEASE_URL, REPO_URL, WINDOWS_DOWNLOAD_URL } from '../lib/downloads';
import { IconExternal, IconLogo } from '../components/Icons';
import { Card, PageHeader } from '../components/ui';

/**
 * About page (PART Q) — real information only.
 *
 * The version is the actual application version (package.json via Vite in
 * the renderer, app.getVersion() in the desktop app — they are the same
 * string in a packaged build). Both links are real, working URLs to this
 * project's GitHub. There is deliberately no "check for updates",
 * "privacy policy" or "contact support" button: the app has no update
 * channel, no policy page and no support desk, and a button that pretended
 * otherwise would be exactly the fake UI this build forbids.
 */

// Vite injects the real version at build time; fall back to the Electron
// main process (same value in a packaged app), then to an honest "dev".
const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function AboutPage() {
  const [version, setVersion] = useState<string>(BUILD_VERSION);

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

  return (
    <div>
      <PageHeader title="About" />

      <div className="max-w-3xl space-y-4">
        <Card>
          <div className="flex items-start gap-5">
            <IconLogo size={64} />
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-ink">SoundControl</h2>
              <p className="mt-0.5 font-mono text-xs text-accent-soft">version {version} · Windows desktop</p>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                Desktop controls for Anker Soundcore earbuds and headphones over Bluetooth RFCOMM —
                noise control, equalizer presets and custom curves, gaming mode, LDAC, dual
                connection, live per-earbud battery, and a full protocol diagnostics console.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                Every command SoundControl sends is a byte-verified frame from public captures of
                the official apps; features the protocol does not document are shown as
                unavailable rather than faked.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Project">
            <ul className="space-y-2 text-xs text-mute">
              <li className="flex items-center justify-between gap-3">
                <span>Source code & issue tracker</span>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 font-semibold text-accent-soft transition-colors hover:border-accent/50"
                >
                  GitHub <IconExternal size={12} />
                </a>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Windows installer (latest release)</span>
                <a
                  href={WINDOWS_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 font-semibold text-accent-soft transition-colors hover:border-accent/50"
                >
                  Download .exe <IconExternal size={12} />
                </a>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Release notes & older versions</span>
                <a
                  href={LATEST_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 font-semibold text-accent-soft transition-colors hover:border-accent/50"
                >
                  Releases <IconExternal size={12} />
                </a>
              </li>
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              Updating is manual by design: download the newest installer and run it — the NSIS
              setup upgrades in place. There is no background updater, so no update button.
            </p>
          </Card>

          <Card title="License & credits">
            <p className="text-xs leading-relaxed text-mute">
              SoundControl is free, open-source software under the{' '}
              <span className="font-semibold text-ink">MIT License</span> — see the LICENSE file in
              the repository for the full text.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-mute">
              Protocol knowledge is derived from public community research (OpenSCQ30,
              SoundcoreDesktop, Noiseclapper-GNOME, soundcorebridge and others), credited frame by
              frame in <span className="font-mono text-[11px] text-ink/80">PROTOCOL.md</span>.
            </p>
            <p className="mt-3 rounded-lg border border-edge bg-sunken px-3 py-2.5 text-[11px] leading-relaxed text-faint">
              SoundControl is an independent, unofficial project. It is not affiliated with,
              endorsed by, or sponsored by Anker Innovations or the soundcore brand. “Soundcore”
              and product names are used nominatively to describe compatibility.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
