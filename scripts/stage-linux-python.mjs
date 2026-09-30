#!/usr/bin/env node
/**
 * Stage a self-contained Linux Python runtime for electron-builder.
 *
 * The packaged Linux app must not ask end users to install Python or Node.
 * The bridge has no third-party Python dependencies, so a release build can
 * carry the build host's interpreter plus its standard library and extension
 * modules. Build Linux packages on the supported Ubuntu runner/base distro so
 * the copied interpreter uses a compatible glibc.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'python-embed');

if (process.platform !== 'linux') {
  console.error('[linux-python] Linux staging must run on a Linux build host.');
  process.exit(1);
}

function runPython(code) {
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'python3 exited unsuccessfully');
  }
  return result.stdout.trim();
}

function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, force: true, dereference: true });
}

try {
  const info = JSON.parse(runPython(`
import json, os, sys, sysconfig
print(json.dumps({
  "executable": os.path.realpath(sys.executable),
  "version": f"{sys.version_info[0]}.{sys.version_info[1]}",
  "stdlib": sysconfig.get_path("stdlib"),
  "platstdlib": sysconfig.get_path("platstdlib"),
  "libdir": sysconfig.get_config_var("LIBDIR") or "",
}))
`));
  const executable = info.executable;
  if (!existsSync(executable)) throw new Error(`interpreter not found: ${executable}`);
  const stdlib = info.stdlib;
  if (!existsSync(stdlib)) throw new Error(`standard library not found: ${stdlib}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(executable, path.join(outDir, 'python3'));
  // Python's landmark search finds lib/pythonX.Y beside the relocated binary.
  copyTree(stdlib, path.join(outDir, 'lib', `python${info.version}`));

  // Keep native stdlib extensions (socket, ssl, hashlib, etc.) even when the
  // distro reports platstdlib separately from stdlib.
  if (info.platstdlib && info.platstdlib !== info.stdlib && existsSync(info.platstdlib)) {
    copyTree(info.platstdlib, path.join(outDir, 'lib', `python${info.version}`));
  }

  // Some distributions place libpython or a required shared runtime in the
  // configured libdir. Copy only matching Python shared objects, never the
  // whole system library directory.
  if (info.libdir && existsSync(info.libdir)) {
    for (const name of ['libpython.so', `libpython${info.version}.so`, `libpython${info.version}.so.1.0`]) {
      const source = path.join(info.libdir, name);
      if (existsSync(source) && lstatSync(source).isFile()) cpSync(source, path.join(outDir, name));
    }
  }

  writeFileSync(path.join(outDir, 'VERSION.txt'), `${info.version}\n`);
  const probe = spawnSync(path.join(outDir, 'python3'), ['-c', 'import json, socket, ssl, subprocess, sys; assert hasattr(socket, "AF_BLUETOOTH") and hasattr(socket, "BTPROTO_RFCOMM"); print(json.dumps({"version": sys.version.split()[0], "prefix": sys.prefix, "bluetooth_constants": True}))'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONNOUSERSITE: '1' },
  });
  if (probe.status !== 0) throw new Error(`relocated interpreter probe failed: ${probe.stderr.trim()}`);
  console.log(`[linux-python] staged Python ${info.version} at python-embed/ (${probe.stdout.trim()})`);
} catch (error) {
  console.error(`[linux-python] ${error?.stack || error}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}
