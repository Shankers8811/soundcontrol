import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

// Kept in sync with the GitHub repository so the in-app download buttons can
// deep-link to the binaries published by the Release Windows workflow.
const REPO_URL = 'https://github.com/Shankers8811/soundcontrol';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify(REPO_URL),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Permissions-Policy': 'bluetooth=*, serial=*, usb=*, hid=*, fullscreen=*',
      'Feature-Policy': 'bluetooth *',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: {
      'Permissions-Policy': 'bluetooth=*, serial=*, usb=*, hid=*, fullscreen=*',
    },
  },
  build: {
    sourcemap: true,
  },
});
