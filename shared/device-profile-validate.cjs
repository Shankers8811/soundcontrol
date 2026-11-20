'use strict';

/**
 * Device-profile validator (Phase 1).
 *
 * This is the executable contract for every `.json` file in the user's
 * `device_profiles` folder. It is deliberately dependency-free CommonJS so
 * the Electron main process can `require()` it directly — the renderer never
 * touches the filesystem, and profile content is never evaluated as code.
 *
 * The matching JSON Schema lives in `device-profile.schema.json`. Keep the
 * two in sync; `scripts/test_profiles.mjs` compares every enum.
 *
 * Design rules:
 *   - unknown keys are errors, not silently ignored (a typo should not look
 *     like a working profile);
 *   - only documented ANC layouts / EQ commands are accepted — a profile
 *     cannot invent a wire layout;
 *   - cross-field rules are enforced here (band count, case offset, fallback
 *     names, layout capabilities);
 *   - every error carries a JSON path so the UI can explain the exact field.
 */

const SCHEMA_VERSION = 1;

const LIMITS = Object.freeze({
  /** A real profile is ~2 KB; 32 KB leaves room for comments in presets. */
  maxFileBytes: 32 * 1024,
  maxProfiles: 200,
  maxNameLength: 80,
  maxMatchNameLength: 64,
  maxSourceLength: 500,
  maxStateOffset: 511,
  maxSpanLength: 64,
  maxErrorsPerProfile: 24,
});

const SUPPORTED_ANC_LAYOUTS = Object.freeze([
  'classic',
  'tws-p30i',
  'tws-l4nc',
  'tws-l3pro',
  'none',
]);

const SUPPORTED_EQ_COMMANDS = Object.freeze(['02:81', '02:83', '03:87']);
const SUPPORTED_KINDS = Object.freeze(['earbuds', 'overear']);
const SUPPORTED_FAMILIES = Object.freeze(['tws', 'classic']);
const SUPPORTED_VOICE_PROMPT_FRAMES = Object.freeze(['01:AE']);

/**
 * Which features a documented layout can actually express. A profile may
 * narrow these (e.g. P30i sets scenes:false), but it may never claim a
 * feature the layout has no byte for.
 */
const ANC_LAYOUT_CAPS = Object.freeze({
  classic: {
    levels: false,
    adaptiveSensitivity: false,
    scenes: true,
    transparency: true,
    wind: false,
    adaptive: false,
  },
  'tws-p30i': {
    levels: true,
    adaptiveSensitivity: true,
    scenes: true,
    transparency: true,
    wind: true,
    adaptive: true,
  },
  'tws-l4nc': {
    levels: true,
    adaptiveSensitivity: true,
    scenes: true,
    transparency: true,
    wind: true,
    adaptive: true,
  },
  'tws-l3pro': {
    levels: true,
    adaptiveSensitivity: true,
    scenes: false,
    transparency: true,
    wind: true,
    adaptive: true,
  },
  none: {
    levels: false,
    adaptiveSensitivity: false,
    scenes: false,
    transparency: false,
    wind: false,
    adaptive: false,
  },
});

/** EQ command → documented band count. */
const EQ_BANDS_BY_COMMAND = Object.freeze({
  '02:81': 8,
  '02:83': 10,
  '03:87': 10,
});

/** Documented hardware limits; a profile may narrow these, never exceed them. */
const ANC_LEVEL_RANGE = Object.freeze({ min: 1, max: 5 });
const ADAPTIVE_SENSITIVITY_RANGE = Object.freeze({ min: 0, max: 10 });
const EQ_DB_RANGE = Object.freeze({ min: -12, max: 12 });
const DEFAULT_EQ_DB_RANGE = Object.freeze({ min: -6, max: 6 });

const TOP_LEVEL_KEYS = Object.freeze([
  '$schema',
  'schemaVersion',
  'id',
  'name',
  'sku',
  'kind',
  'family',
  'match',
  'features',
  'state',
  'provenance',
]);

function issue(path, code, message) {
  return { path, code, message };
}

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

/**
 * Normalize a Bluetooth name for matching. `Soundcore R50i NC`, `soundcore
 * r50i-nc` and `R50i NC` all become `r50i nc`, so marketing punctuation and
 * the brand prefix cannot create a false miss.
 */
