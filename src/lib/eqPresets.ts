/**
 * Named custom equalizer presets (local, per model).
 *
 * The original app lets a user name and keep several custom curves; this module
 * is the local equivalent. It is deliberately pure: no React, no `localStorage`
 * access of its own. Every function takes the current list and returns a new
 * one, so the logic can be exercised in `scripts/test_eq_presets.mjs` without a
 * browser and the store stays the only writer.
 *
 * Invariants, all enforced here rather than in the UI:
 *   • a stored preset always carries exactly `BAND_COUNT` bands, each a
 *     multiple of `BAND_STEP` within `BAND_MIN`..`BAND_MAX`;
 *   • names are trimmed, length-capped, and unique case-insensitively, because
 *     two identically named entries are indistinguishable in the picker;
 *   • the list is capped, so a runaway import loop cannot fill storage;
 *   • a preset records the model it was built for. Presets built for a
 *     different model are still listed but flagged, since applying one to
 *     another device is a user decision, not something to hide silently.
 *
 * Nothing here talks to a device: sending a curve remains the store's job, and
 * it keeps the existing "no FE FE frame on models without custom-EQ support"
 * gate.
 */

import { EQ_BAND_COUNT, EQ_BAND_MAX, EQ_BAND_MIN, EQ_BAND_STEP } from '../types';

/** Storage key. Bump the suffix only for an incompatible shape change. */
export const EQ_PRESET_STORAGE_KEY = 'sc.eqPresets';

/** Upper bound on stored presets. Generous for a hand-kept library. */
export const MAX_STORED_PRESETS = 64;

/** Longest accepted preset name, in characters after trimming. */
export const MAX_PRESET_NAME_LENGTH = 40;

export interface StoredEqPreset {
  id: string;
  name: string;
  /** Band gains in dB, same order as `EQ_HZ`. Always normalized. */
  bands: number[];
  /** SKU the preset was created against, or null for a model-agnostic curve. */
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type PresetEditResult =
  | { ok: true; presets: StoredEqPreset[]; preset: StoredEqPreset }
  | { ok: false; error: string };

/**
 * Clamp and quantize one band value. Returns null for anything that is not a
 * finite number, so callers can reject the whole band array instead of
 * silently substituting 0 dB for corrupt input.
 */
export function normalizeBand(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = Math.max(EQ_BAND_MIN, Math.min(EQ_BAND_MAX, value));
  const stepped = Math.round(clamped / EQ_BAND_STEP) * EQ_BAND_STEP;
  // Kill floating-point dust such as 0.30000000000000004.
  return Math.round(stepped * 10) / 10;
}

/** Normalize a full band array, or null when the shape is wrong. */
export function normalizeBands(bands: unknown): number[] | null {
  if (!Array.isArray(bands) || bands.length !== EQ_BAND_COUNT) return null;
  const out: number[] = [];
  for (const value of bands) {
    const band = normalizeBand(value);
    if (band === null) return null;
    out.push(band);
  }
  return out;
}

/** Trim, collapse inner whitespace, cap the length. Empty becomes Untitled. */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Untitled preset';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'Untitled preset';
  return collapsed.slice(0, MAX_PRESET_NAME_LENGTH);
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Derive a name that does not collide with `taken`, appending " 2", " 3" … and
 * truncating the stem so the suffix always fits inside the length cap.
 */
export function uniqueName(desired: string, taken: string[], excludeId?: string): string {
  const others = taken.filter((n) => n !== excludeId);
  if (!others.some((n) => sameName(n, desired))) return desired;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const stem = desired.slice(0, Math.max(1, MAX_PRESET_NAME_LENGTH - suffix.length)).trimEnd();
    const candidate = `${stem}${suffix}`;
    if (!others.some((t) => sameName(t, candidate))) return candidate;
  }
  return `${desired.slice(0, MAX_PRESET_NAME_LENGTH - 8).trimEnd()} ${Date.now() % 1000}`;
}

/** Reject entries that cannot be trusted, rather than repairing them silently. */
function sanitizePreset(raw: unknown): StoredEqPreset | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<StoredEqPreset>;
  const bands = normalizeBands(candidate.bands);
  if (!bands) return null;
  if (typeof candidate.id !== 'string' || !candidate.id) return null;
  // A missing or non-string name is repaired by normalizeName rather than
  // rejected: the curve itself is still valid and usable, and losing a whole
  // preset because its label was written oddly would be needless data loss.
  const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : 0;
  const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : createdAt;
  return {
    id: candidate.id,
    name: normalizeName(candidate.name),
    bands,
    modelId: typeof candidate.modelId === 'string' && candidate.modelId ? candidate.modelId : null,
    createdAt,
    updatedAt,
  };
}

