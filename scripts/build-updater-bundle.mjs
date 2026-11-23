#!/usr/bin/env node
/**
 * Bundles electron-updater (and its runtime dependencies) into a single CJS
 * file so the packaged app ships no node_modules.
 *
 * Why this exists: `build.files` is a strict whitelist and
 * scripts/check-package-files.mjs forbids node_modules outright. The updater
 * runs in the main process (Node), so Vite cannot bundle it — esbuild does,
 * and `electron` stays external because the runtime provides it.
 *
 * Wired into `npm run build` before the packaging guard and electron-builder.
 * The output file is generated, never committed (see .gitignore).
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const entry = require.resolve('electron-updater');
const version = JSON.parse(
  readFileSync(join(ROOT, 'node_modules', 'electron-updater', 'package.json'), 'utf8'),
).version;
const outfile = join(ROOT, 'electron-updater.bundle.cjs');

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // Provided by Electron at runtime; bundling it would break the module.
  external: ['electron'],
  outfile,
  legalComments: 'none',
  logLevel: 'warning',
  banner: {
    js: `/* electron-updater ${version} bundled for SoundControl - no node_modules is shipped. */`,
  },
});

console.log(`Bundled electron-updater ${version} -> electron-updater.bundle.cjs`);
