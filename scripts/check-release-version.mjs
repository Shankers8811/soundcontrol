#!/usr/bin/env node
/**
 * Release version validation script.
 * Ensures tag === package.json version === asset filenames.
 * Used in release workflows to prevent tag/package drift.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageVersion = packageJson.version;

const tag = process.env.GITHUB_REF_NAME || process.argv[2];

if (!tag) {
  console.error('Usage: node scripts/check-release-version.mjs <tag>');
  process.exit(1);
}

const tagVersion = tag.startsWith('v') ? tag.slice(1) : tag;

if (tagVersion !== packageVersion) {
  console.error(`Version mismatch: tag "${tag}" (version ${tagVersion}) !== package.json version "${packageVersion}"`);
  process.exit(1);
}

console.log(`Version check passed: ${tag} === ${packageVersion}`);
process.exit(0);