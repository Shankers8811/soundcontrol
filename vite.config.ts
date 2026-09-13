import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
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
