// Direct-download links for the published Windows app.
//
// The tag-triggered "Release Windows" workflow (.github/workflows/release-windows.yml)
// builds the standard NSIS installer and attaches it to the newest GitHub
// Release under a stable, URL-safe name:
//   installer: SoundControl-Setup-<version>.exe
// GitHub's "/releases/latest/download/<asset>" route always points at the
// assets of the latest Release, so these links stay valid as versions ship.
export const REPO_URL = __REPO_URL__;
export const APP_VERSION = __APP_VERSION__;

export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
export const RELEASES_URL = `${REPO_URL}/releases`;

function releaseAsset(assetName: string): string {
  return `${REPO_URL}/releases/latest/download/${encodeURIComponent(assetName)}`;
}

export const WINDOWS_DOWNLOAD_URL = releaseAsset(`SoundControl-Setup-${APP_VERSION}.exe`);
