import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The renderer is packaged inside the Windows Electron application. This URL
// is used only by the in-app Windows release links.
const REPO_URL = 'https://github.com/Shankers8811/soundcontrol';

// The real application version, read from package.json at build time — the
// About page shows this (and cross-checks it against app.getVersion()).
const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;

export default defineConfig({
  base: './',
  define: {
    __REPO_URL__: JSON.stringify(REPO_URL),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    sourcemap: true,
  },
});
