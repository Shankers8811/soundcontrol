#!/usr/bin/env node
/**
 * Build `build/icon.ico` — the Windows icon for the installed executable, its
 * desktop/Start-menu shortcuts, the taskbar entry and the NSIS
 * installer/uninstaller/header — from the committed, monogram-rendered PNGs.
 *
 *   node scripts/generate-ico.mjs      (npm run icons)
 *
 * No dependency: the PNGs are decoded with node:zlib and written as 32-bit DIB
 * ICO entries (Windows Vista+ reads these directly; electron-builder/rcedit
 * embed the same file in the exe). Sizes match what the task requires:
 * 16, 32, 48, 64, 128, 256. The 256×256 entry is what electron-builder
 * validates, and the small sizes are what Explorer actually shows.
 *
 * `scripts/generate-icons.mjs` calls this after re-rendering the PNGs from the
 * vector source, so both stay in step.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngRgba, encodeIco } from './lib/ico.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
export const ICO_PATH = join(ROOT, 'build', 'icon.ico');
export const ICO_SIZES = [16, 32, 48, 64, 128, 256];

export function buildIco() {
  const entries = ICO_SIZES.map((size) => {
    const png = join(ROOT, 'public', `icon-${size}.png`);
    if (!existsSync(png)) throw new Error(`missing ${png} — run scripts/generate-icons.mjs first`);
    const { width, height, rgba } = decodePngRgba(readFileSync(png));
    if (width !== size || height !== size) throw new Error(`${png} is ${width}×${height}, expected ${size}×${size}`);
    return { size, rgba };
  });
  return encodeIco(entries);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ico = buildIco();
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  writeFileSync(ICO_PATH, ico);
  console.log(`  wrote build/icon.ico (${ICO_SIZES.join(', ')} — ${ico.length} bytes)`);
}
