'use strict';

/**
 * Device-profile folder engine (Phase 1).
 *
 * Owns the only filesystem access for user-installed profiles:
 *
 *   %AppData%\soundcontrol\device_profiles\*.json
 *
 * The renderer never receives a path it can read or write arbitrarily. It
 * asks the main process for a validated snapshot over IPC; this module reads
 * direct children only, rejects symlinks/oversized files, validates every
 * document, and reports per-file errors instead of failing the whole folder.
 *
 * Nothing here downloads, executes or evaluates profile content. A profile is
 * data; the TypeScript frame builders remain the only code that can turn a
 * profile into bytes.
 */

const fs = require('fs');
const path = require('path');
const {
  LIMITS,
  SCHEMA_VERSION,
  normalizeMatchName,
  parseProfileText,
  summarizeProfile,
} = require('../shared/device-profile-validate.cjs');

const PROFILES_DIR_NAME = 'device_profiles';
const README_NAME = 'README.txt';

/**
 * The only built-in profile. It is shipped as an electron-builder
 * `extraResources` file (and lives in the repo's `profiles/` folder for
 * manual download), never as a user-installed profile. Phase 2 uses it when
 * no user profile matches, so firmware/serial/presence reads still work.
 */
const BUILTIN_PROFILE_FILES = Object.freeze(['generic_unknown.json']);

const PROJECT_URL = 'https://github.com/Shankers8811/soundcontrol';

const README_TEXT = `SoundControl — device profiles
================================

Drop Soundcore device profile .json files into this folder.
The app reads them at startup and whenever this folder changes.
It never downloads anything and never runs profile content.

Download profiles from the project's GitHub page:
${PROJECT_URL}/tree/main/profiles

Each profile must be a JSON object with "schemaVersion": 1.
The schema is documented at:
${PROJECT_URL}/blob/main/shared/device-profile.schema.json

Files that fail validation are reported by the app with the exact field and
reason; they are never partially applied.
`;

/** `%AppData%\\soundcontrol\\device_profiles` on Windows. */
function profilesDir(userData) {
  return path.join(userData, PROFILES_DIR_NAME);
}

/**
 * Create the folder on first use and leave a short, offline README. The app
 * never seeds device profiles here: an empty folder is a valid state that the
 * UI turns into "download a profile from GitHub".
 */
function ensureProfilesDir(userData) {
  const dir = profilesDir(userData);
  fs.mkdirSync(dir, { recursive: true });
  const readme = path.join(dir, README_NAME);
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, README_TEXT, 'utf8');
  }
  return dir;
}

function builtinProfilesDir() {
  const candidates = [];
  // Packaged: electron-builder extraResources -> <resources>/profiles.
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'profiles'));
  }
  // Dev: <repo>/profiles (electron/ is one level below the repo root).
  candidates.push(path.join(__dirname, '..', 'profiles'));

  for (const dir of candidates) {
    if (BUILTIN_PROFILE_FILES.some((file) => fs.existsSync(path.join(dir, file)))) return dir;
  }
  return candidates[candidates.length - 1];
}

