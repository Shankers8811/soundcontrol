import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerExport } from './lib/exportZip';
import {
  BRIDGE_PY,
  ELECTRON_MAIN,
  INDEX_HTML,
  PACKAGE_JSON,
  PROTOCOL,
  README,
  VITE_CONFIG,
} from './lib/embedded';
import './index.css';

registerExport('soundcore_bridge.py', BRIDGE_PY);
registerExport('electron-main.cjs', ELECTRON_MAIN);
registerExport('package.json', PACKAGE_JSON);
registerExport('vite.config.ts', VITE_CONFIG);
registerExport('index.html', INDEX_HTML);
registerExport('PROTOCOL.md', PROTOCOL);
registerExport('README.md', README);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as unknown as { deferredPrompt: Event }).deferredPrompt = e;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
