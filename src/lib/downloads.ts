// Release links for the Windows/Linux desktop builds.
// Platform-specific assets are published on the latest GitHub release page.
export const REPO_URL = __REPO_URL__;

export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;


export const RELEASE_ASSET_NAMES = {
  windows: 'SoundControl-Setup.exe',
  appimage: 'SoundControl.AppImage',
  deb: 'SoundControl.deb',
} as const;

/** Only surface assets returned by the official release API, never guessed URLs. */
export function releaseAssetLinks(payload: unknown): Partial<Record<keyof typeof RELEASE_ASSET_NAMES, string>> {
  const result: Partial<Record<keyof typeof RELEASE_ASSET_NAMES, string>> = {};
  if (!payload || typeof payload !== 'object' || !('assets' in payload) || !Array.isArray(payload.assets)) return result;
  for (const [platform, filename] of Object.entries(RELEASE_ASSET_NAMES) as Array<[keyof typeof RELEASE_ASSET_NAMES, string]>) {
    const asset = payload.assets.find((a: unknown) => a && typeof a === 'object' && 'name' in a && a.name === filename);
    if (!asset || typeof asset.browser_download_url !== 'string') continue;
    try {
      const url = new URL(asset.browser_download_url);
      const repo = new URL(REPO_URL);
      if (repo.hostname === 'github.com' && url.protocol === 'https:' && url.hostname === 'github.com' &&
          url.pathname.startsWith(`${repo.pathname}/releases/download/`) && url.pathname.endsWith(`/${filename}`)) {
        result[platform] = url.toString();
      }
    } catch { /* invalid asset URL */ }
  }
  return result;
}

export async function latestReleaseAssets(): Promise<Partial<Record<keyof typeof RELEASE_ASSET_NAMES, string>>> {
  const repo = new URL(REPO_URL);
  if (repo.protocol !== 'https:' || repo.hostname !== 'github.com' || !/^\/[\w.-]+\/[\w.-]+$/.test(repo.pathname)) {
    throw new Error('Release repository is not configured');
  }
  const response = await fetch(`https://api.github.com/repos${repo.pathname}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Release lookup failed (HTTP ${response.status})`);
  return releaseAssetLinks(await response.json());
}
