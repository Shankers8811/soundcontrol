// src/lib/downloads.ts
var REPO_URL = "https://github.com/Shankers8811/soundcontrol";
var LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
var RELEASE_ASSET_NAMES = {
  windows: "SoundControl-Setup.exe",
  appimage: "SoundControl.AppImage",
  deb: "SoundControl.deb"
};
function releaseAssetLinks(payload) {
  const result = {};
  if (!payload || typeof payload !== "object" || !("assets" in payload) || !Array.isArray(payload.assets)) return result;
  for (const [platform, filename] of Object.entries(RELEASE_ASSET_NAMES)) {
    const asset = payload.assets.find((a) => a && typeof a === "object" && "name" in a && a.name === filename);
    if (!asset || typeof asset.browser_download_url !== "string") continue;
    try {
      const url = new URL(asset.browser_download_url);
      const repo = new URL(REPO_URL);
      if (repo.hostname === "github.com" && url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith(`${repo.pathname}/releases/download/`) && url.pathname.endsWith(`/${filename}`)) {
        result[platform] = url.toString();
      }
    } catch {
    }
  }
  return result;
}
async function latestReleaseAssets() {
  const repo = new URL(REPO_URL);
  if (repo.protocol !== "https:" || repo.hostname !== "github.com" || !/^\/[\w.-]+\/[\w.-]+$/.test(repo.pathname)) {
    throw new Error("Release repository is not configured");
  }
  const response = await fetch(`https://api.github.com/repos${repo.pathname}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8e3)
  });
  if (!response.ok) throw new Error(`Release lookup failed (HTTP ${response.status})`);
  return releaseAssetLinks(await response.json());
}
export {
  LATEST_RELEASE_URL,
  RELEASE_ASSET_NAMES,
  REPO_URL,
  latestReleaseAssets,
  releaseAssetLinks
};
