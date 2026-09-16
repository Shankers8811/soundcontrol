// Direct-download links for the published Windows app.
//
// The tag-triggered "Release Windows" workflow (.github/workflows/release-windows.yml)
// attaches two copies of the NSIS installer to every Release:
//   SoundControl-Setup-<version>.exe  (archival, names the exact version)
//   SoundControl-Setup.exe            (stable alias, always the newest build)
// GitHub's "/releases/latest/download/<asset>" route always points at the
// assets of the latest Release. The button below deliberately uses the STABLE
// name: embedding this build's own version would 404 for every older client
// the moment a newer Release ships.
export const REPO_URL = __REPO_URL__;
export const APP_VERSION = __APP_VERSION__;

export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
export const RELEASES_URL = `${REPO_URL}/releases`;

function releaseAsset(assetName: string): string {
  return `${REPO_URL}/releases/latest/download/${encodeURIComponent(assetName)}`;
}

export const WINDOWS_DOWNLOAD_URL = releaseAsset('SoundControl-Setup.exe');
