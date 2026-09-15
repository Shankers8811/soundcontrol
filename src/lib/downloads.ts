// Direct-download links for the published Windows binaries.
//
// The tag-triggered "Release Windows" workflow (.github/workflows/release-windows.yml)
// builds the NSIS installer and the portable .exe and attaches both to the
// newest GitHub Release. GitHub's "/releases/latest/download/<asset>" route
// always points at the assets of the latest Release, so these links stay valid
// as new versions ship. The asset names come from electron-builder's defaults
// for productName "SoundControl":
//   installer: SoundControl Setup <version>.exe
//   portable:  SoundControl <version>.exe
export const REPO_URL = __REPO_URL__;
export const APP_VERSION = __APP_VERSION__;

export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
export const RELEASES_URL = `${REPO_URL}/releases`;

function releaseAsset(assetName: string): string {
  return `${REPO_URL}/releases/latest/download/${encodeURIComponent(assetName)}`;
}

export const WINDOWS_INSTALLER_URL = releaseAsset(`SoundControl Setup ${APP_VERSION}.exe`);
export const WINDOWS_PORTABLE_URL = releaseAsset(`SoundControl ${APP_VERSION}.exe`);