function normalizeMatchName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^soundcore\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reject keys that could poison a prototype if a future caller ever merged a
 * profile into another object. JSON.parse creates these as own properties,
 * so they are visible to Object.keys().
 */
function findForbiddenKeys(value, path, out, depth = 0) {
  // Profiles are shallow by design. Stop hostile deeply nested JSON from
  // turning this walk into a stack overflow; the structural checks below
  // still reject the document.
  if (depth > 32) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, out, depth + 1));
    return out;
  }
  if (!isPlainObject(value)) return out;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      out.push(`${path}.${key}`);
    }
    findForbiddenKeys(value[key], `${path}.${key}`, out, depth + 1);
  }
  return out;
}

/**
 * Validate a parsed profile document.
 *
 * @param {unknown} doc
 * @returns {{ ok: boolean, errors: Array<{path: string, code: string, message: string}> }}
 */
function validateProfileDocument(doc) {
  const errors = [];
  const add = (path, code, message) => {
    if (errors.length >= LIMITS.maxErrorsPerProfile) return;
    errors.push(issue(path, code, message));
  };

  const expectObject = (value, path, allowed, required = []) => {
    if (!isPlainObject(value)) {
      add(path, 'E_TYPE', `Expected an object, got ${typeName(value)}.`);
      return false;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) add(`${path}.${key}`, 'E_UNKNOWN_KEY', `Unknown key "${key}".`);
    }
    for (const key of required) {
      if (!(key in value)) add(`${path}.${key}`, 'E_REQUIRED', `Missing required key "${key}".`);
    }
    return true;
  };

  const expectBoolean = (value, path) => {
    if (typeof value !== 'boolean') {
      add(path, 'E_TYPE', `Expected true or false, got ${typeName(value)}.`);
      return false;
    }
    return true;
  };

  const expectInteger = (value, path, min, max) => {
    if (!isInteger(value)) {
      add(path, 'E_TYPE', `Expected an integer, got ${typeName(value)}.`);
      return false;
    }
    if (value < min || value > max) {
      add(path, 'E_RANGE', `Expected ${min}..${max}, got ${value}.`);
      return false;
    }
    return true;
  };

  const expectString = (value, path, min, max, pattern, patternMessage) => {
    if (typeof value !== 'string') {
      add(path, 'E_TYPE', `Expected a string, got ${typeName(value)}.`);
      return false;
    }
    const text = value.trim();
    if (text.length < min || text.length > max) {
      add(path, 'E_LENGTH', `Expected ${min}..${max} characters, got ${text.length}.`);
      return false;
    }
    if (pattern && !pattern.test(text)) {
      add(path, 'E_FORMAT', patternMessage);
      return false;
    }
    return true;
  };

  const validateRange = (value, path, hardMin, hardMax) => {
    if (!expectObject(value, path, ['min', 'max'], ['min', 'max'])) return null;
    const minOk = expectInteger(value.min, `${path}.min`, hardMin, hardMax);
    const maxOk = expectInteger(value.max, `${path}.max`, hardMin, hardMax);
    if (minOk && maxOk && value.min > value.max) {
      add(path, 'E_RANGE', 'min must be less than or equal to max.');
    }
    return minOk && maxOk ? value : null;
  };

  const validateSpan = (value, path, lengthKey = 'length', maxLength = LIMITS.maxSpanLength) => {
    if (!expectObject(value, path, ['at', lengthKey], ['at', lengthKey])) return false;
    expectInteger(value.at, `${path}.at`, 0, LIMITS.maxStateOffset);
    expectInteger(value[lengthKey], `${path}.${lengthKey}`, 1, maxLength);
    return true;
  };

  /* ------------------------------------------------------------- root */

  for (const path of findForbiddenKeys(doc, '$', [])) {
    add(path, 'E_FORBIDDEN_KEY', 'Keys named __proto__, constructor or prototype are not allowed.');
  }

  if (!expectObject(doc, '$', TOP_LEVEL_KEYS, [
    'schemaVersion',
    'id',
    'name',
    'sku',
    'kind',
    'family',
    'match',
    'features',
    'state',
    'provenance',
  ])) {
    return { ok: false, errors };
  }

  if ('$schema' in doc && typeof doc.$schema !== 'string') {
    add('$.$schema', 'E_TYPE', 'The optional $schema hint must be a string.');
  }

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    add('$.schemaVersion', 'E_VERSION', `Only schemaVersion ${SCHEMA_VERSION} is supported.`);
  }

  expectString(doc.id, '$.id', 3, 64, /^[a-z0-9][a-z0-9._-]{2,63}$/, 'Use lowercase letters, digits, dot, underscore or dash; start with a letter or digit.');
  expectString(doc.name, '$.name', 1, LIMITS.maxNameLength);

  if (!SUPPORTED_KINDS.includes(doc.kind)) {
    add('$.kind', 'E_ENUM', `Expected one of: ${SUPPORTED_KINDS.join(', ')}.`);
  }
  if (!SUPPORTED_FAMILIES.includes(doc.family)) {
    add('$.family', 'E_ENUM', `Expected one of: ${SUPPORTED_FAMILIES.join(', ')}.`);
  }

  /* ------------------------------------------------------------ match */

  let fallback = false;
  const matchOk = expectObject(doc.match, '$.match', ['names', 'aliases', 'fallback'], ['names']);
  if (matchOk) {
    if ('fallback' in doc.match) {
      if (expectBoolean(doc.match.fallback, '$.match.fallback')) fallback = doc.match.fallback;
    }

    const names = doc.match.names;
    if (!Array.isArray(names)) {
      add('$.match.names', 'E_TYPE', `Expected an array, got ${typeName(names)}.`);
    } else {
      if (!fallback && names.length === 0) {
        add('$.match.names', 'E_REQUIRED', 'A non-fallback profile needs at least one match name.');
      }
      if (names.length > 8) add('$.match.names', 'E_LENGTH', 'At most 8 match names are allowed.');
      const seen = new Set();
      names.forEach((name, index) => {
        const path = `$.match.names[${index}]`;
        if (!expectString(name, path, 1, LIMITS.maxMatchNameLength)) return;
        const norm = normalizeMatchName(name);
        if (!norm) {
          add(path, 'E_FORMAT', 'This name has no letters or digits to match against.');
          return;
        }
        if (seen.has(norm)) add(path, 'E_DUPLICATE', `Duplicate match name "${name}".`);
        seen.add(norm);
      });
    }

    if ('aliases' in doc.match) {
      const aliases = doc.match.aliases;
      if (!Array.isArray(aliases)) {
        add('$.match.aliases', 'E_TYPE', `Expected an array, got ${typeName(aliases)}.`);
      } else {
        if (aliases.length > 8) add('$.match.aliases', 'E_LENGTH', 'At most 8 aliases are allowed.');
        const seen = new Set(
          Array.isArray(names)
            ? names.map((name) => normalizeMatchName(name)).filter(Boolean)
            : [],
        );
        aliases.forEach((alias, index) => {
          const path = `$.match.aliases[${index}]`;
          if (!expectString(alias, path, 1, LIMITS.maxMatchNameLength)) return;
          const norm = normalizeMatchName(alias);
          if (!norm) {
            add(path, 'E_FORMAT', 'This alias has no letters or digits to match against.');
            return;
          }
          if (seen.has(norm)) add(path, 'E_DUPLICATE', `Alias "${alias}" duplicates a match name.`);
          seen.add(norm);
        });
      }
    }

    if (fallback) {
      const nameCount = Array.isArray(names) ? names.length : 0;
      const aliasCount = Array.isArray(doc.match.aliases) ? doc.match.aliases.length : 0;
      if (nameCount > 0 || aliasCount > 0) {
        add('$.match.fallback', 'E_CROSS_FIELD', 'A fallback profile must not declare match names or aliases.');
      }
    }
  }

  if (expectString(doc.sku, '$.sku', 1, 16)) {
    if (!fallback && !/^A[0-9]{4}$/.test(doc.sku.trim())) {
      add('$.sku', 'E_FORMAT', 'A non-fallback SKU must look like A3959.');
    }
  }

  /* --------------------------------------------------------- features */

  const featuresOk = expectObject(doc.features, '$.features', [
    'anc',
    'eq',
    'battery',
    'dualConnection',
    'ldac',
    'surround',
    'gaming',
    'gamingMinFirmware',
    'factoryReset',
    'multipoint',
    'voicePrompt',
  ], ['anc', 'eq', 'battery']);

  if (featuresOk) {
    const features = doc.features;

    /* ANC ------------------------------------------------------------- */
    const ancOk = expectObject(features.anc, '$.features.anc', [
      'layout',
      'levels',
      'adaptiveSensitivity',
      'scenes',
      'transparency',
      'wind',
      'adaptive',
    ], ['layout']);

    if (ancOk) {
      const anc = features.anc;
      const layout = anc.layout;
      if (!SUPPORTED_ANC_LAYOUTS.includes(layout)) {
        add('$.features.anc.layout', 'E_ENUM', `Expected one of: ${SUPPORTED_ANC_LAYOUTS.join(', ')}.`);
      } else {
        const caps = ANC_LAYOUT_CAPS[layout];

        for (const key of ['scenes', 'transparency', 'wind', 'adaptive']) {
          if (!(key in anc)) continue;
          if (!expectBoolean(anc[key], `$.features.anc.${key}`)) continue;
          if (anc[key] && !caps[key]) {
            add(`$.features.anc.${key}`, 'E_CROSS_FIELD', `Layout "${layout}" has no documented ${key} control.`);
          }
        }

        if ('levels' in anc) {
          if (!caps.levels) {
            add('$.features.anc.levels', 'E_CROSS_FIELD', `Layout "${layout}" has no manual ANC level.`);
          } else {
            validateRange(anc.levels, '$.features.anc.levels', ANC_LEVEL_RANGE.min, ANC_LEVEL_RANGE.max);
          }
        }

        if ('adaptiveSensitivity' in anc) {
          if (!caps.adaptiveSensitivity) {
            add('$.features.anc.adaptiveSensitivity', 'E_CROSS_FIELD', `Layout "${layout}" has no adaptive sensitivity.`);
          } else {
            if (anc.adaptive === false) {
              add('$.features.anc.adaptiveSensitivity', 'E_CROSS_FIELD', 'Adaptive sensitivity requires adaptive:true.');
            }
            validateRange(
              anc.adaptiveSensitivity,
              '$.features.anc.adaptiveSensitivity',
              ADAPTIVE_SENSITIVITY_RANGE.min,
              ADAPTIVE_SENSITIVITY_RANGE.max,
            );
          }
        }
      }
    }

    /* EQ -------------------------------------------------------------- */
    const eqOk = expectObject(features.eq, '$.features.eq', [
      'command',
      'bands',
      'rangeDb',
      'presets',
      'defaultBands',
    ], ['command']);

    if (eqOk) {
      const eq = features.eq;
      const command = eq.command;

      if (command !== null && !SUPPORTED_EQ_COMMANDS.includes(command)) {
        add('$.features.eq.command', 'E_ENUM', `Expected one of: ${SUPPORTED_EQ_COMMANDS.join(', ')}, or null.`);
      } else if (command === null) {
        for (const key of ['bands', 'rangeDb', 'defaultBands']) {
          if (key in eq) {
            add(`$.features.eq.${key}`, 'E_CROSS_FIELD', `"${key}" requires a non-null EQ command.`);
          }
        }
        if ('presets' in eq && eq.presets !== 'none') {
          add('$.features.eq.presets', 'E_CROSS_FIELD', 'A profile with no EQ command must use presets:"none".');
        }
      } else {
        const expectedBands = EQ_BANDS_BY_COMMAND[command];

        if (!('bands' in eq)) {
          add('$.features.eq.bands', 'E_REQUIRED', `${command} requires an explicit band count.`);
        } else if (eq.bands !== expectedBands) {
          add('$.features.eq.bands', 'E_CROSS_FIELD', `${command} uses ${expectedBands} bands, not ${String(eq.bands)}.`);
        }

        let range = DEFAULT_EQ_DB_RANGE;
        if ('rangeDb' in eq) {
          range = validateRange(eq.rangeDb, '$.features.eq.rangeDb', EQ_DB_RANGE.min, EQ_DB_RANGE.max) ?? range;
        }

        if ('presets' in eq && !['factory', 'none'].includes(eq.presets)) {
          add('$.features.eq.presets', 'E_ENUM', 'Expected "factory" or "none".');
        }

        if ('defaultBands' in eq) {
          const bands = eq.defaultBands;
          if (!Array.isArray(bands)) {
            add('$.features.eq.defaultBands', 'E_TYPE', `Expected an array, got ${typeName(bands)}.`);
          } else {
            if (bands.length !== expectedBands) {
              add('$.features.eq.defaultBands', 'E_LENGTH', `Expected ${expectedBands} band values, got ${bands.length}.`);
            }
            bands.forEach((value, index) => {
              const path = `$.features.eq.defaultBands[${index}]`;
              if (!isFiniteNumber(value)) {
                add(path, 'E_TYPE', `Expected a number, got ${typeName(value)}.`);
                return;
              }
              if (value < range.min || value > range.max) {
                add(path, 'E_RANGE', `Expected ${range.min}..${range.max} dB, got ${value}.`);
                return;
              }
              if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) {
                add(path, 'E_FORMAT', 'Use 0.1 dB steps.');
              }
            });
          }
        }
      }
    }

    /* Battery --------------------------------------------------------- */
    const batteryOk = expectObject(features.battery, '$.features.battery', ['scale', 'case'], ['scale']);
    if (batteryOk) {
      const battery = features.battery;
      if (battery.scale === null) {
        if (!fallback) {
          add('$.features.battery.scale', 'E_CROSS_FIELD', 'Only the generic fallback may leave the battery scale unknown.');
        }
      } else {
        expectInteger(battery.scale, '$.features.battery.scale', 1, 100);
      }
      if ('case' in battery) expectBoolean(battery.case, '$.features.battery.case');
    }

    /* Feature flags --------------------------------------------------- */
    for (const key of ['dualConnection', 'ldac', 'surround', 'gaming', 'factoryReset', 'multipoint']) {
      if (key in features) expectBoolean(features[key], `$.features.${key}`);
    }

    if ('gamingMinFirmware' in features) {
      const ok = expectString(
        features.gamingMinFirmware,
        '$.features.gamingMinFirmware',
        4,
        5,
        /^[0-9]{2}\.[0-9]{2}$/,
        'Use a firmware version such as 01.60.',
      );
      if (ok && features.gaming !== true) {
        add('$.features.gamingMinFirmware', 'E_CROSS_FIELD', 'Only set a minimum firmware when gaming is true.');
      }
    }

    /* Voice prompt ---------------------------------------------------- */
    if ('voicePrompt' in features && features.voicePrompt !== null) {
      const prompt = features.voicePrompt;
      if (!expectObject(prompt, '$.features.voicePrompt', ['setFrame', 'stateOffset'], ['setFrame'])) {
        // Already reported.
      } else {
        if (!SUPPORTED_VOICE_PROMPT_FRAMES.includes(prompt.setFrame)) {
          add('$.features.voicePrompt.setFrame', 'E_ENUM', `Expected one of: ${SUPPORTED_VOICE_PROMPT_FRAMES.join(', ')}.`);
        }
        if ('stateOffset' in prompt && prompt.stateOffset !== null) {
          expectInteger(prompt.stateOffset, '$.features.voicePrompt.stateOffset', 0, LIMITS.maxStateOffset);
        }
      }
    }
  }

  /* ------------------------------------------------------------ state */

  const stateOk = expectObject(doc.state, '$.state', [
    'batteryLeft',
    'batteryRight',
    'batteryChargingLeft',
    'batteryChargingRight',
    'batteryCase',
    'firmware',
    'serial',
    'eqPresetId',
    'eqBands',
    'soundModes',
    'soundModeLength',
  ], ['batteryLeft']);

  if (stateOk) {
    const state = doc.state;

    expectInteger(state.batteryLeft, '$.state.batteryLeft', 0, LIMITS.maxStateOffset);

    for (const key of ['batteryRight', 'batteryChargingLeft', 'batteryChargingRight', 'batteryCase', 'eqPresetId', 'soundModes']) {
      if (!(key in state) || state[key] === null) continue;
      expectInteger(state[key], `$.state.${key}`, 0, LIMITS.maxStateOffset);
    }

    for (const key of ['firmware', 'serial']) {
      if (!(key in state) || state[key] === null) continue;
      validateSpan(state[key], `$.state.${key}`);
    }
    if ('eqBands' in state && state.eqBands !== null) {
      validateSpan(state.eqBands, '$.state.eqBands', 'count', 10);
    }

    if ('soundModeLength' in state && state.soundModeLength !== null) {
      expectInteger(state.soundModeLength, '$.state.soundModeLength', 1, LIMITS.maxSpanLength);
      if (state.soundModes === null || state.soundModes === undefined) {
        add('$.state.soundModeLength', 'E_CROSS_FIELD', 'soundModeLength requires a soundModes offset.');
      }
    }

    if (doc.kind === 'overear' && state.batteryRight !== null && state.batteryRight !== undefined) {
      add('$.state.batteryRight', 'E_CROSS_FIELD', 'Over-ear profiles have a single battery level; batteryRight must be null.');
    }

    if (state.batteryChargingRight !== null && state.batteryChargingRight !== undefined &&
        (state.batteryRight === null || state.batteryRight === undefined)) {
      add('$.state.batteryChargingRight', 'E_CROSS_FIELD', 'batteryChargingRight requires a batteryRight offset.');
    }

    const hasCase = doc.features?.battery?.case === true;
    if (hasCase && (state.batteryCase === null || state.batteryCase === undefined)) {
      add('$.state.batteryCase', 'E_CROSS_FIELD', 'features.battery.case is true, so state.batteryCase must be an offset.');
    }
    if (!hasCase && state.batteryCase !== null && state.batteryCase !== undefined) {
      add('$.state.batteryCase', 'E_CROSS_FIELD', 'state.batteryCase is set, so features.battery.case must be true.');
    }

    const eqBandCount = doc.features?.eq?.bands;
    if (state.eqBands && Number.isInteger(eqBandCount) && state.eqBands.count !== eqBandCount) {
      add('$.state.eqBands.count', 'E_CROSS_FIELD', `Expected ${eqBandCount} values to match features.eq.bands.`);
    }
  }

  /* ------------------------------------------------------- provenance */

  const provenanceOk = expectObject(doc.provenance, '$.provenance', ['source', 'verified'], ['source', 'verified']);
  if (provenanceOk) {
    expectString(doc.provenance.source, '$.provenance.source', 1, LIMITS.maxSourceLength);
    expectBoolean(doc.provenance.verified, '$.provenance.verified');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Parse a profile file's text (BOM tolerated) and validate it.
 *
 * @param {string} text
 * @param {string} [filename]
 * @returns {{ ok: true, value: unknown, errors: [] } | { ok: false, errors: Array<{path: string, code: string, message: string}> }}
 */
function parseProfileText(text, filename = 'profile.json') {
  if (typeof text !== 'string') {
    return {
      ok: false,
      errors: [issue('$', 'E_TYPE', 'Profile files must be UTF-8 text.')],
    };
  }

  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (Buffer.byteLength(cleaned, 'utf8') > LIMITS.maxFileBytes) {
    return {
      ok: false,
      errors: [issue('$', 'E_FILE_SIZE', `${filename} is larger than ${LIMITS.maxFileBytes} bytes.`)],
    };
  }

  let doc;
  try {
    doc = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      errors: [issue('$', 'E_JSON', `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)],
    };
  }

  const result = validateProfileDocument(doc);
  return result.ok ? { ok: true, value: doc, errors: [] } : { ok: false, errors: result.errors };
}

/** The fields the folder reader and renderer need without the whole document. */
function summarizeProfile(doc) {
  return {
    id: doc.id,
    name: doc.name,
    sku: doc.sku,
    kind: doc.kind,
    family: doc.family,
    schemaVersion: doc.schemaVersion,
    verified: doc.provenance.verified === true,
    fallback: doc.match.fallback === true,
    matchNames: [
      ...(Array.isArray(doc.match.names) ? doc.match.names : []),
      ...(Array.isArray(doc.match.aliases) ? doc.match.aliases : []),
    ],
  };
}

module.exports = {
  SCHEMA_VERSION,
  LIMITS,
  SUPPORTED_ANC_LAYOUTS,
  SUPPORTED_EQ_COMMANDS,
  SUPPORTED_KINDS,
  SUPPORTED_FAMILIES,
  SUPPORTED_VOICE_PROMPT_FRAMES,
  ANC_LAYOUT_CAPS,
  EQ_BANDS_BY_COMMAND,
  ANC_LEVEL_RANGE,
  ADAPTIVE_SENSITIVITY_RANGE,
  EQ_DB_RANGE,
  DEFAULT_EQ_DB_RANGE,
  validateProfileDocument,
  parseProfileText,
  normalizeMatchName,
  summarizeProfile,
};
