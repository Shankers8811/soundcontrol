#!/usr/bin/env node
/**
 * Phase 1 device-profile tests.
 *
 * Covers the executable schema contract and the main-process folder engine:
 *
 *   1. the JSON Schema and validator agree on every enum;
 *   2. the built-in generic fallback and a realistic R50i NC profile validate;
 *   3. cross-field rules reject profiles that would otherwise send an
 *      undocumented frame (wrong band count, ANC level on a classic layout,
 *      case battery mismatch, fallback with match names, prototype keys);
 *   4. the folder reader reports per-file errors instead of failing the whole
 *      folder, ignores non-JSON files, rejects oversized files, and detects
 *      duplicate ids / names;
 *   5. the watcher emits a fresh snapshot after a profile is added or removed.
 *
 * Run: npm run test:profiles
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = require('../shared/device-profile-validate.cjs');
const store = require('../electron/deviceProfiles.cjs');

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waitFor(predicate, timeoutMs) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolvePromise(true);
      if (Date.now() - started >= timeoutMs) return resolvePromise(false);
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'soundcontrol-profiles-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fixturePath = join(ROOT, 'scripts', 'fixtures', 'profiles', 'soundcore-r50i-nc.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

/* ------------------------------------------------------- schema contract */

console.log('\nSchema contract');

const schema = JSON.parse(readFileSync(join(ROOT, 'shared', 'device-profile.schema.json'), 'utf8'));

eq(
  'schema and validator agree on ANC layouts',
  schema.properties.features.properties.anc.properties.layout.enum,
  [...validator.SUPPORTED_ANC_LAYOUTS],
);
eq(
  'schema and validator agree on EQ commands',
  schema.properties.features.properties.eq.properties.command.enum,
  [...validator.SUPPORTED_EQ_COMMANDS, null],
);
eq(
  'schema and validator agree on EQ band counts',
  schema.properties.features.properties.eq.properties.bands.enum,
  [...new Set(Object.values(validator.EQ_BANDS_BY_COMMAND))],
);
eq(
  'schema and validator agree on device kinds',
  schema.properties.kind.enum,
  [...validator.SUPPORTED_KINDS],
);
eq(
  'schema and validator agree on device families',
  schema.properties.family.enum,
  [...validator.SUPPORTED_FAMILIES],
);
eq(
  'schema and validator agree on voice-prompt frames',
  schema.properties.features.properties.voicePrompt.oneOf[1].properties.setFrame.enum,
  [...validator.SUPPORTED_VOICE_PROMPT_FRAMES],
);

const genericPath = join(ROOT, 'profiles', 'generic_unknown.json');
const generic = JSON.parse(readFileSync(genericPath, 'utf8'));
const genericResult = validator.validateProfileDocument(generic);
check('built-in generic profile validates', genericResult.ok, JSON.stringify(genericResult.errors));
check('built-in generic is the fallback', generic.match.fallback === true);
check('built-in generic has no ANC/EQ controls', generic.features.anc.layout === 'none' && generic.features.eq.command === null);

const fixtureResult = validator.validateProfileDocument(fixture);
check('R50i NC fixture validates', fixtureResult.ok, JSON.stringify(fixtureResult.errors));

/* --------------------------------------------------------- cross-field */

console.log('\nCross-field validation');

function expectError(label, mutate, code, path) {
  const doc = clone(fixture);
  mutate(doc);
  const result = validator.validateProfileDocument(doc);
  const hit = result.errors.find((entry) => entry.code === code && (!path || entry.path === path));
  check(label, !result.ok && !!hit, JSON.stringify(result.errors));
}

expectError(
  'rejects an undocumented ANC layout',
  (doc) => {
    doc.features.anc.layout = 'made-up';
  },
  'E_ENUM',
  '$.features.anc.layout',
);

expectError(
  'rejects a 10-band curve on 02:81',
  (doc) => {
    doc.features.eq.command = '02:81';
  },
  'E_CROSS_FIELD',
  '$.features.eq.bands',
);

expectError(
  'rejects manual ANC levels on a classic layout',
  (doc) => {
    doc.features.anc.layout = 'classic';
    doc.features.anc.levels = { min: 1, max: 5 };
  },
  'E_CROSS_FIELD',
  '$.features.anc.levels',
);

expectError(
  'rejects case battery without a state offset',
  (doc) => {
    doc.features.battery.case = true;
  },
  'E_CROSS_FIELD',
  '$.state.batteryCase',
);

expectError(
  'rejects a fallback profile that claims match names',
  (doc) => {
    doc.match.fallback = true;
    doc.match.names = ['R50i NC'];
  },
  'E_CROSS_FIELD',
  '$.match.fallback',
);

expectError(
  'rejects defaultBands with the wrong length',
  (doc) => {
    doc.features.eq.defaultBands = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  },
  'E_LENGTH',
  '$.features.eq.defaultBands',
);

expectError(
  'rejects a defaultBand outside rangeDb',
  (doc) => {
    doc.features.eq.defaultBands[0] = 7;
  },
  'E_RANGE',
  '$.features.eq.defaultBands[0]',
);

expectError(
  'rejects an over-ear profile with a right-ear battery offset',
  (doc) => {
    doc.kind = 'overear';
    doc.family = 'classic';
  },
  'E_CROSS_FIELD',
  '$.state.batteryRight',
);

expectError(
  'rejects soundModeLength without soundModes',
  (doc) => {
    doc.state.soundModes = null;
  },
  'E_CROSS_FIELD',
  '$.state.soundModeLength',
);

expectError(
  'rejects adaptive sensitivity when adaptive is false',
  (doc) => {
    doc.features.anc.adaptive = false;
  },
  'E_CROSS_FIELD',
  '$.features.anc.adaptiveSensitivity',
);

