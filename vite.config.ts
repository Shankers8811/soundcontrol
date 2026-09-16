import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The renderer is packaged inside the Windows Electron application. This URL
// is used only by the in-app Windows release links.
const REPO_URL = 'https://github.com/Shankers8811/soundcontrol';

export default defineConfig({
  base: './',
  define: {
    __REPO_URL__: JSON.stringify(REPO_URL),
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