function readBuiltinProfiles() {
  const dir = builtinProfilesDir();
  const profiles = [];
  const errors = [];

  for (const file of BUILTIN_PROFILE_FILES) {
    const abs = path.join(dir, file);
    try {
      if (!fs.existsSync(abs)) {
        errors.push({
          file,
          path: '$',
          code: 'E_MISSING',
          message: `Built-in profile ${file} is missing from the installation.`,
        });
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.size > LIMITS.maxFileBytes) {
        errors.push({
          file,
          path: '$',
          code: 'E_FILE_SIZE',
          message: `${file} is larger than ${LIMITS.maxFileBytes} bytes.`,
        });
        continue;
      }
      const parsed = parseProfileText(fs.readFileSync(abs, 'utf8'), file);
      if (!parsed.ok) {
        errors.push(...parsed.errors.map((entry) => ({ file, ...entry })));
        continue;
      }
      profiles.push({
        file,
        ...summarizeProfile(parsed.value),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        builtin: true,
        document: parsed.value,
      });
    } catch (err) {
      errors.push({
        file,
        path: '$',
        code: 'E_READ',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dir, profiles, errors };
}

function emptySnapshot(dir, message) {
  return {
    schemaVersion: SCHEMA_VERSION,
    folder: dir,
    exists: false,
    scannedAt: Date.now(),
    profiles: [],
    errors: message
      ? [{ file: null, path: '$', code: 'E_FOLDER', message }]
      : [],
    builtin: [],
    builtinErrors: [],
    counts: { files: 0, valid: 0, invalid: 0, builtin: 0 },
  };
}

/**
 * Read and validate every direct-child `.json` file in the profile folder.
 *
 * @param {string} userData  app.getPath('userData')
 * @returns {object} snapshot consumed by the renderer over IPC
 */
function readProfiles(userData) {
  const dir = profilesDir(userData);

  try {
    ensureProfilesDir(userData);
  } catch (err) {
    return emptySnapshot(dir, `Cannot create ${dir}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    folder: dir,
    exists: true,
    scannedAt: Date.now(),
    profiles: [],
    errors: [],
    builtin: [],
    builtinErrors: [],
    counts: { files: 0, valid: 0, invalid: 0, builtin: 0 },
  };

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return emptySnapshot(dir, `Cannot read ${dir}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const jsonEntries = entries
    .filter((entry) => /\.json$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));

  snapshot.counts.files = jsonEntries.length;

  if (jsonEntries.length > LIMITS.maxProfiles) {
    snapshot.errors.push({
      file: null,
      path: '$',
      code: 'E_FILE_COUNT',
      message: `Found ${jsonEntries.length} profile files; only the first ${LIMITS.maxProfiles} are read.`,
    });
    jsonEntries.length = LIMITS.maxProfiles;
  }

  const seenIds = new Map();
  const seenNames = new Map();
  let fallbackFile = null;

  for (const entry of jsonEntries) {
    const file = entry.name;
    const abs = path.join(dir, file);

    try {
      const stat = fs.lstatSync(abs);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        snapshot.errors.push({
          file,
          path: '$',
          code: 'E_FILE_TYPE',
          message: 'Only regular .json files are accepted (symlinks and folders are ignored).',
        });
        snapshot.counts.invalid++;
        continue;
      }
      if (stat.size > LIMITS.maxFileBytes) {
        snapshot.errors.push({
          file,
          path: '$',
          code: 'E_FILE_SIZE',
          message: `${file} is ${stat.size} bytes; the limit is ${LIMITS.maxFileBytes}.`,
        });
        snapshot.counts.invalid++;
        continue;
      }

      const parsed = parseProfileText(fs.readFileSync(abs, 'utf8'), file);
      if (!parsed.ok) {
        snapshot.errors.push(...parsed.errors.map((item) => ({ file, ...item })));
        snapshot.counts.invalid++;
        continue;
      }

      const doc = parsed.value;
      const idKey = String(doc.id).toLowerCase();
      if (seenIds.has(idKey)) {
        snapshot.errors.push({
          file,
          path: '$.id',
          code: 'E_DUPLICATE',
          message: `id "${doc.id}" is already used by ${seenIds.get(idKey)}.`,
        });
        snapshot.counts.invalid++;
        continue;
      }

      const matchNames = [
        ...(Array.isArray(doc.match.names) ? doc.match.names : []),
        ...(Array.isArray(doc.match.aliases) ? doc.match.aliases : []),
      ]
        .map(normalizeMatchName)
        .filter(Boolean);

      const collision = matchNames.find((name) => seenNames.has(name));
      if (collision) {
        snapshot.errors.push({
          file,
          path: '$.match.names',
          code: 'E_DUPLICATE',
          message: `The name "${collision}" is already claimed by ${seenNames.get(collision)}.`,
        });
        snapshot.counts.invalid++;
        continue;
      }

      if (doc.match.fallback === true) {
        if (fallbackFile) {
          snapshot.errors.push({
            file,
            path: '$.match.fallback',
            code: 'E_DUPLICATE',
            message: `Only one fallback profile is allowed; ${fallbackFile} already declares fallback:true.`,
          });
          snapshot.counts.invalid++;
          continue;
        }
        fallbackFile = file;
      }

      seenIds.set(idKey, file);
      for (const name of matchNames) seenNames.set(name, file);

      snapshot.profiles.push({
        file,
        ...summarizeProfile(doc),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        document: doc,
      });
      snapshot.counts.valid++;
    } catch (err) {
      snapshot.errors.push({
        file,
        path: '$',
        code: 'E_READ',
        message: err instanceof Error ? err.message : String(err),
      });
      snapshot.counts.invalid++;
    }
  }

  const builtin = readBuiltinProfiles();
  snapshot.builtin = builtin.profiles;
  snapshot.builtinErrors = builtin.errors;
  snapshot.counts.builtin = builtin.profiles.length;

  return snapshot;
}

/** Cheap change detector so the watcher does not re-send identical snapshots. */
function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    folder: snapshot.folder,
    profiles: snapshot.profiles.map((p) => [p.file, p.mtimeMs, p.size, p.id]),
    errors: snapshot.errors.map((e) => [e.file, e.code, e.message]),
    builtin: snapshot.builtin.map((p) => [p.file, p.mtimeMs, p.size, p.id]),
    builtinErrors: snapshot.builtinErrors.map((e) => [e.file, e.code, e.message]),
  });
}