const pollutedText = JSON.stringify(fixture).replace('{', '{"__proto__":{"evil":true},');
const polluted = validator.parseProfileText(pollutedText, 'polluted.json');
check(
  'rejects prototype-pollution keys',
  !polluted.ok && polluted.errors.some((entry) => entry.code === 'E_FORBIDDEN_KEY'),
  JSON.stringify(polluted.errors),
);

const bom = validator.parseProfileText(`\uFEFF${JSON.stringify(fixture)}`, 'bom.json');
check('accepts a UTF-8 BOM', bom.ok, JSON.stringify(bom.errors));

/* ------------------------------------------------------------- folder */

console.log('\nFolder reader');

await withTemp((userData) => {
  const snapshot = store.readProfiles(userData);
  check('creates the device_profiles folder', snapshot.exists);
  check('folder path ends with device_profiles', snapshot.folder.endsWith('device_profiles'));
  check('writes an offline README', existsSync(join(snapshot.folder, 'README.txt')));
  eq('empty folder has no user profiles', snapshot.profiles.length, 0);
  eq('empty folder has no errors', snapshot.errors.length, 0);
  eq('built-in fallback is available', snapshot.builtin.length, 1);
  eq('built-in fallback id', snapshot.builtin[0].id, 'generic-unknown');
  eq('built-in fallback is marked builtin', snapshot.builtin[0].builtin, true);
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  copyFileSync(fixturePath, join(first.folder, 'soundcore-r50i-nc.json'));
  const snapshot = store.readProfiles(userData);
  eq('loads one valid profile', snapshot.counts.valid, 1);
  eq('reports no errors for a valid profile', snapshot.errors.length, 0);
  eq('profile id is preserved', snapshot.profiles[0].id, 'soundcore-r50i-nc');
  eq('profile document is returned', snapshot.profiles[0].document.features.anc.layout, 'tws-p30i');
  eq('profile match names are summarized', snapshot.profiles[0].matchNames, ['P30i', 'R50i NC', 'A3959']);
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  writeFileSync(join(first.folder, 'broken.json'), '{ this is not json');
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'broken.json');
  check('reports invalid JSON per file', issue?.code === 'E_JSON', JSON.stringify(snapshot.errors));
  eq('invalid file is not loaded', snapshot.counts.valid, 0);
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  const bad = clone(fixture);
  bad.features.anc.layout = 'made-up';
  writeFileSync(join(first.folder, 'bad-layout.json'), JSON.stringify(bad));
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'bad-layout.json');
  check(
    'reports the exact schema path',
    issue?.code === 'E_ENUM' && issue.path === '$.features.anc.layout',
    JSON.stringify(snapshot.errors),
  );
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  copyFileSync(fixturePath, join(first.folder, 'a.json'));
  copyFileSync(fixturePath, join(first.folder, 'b.json'));
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'b.json');
  check('detects duplicate ids', issue?.code === 'E_DUPLICATE', JSON.stringify(snapshot.errors));
  eq('only the first duplicate is loaded', snapshot.counts.valid, 1);
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  copyFileSync(fixturePath, join(first.folder, 'a.json'));
  const second = clone(fixture);
  second.id = 'soundcore-r50i-nc-copy';
  writeFileSync(join(first.folder, 'b.json'), JSON.stringify(second));
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'b.json');
  check('detects duplicate match names', issue?.code === 'E_DUPLICATE', JSON.stringify(snapshot.errors));
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  writeFileSync(join(first.folder, 'huge.json'), 'x'.repeat(validator.LIMITS.maxFileBytes + 1));
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'huge.json');
  check('rejects oversized files', issue?.code === 'E_FILE_SIZE', JSON.stringify(snapshot.errors));
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  writeFileSync(join(first.folder, 'notes.txt'), 'not a profile');
  const snapshot = store.readProfiles(userData);
  eq('ignores non-JSON files', snapshot.counts.files, 0);
  eq('non-JSON files are not errors', snapshot.errors.length, 0);
});

await withTemp((userData) => {
  const first = store.readProfiles(userData);
  mkdirSync(join(first.folder, 'folder.json'));
  const snapshot = store.readProfiles(userData);
  const issue = snapshot.errors.find((entry) => entry.file === 'folder.json');
  check('rejects a directory named like a profile', issue?.code === 'E_FILE_TYPE', JSON.stringify(snapshot.errors));
});

/* ------------------------------------------------------------ watcher */

console.log('\nFolder watcher');

await withTemp(async (userData) => {
  const events = [];
  const watcherErrors = [];
  const watcher = store.startProfilesWatcher(
    userData,
    (snapshot) => events.push(snapshot),
    { debounceMs: 50, onError: (err) => watcherErrors.push(err) },
  );

  try {
    copyFileSync(fixturePath, join(store.profilesDir(userData), 'soundcore-r50i-nc.json'));
    const added = await waitFor(() => events.length > 0, 4000);
    check('watcher emits after a profile is added', added, watcherErrors.map(String).join('; '));
    if (added) {
      const latest = events[events.length - 1];
      check(
        'watcher snapshot contains the new profile',
        latest.profiles.some((profile) => profile.id === 'soundcore-r50i-nc'),
      );
    }

    const beforeRemove = events.length;
    rmSync(join(store.profilesDir(userData), 'soundcore-r50i-nc.json'));
    const removed = await waitFor(() => events.length > beforeRemove, 4000);
    check('watcher emits after a profile is removed', removed);
    if (removed) {
      const latest = events[events.length - 1];
      eq('removed profile is gone from the snapshot', latest.profiles.length, 0);
    }
  } finally {
    watcher.close();
  }
});

/* ------------------------------------------------------------- summary */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
