#!/usr/bin/env node
/**
 * Stage the official "Python embeddable package" for Windows (x64) into
 * python-embed/ so electron-builder can ship it as an extra resource.
 *
 * Why: the desktop app talks to earbuds that are already paired with Windows
 * through a tiny local RFCOMM bridge written in Python. Requiring users to
 * install Python themselves was friction we don't want — the installer now
 * carries the runtime, so the bridge starts out of the box. Nothing is added
 * to PATH and the runtime only runs inside SoundControl.
 *
 * Behaviour:
 *   - Windows  : REQUIRED. Downloads + extracts the embeddable zip.
 *                (CI sets SOUNDCONTROL_PYTHON_REQUIRED=1 to make a failure
 *                 hard-fail instead of silently shipping a bridge-less build.)
 *   - Other OS : skipped — local `electron-builder --win` runs keep working
 *                on Linux/macOS (releases are built on windows-latest anyway).
 *
 * Overridable via env:
 *   SOUNDCONTROL_PYTHON_INDEX     base URL to list/download from
 *   SOUNDCONTROL_PYTHON_REQUIRED  '1' → exit non-zero when staging fails
 */
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'python-embed');
const marker = path.join(outDir, 'VERSION.txt');

const INDEX = (process.env.SOUNDCONTROL_PYTHON_INDEX || 'https://www.python.org/ftp/python/').replace(/\/*$/, '/');
const REQUIRED = process.env.SOUNDCONTROL_PYTHON_REQUIRED === '1';
const FALLBACKS = ['3.12.10', '3.12.9', '3.12.8', '3.12.7', '3.11.9'];

const log = (msg) => console.log(`[python-embed] ${msg}`);
const warn = (msg) => console.warn(`[python-embed] ${msg}`);
const isWindows = process.platform === 'win32';

function giveUp(message) {
  if (REQUIRED) {
    console.error(`[python-embed] FATAL: ${message}`);
    process.exit(1);
  }
  warn(`${message} — continuing without the bundled runtime (CI sets SOUNDCONTROL_PYTHON_REQUIRED=1 to make this fatal).`);
  mkdirSync(outDir, { recursive: true });
}

function hasRuntime() {
  try {
    return statSync(path.join(outDir, 'python.exe')).size > 0;
  } catch {
    return false;
  }
}

function installedVersion() {
  try {
    return readFileSync(marker, 'utf8').trim();
  } catch {
    return null;
  }
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error(`suspiciously small download (${buf.length} bytes) from ${url}`);
  return buf;
}

/** Newest 3.1x release available on the index, e.g. "3.12.10". */
async function discoverLatest() {
  const res = await fetch(INDEX, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${INDEX}`);
  const html = await res.text();
  const versions = [...html.matchAll(/href="(3\.1[1234]\.\d+)\/"/g)].map((m) => m[1]);
  versions.sort((a, b) => {
    const [am, an, ap] = a.split('.').map(Number);
    const [bm, bn, bp] = b.split('.').map(Number);
    return bm - am || bn - an || bp - ap;
  });
  return versions[0] ?? null;
}

function extract(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (isWindows) {
    // bsdtar ships with Windows 10+ and reads .zip archives.
    const r = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`tar extraction failed (exit ${r.status})`);
    return;
  }
  let r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' });
  if (r.error && r.error.code === 'ENOENT') {
    r = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
  }
  if (r.status !== 0 || r.error) throw new Error(`extraction failed (${r.error ? r.error.message : `exit ${r.status}`})`);
}

async function main() {
  // Stage on Windows hosts, and anywhere when explicitly required (CI, tests).
  if (!isWindows && !REQUIRED) {
    log('not a Windows build host — nothing to stage (CI builds the installer on windows-latest).');
    // Keep the electron-builder extraResources source valid on any host.
    mkdirSync(outDir, { recursive: true });
    return;
  }
  if (hasRuntime() && installedVersion()) {
    log(`already staged: Python ${installedVersion()} in python-embed/ — reusing it.`);
    return;
  }

  let candidates = [];
  try {
    const latest = await discoverLatest();
    if (latest) candidates.push(latest);
    log(`index reports Python ${latest ?? '(unknown)'} as newest`);
  } catch (err) {
    warn(`could not list ${INDEX} (${err.message}); falling back to known versions`);
  }
  for (const v of FALLBACKS) if (!candidates.includes(v)) candidates.push(v);

  let zip = null;
  for (const version of candidates) {
    const url = `${INDEX}${version}/python-${version}-embed-amd64.zip`;
    try {
      log(`downloading ${url}`);
      zip = { version, buf: await download(url) };
      log(`got Python ${version} (${(zip.buf.length / 1e6).toFixed(1)} MB)`);
      break;
    } catch (err) {
      warn(`failed: ${err.message}`);
    }
  }
  if (!zip) {
    giveUp('no Python embeddable package could be downloaded');
    return;
  }

  const zipPath = path.join(mkdtempSync(path.join(tmpdir(), 'soundcontrol-py-')), 'embed.zip');
  writeFileSync(zipPath, zip.buf);

  // Extract to a temp dir first so a failed run never leaves a half-written runtime.
  const staging = path.join(root, 'python-embed.tmp');
  rmSync(staging, { recursive: true, force: true });
  try {
    extract(zipPath, staging);
    if (statSync(path.join(staging, 'python.exe')).size === 0) throw new Error('python.exe missing from archive');
    writeFileSync(path.join(staging, 'VERSION.txt'), `${zip.version}\n`);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    giveUp(`could not unpack the runtime (${err.message})`);
    return;
  }

  rmSync(outDir, { recursive: true, force: true });
  renameSync(staging, outDir);
  log(`staged Python ${zip.version} → python-embed/ (ships with the installer as resources/python).`);
}

main().catch((err) => {
  giveUp(err?.stack || String(err));
});
