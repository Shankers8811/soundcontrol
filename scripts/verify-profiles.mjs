#!/usr/bin/env node
/**
 * Validate every downloadable profile in `profiles/` against the executable
 * schema. Runs in `npm run build` so a broken built-in profile cannot ship.
 *
 * Run: npm run verify:profiles
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = require('../shared/device-profile-validate.cjs');

const errors = [];
const profilesDir = join(ROOT, 'profiles');
const files = readdirSync(profilesDir)
  .filter((file) => /\.json$/i.test(file))
  .sort();

if (files.length === 0) errors.push('profiles/ contains no .json files');

let fallbackCount = 0;
for (const file of files) {
  const parsed = validator.parseProfileText(readFileSync(join(profilesDir, file), 'utf8'), file);
  if (!parsed.ok) {
    for (const issue of parsed.errors) {
      errors.push(`${file}: ${issue.code} at ${issue.path} — ${issue.message}`);
    }
    continue;
  }
  if (parsed.value.match.fallback === true) fallbackCount++;
}

if (fallbackCount !== 1) {
  errors.push(`profiles/ must contain exactly one fallback profile, found ${fallbackCount}`);
}

const schema = JSON.parse(readFileSync(join(ROOT, 'shared', 'device-profile.schema.json'), 'utf8'));
const schemaChecks = [
  [
    'ANC layouts',
    schema.properties.features.properties.anc.properties.layout.enum,
    [...validator.SUPPORTED_ANC_LAYOUTS],
  ],
  [
    'EQ commands',
    schema.properties.features.properties.eq.properties.command.enum,
    [...validator.SUPPORTED_EQ_COMMANDS, null],
  ],
  [
    'EQ band counts',
    schema.properties.features.properties.eq.properties.bands.enum,
    [...new Set(Object.values(validator.EQ_BANDS_BY_COMMAND))],
  ],
  ['kinds', schema.properties.kind.enum, [...validator.SUPPORTED_KINDS]],
  ['families', schema.properties.family.enum, [...validator.SUPPORTED_FAMILIES]],
  [
    'voice-prompt frames',
    schema.properties.features.properties.voicePrompt.oneOf[1].properties.setFrame.enum,
    [...validator.SUPPORTED_VOICE_PROMPT_FRAMES],
  ],
];

for (const [label, actual, expected] of schemaChecks) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`schema/validator drift for ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

if (errors.length) {
  console.error('Profile verification failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Profile verification passed: ${files.length} file(s), ${fallbackCount} fallback, schema/validator enums in sync.`,
);