/**
 * Watch the profile folder. `fs.watch` is enough on Windows for add / remove /
 * edit; every event re-reads and re-validates the whole folder, so a partial
 * write can never be mistaken for a valid profile.
 *
 * @param {string} userData
 * @param {(snapshot: object) => void} onChange
 * @param {{ debounceMs?: number, onError?: (err: Error) => void }} [options]
 */
function startProfilesWatcher(userData, onChange, options = {}) {
  const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 300;
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const dir = ensureProfilesDir(userData);

  let watcher = null;
  let timer = null;
  let retryTimer = null;
  let closed = false;
  let lastFingerprint = null;
  let lastSnapshot = null;

  const emit = (force = false) => {
    if (closed) return;
    let snapshot;
    try {
      snapshot = readProfiles(userData);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const fingerprint = snapshotFingerprint(snapshot);
    if (!force && fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    lastSnapshot = snapshot;
    try {
      onChange(snapshot);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      emit(false);
    }, debounceMs);
  };

  const arm = () => {
    if (closed) return;
    try {
      watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
        const name = filename ? String(filename) : '';
        if (name && !/\.json$/i.test(name)) return;
        schedule();
      });
      watcher.on('error', (err) => {
        onError(err instanceof Error ? err : new Error(String(err)));
        try {
          watcher?.close();
        } catch {
          /* already closed */
        }
        watcher = null;
        if (!closed) {
          retryTimer = setTimeout(arm, 1000);
          retryTimer.unref?.();
        }
      });
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      if (!closed) {
        retryTimer = setTimeout(arm, 1000);
        retryTimer.unref?.();
      }
    }
  };

  arm();

  return {
    directory: dir,
    /** Force a read even when the fingerprint is unchanged. */
    refresh: () => emit(true),
    get lastSnapshot() {
      return lastSnapshot;
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      try {
        watcher?.close();
      } catch {
        /* already closed */
      }
      watcher = null;
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  PROFILES_DIR_NAME,
  README_NAME,
  BUILTIN_PROFILE_FILES,
  profilesDir,
  ensureProfilesDir,
  readProfiles,
  readBuiltinProfiles,
  startProfilesWatcher,
};
