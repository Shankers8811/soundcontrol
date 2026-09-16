import { LATEST_RELEASE_URL, WINDOWS_DOWNLOAD_URL } from '../lib/downloads';

/** Windows-only release links shown inside the packaged desktop app. */
export function WindowsReleasePanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Windows release</p>
      <LinkAction
        title="SoundControl for Windows"
        body="SoundControl-Setup.exe · newest release"
        cta="Download .exe"
        href={WINDOWS_DOWNLOAD_URL}
      />
      <LinkAction
        title="Release notes & older versions"
        body="GitHub Releases"
        cta="Open"
        href={LATEST_RELEASE_URL}
      />
    </div>
  );
}

function LinkAction({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-wash px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="truncate text-xs text-mute">{body}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white"
      >
        {cta}
      </a>
    </div>
  );
}