/**
 * Read presets from an already-parsed value (a `localStorage` payload, an
 * imported file, or a test literal). Invalid entries are dropped one by one;
 * duplicate ids keep the first occurrence. Returns [] for anything unusable.
 */
export function sanitizePresetList(raw: unknown): StoredEqPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredEqPreset[] = [];
  for (const entry of raw) {
    const preset = sanitizePreset(entry);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push(preset);
    if (out.length >= MAX_STORED_PRESETS) break;
  }
  return out;
}

/** Parse a raw JSON string from storage. Never throws. */
export function parseStoredPresets(raw: string | null): StoredEqPreset[] {
  if (!raw) return [];
  try {
    return sanitizePresetList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function serializePresets(presets: StoredEqPreset[]): string {
  return JSON.stringify(presets);
}

function makeId(now: number): string {
  return `eq_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Add a preset built from the current curve. The name is de-duplicated, the
 * bands are normalized, and the list cap is enforced — a full library fails the
 * edit with a clear error instead of evicting a user's work.
 */
export function addPreset(
  presets: StoredEqPreset[],
  input: { name: unknown; bands: unknown; modelId?: string | null; now?: number },
): PresetEditResult {
  const bands = normalizeBands(input.bands);
  if (!bands) {
    return { ok: false, error: `A preset needs ${EQ_BAND_COUNT} numeric bands.` };
  }
  if (presets.length >= MAX_STORED_PRESETS) {
    return { ok: false, error: `Preset library is full (${MAX_STORED_PRESETS} entries). Delete one first.` };
  }
  const now = input.now ?? Date.now();
  const name = uniqueName(normalizeName(input.name), presets.map((p) => p.name));
  const preset: StoredEqPreset = {
    id: makeId(now),
    name,
    bands,
    modelId: typeof input.modelId === 'string' && input.modelId ? input.modelId : null,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, presets: [...presets, preset], preset };
}

/**
 * Rename in place. A colliding name is de-duplicated for the user rather than
 * rejected, matching what the New-preset path does.
 */
export function renamePreset(
  presets: StoredEqPreset[],
  id: string,
  name: unknown,
  now = Date.now(),
): PresetEditResult {
  const target = presets.find((p) => p.id === id);
  if (!target) return { ok: false, error: 'Preset not found.' };
  const taken = presets.filter((p) => p.id !== id).map((p) => p.name);
  const unique = uniqueName(normalizeName(name), taken);
  const renamed: StoredEqPreset = { ...target, name: unique, updatedAt: now };
  return {
    ok: true,
    presets: presets.map((p) => (p.id === id ? renamed : p)),
    preset: renamed,
  };
}

/** Replace a preset's curve, keeping its identity and name. */
export function updatePresetBands(
  presets: StoredEqPreset[],
  id: string,
  bands: unknown,
  now = Date.now(),
): PresetEditResult {
  const target = presets.find((p) => p.id === id);
  if (!target) return { ok: false, error: 'Preset not found.' };
  const normalized = normalizeBands(bands);
  if (!normalized) return { ok: false, error: `A preset needs ${EQ_BAND_COUNT} numeric bands.` };
  const updated: StoredEqPreset = { ...target, bands: normalized, updatedAt: now };
  return {
    ok: true,
    presets: presets.map((p) => (p.id === id ? updated : p)),
    preset: updated,
  };
}

export function deletePreset(presets: StoredEqPreset[], id: string): StoredEqPreset[] {
  return presets.filter((p) => p.id !== id);
}

/** Presets usable on `modelId`: exact matches plus model-agnostic curves. */
export function presetsForModel(presets: StoredEqPreset[], modelId: string | null): StoredEqPreset[] {
  if (!modelId) return presets.slice();
  return presets.filter((p) => p.modelId === null || p.modelId === modelId);
}

/** True when this preset was built for a different model than the connected one. */
export function isForeignPreset(preset: StoredEqPreset, modelId: string | null): boolean {
  if (!modelId || !preset.modelId) return false;
  return preset.modelId !== modelId;
}

/** Newest first, so a freshly saved curve is where the user expects it. */
export function sortPresets(presets: StoredEqPreset[]): StoredEqPreset[] {
  return presets.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
}
