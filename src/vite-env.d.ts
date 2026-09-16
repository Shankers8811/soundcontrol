/// <reference types="vite/client" />

// Injected by Vite from the canonical GitHub repository URL.
declare const __REPO_URL__: string;

interface Window {
  // Exposed by preload.cjs inside the packaged Windows desktop app.
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    version: string;
    /** Per-session bridge secret, minted by the main process. */
    getBridgeToken?: () => Promise<string>;
  };
}
