/**
 * Pure, side-effect-free helpers for everything SoundControl stores locally.
 *
 * The app keeps a handful of user-owned values in `localStorage`: saved EQ
 * curves, one remembered curve per noise mode, the recent-device list with a
 * last-known battery snapshot, and a few behaviour preferences. None of it is
 * device state — the device remains the only source of truth for what it is
 * currently doing — so every value here is sanitized defensively on load and
 * on import. A corrupt or hand-edited file must degrade to "feature empty",
 * never crash a page or make the UI claim something the hardware never said.
 *
 * No React, no DOM, no device protocol: `scripts/test_ui_state.mjs` bundles
 * this module and asserts the sanitizers and formatters directly.
 */

import type {
  EqBucket,
  EqModeProfile,
  LastKnownBattery,
  RecentDevice,
  SavedEqPreset,
  ThemePref,
} from '../types';

export const RECENT_LIMIT = 5;
export const SAVED_PRESET_LIMIT = 50;
export const EQ_BUCKETS: EqBucket[] = ['anc', 'normal', 'transparency'];
export const PRESET_NAME_MAX = 40;

const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;

/** Canonical uppercase MAC, or null when the input is not an address. */
export function canonicalMac(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!MAC_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

/** A user-visible name: trimmed, single-line, bounded, or undefined. */
export function sanitizeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.slice(0, PRESET_NAME_MAX);
}

/** Exactly eight EQ bands clamped to the protocol's ±6 dB range. */
export function sanitizeBands(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 8) return null;
  const out: number[] = [];
  for (const raw of value) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    out.push(Math.max(-6, Math.min(6, Math.round(raw * 2) / 2)));
  }
  return out;
}

/** A battery snapshot is only valid with at least one real percentage. */
export function sanitizeLastKnownBattery(value: unknown): LastKnownBattery | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const level = (raw: unknown): number | null => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    if (raw < 0 || raw > 100) return null;
    return Math.round(raw);
  };
  const left = level(v.left);
  const right = level(v.right);
  const caseLevel = level(v.case);
  const at = typeof v.at === 'number' && Number.isFinite(v.at) && v.at > 0 ? v.at : 0;
  if (left === null && right === null && caseLevel === null) return undefined;
  if (at === 0) return undefined;
  return { left, right, case: caseLevel, at };
}

export function sanitizeSavedPresets(value: unknown): SavedEqPreset[] {
  if (!Array.isArray(value)) return [];
  const out: SavedEqPreset[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const v = raw as Record<string, unknown>;
    const id = typeof v.id === 'string' ? v.id.trim() : '';
    const name = sanitizeLabel(v.name);
    const bands = sanitizeBands(v.bands);
    const createdAt =
      typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) && v.createdAt > 0
        ? v.createdAt
        : Date.now();
    if (!id || !name || !bands) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: id.slice(0, 64), name, bands, createdAt });
    if (out.length >= SAVED_PRESET_LIMIT) break;
  }
  return out;
}

export function sanitizeEqModeProfiles(
  value: unknown,
): Record<EqBucket, EqModeProfile | null> {
  const empty: Record<EqBucket, EqModeProfile | null> = {
    anc: null,
    normal: null,
    transparency: null,
  };
  if (typeof value !== 'object' || value === null) return empty;
  const v = value as Record<string, unknown>;
  for (const bucket of EQ_BUCKETS) {
    const entry = v[bucket];
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (e.kind === 'preset' && typeof e.presetId === 'string' && e.presetId.trim()) {
      empty[bucket] = { kind: 'preset', presetId: e.presetId.trim() };
    } else if (e.kind === 'custom') {
      const bands = sanitizeBands(e.bands);
      if (bands) empty[bucket] = { kind: 'custom', bands };
    }
  }
  return empty;
}

export function sanitizeRecentDevices(value: unknown): RecentDevice[] {
  if (!Array.isArray(value)) return [];
  const out: RecentDevice[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const v = raw as Record<string, unknown>;
    const mac = canonicalMac(v.mac);
    const name = sanitizeLabel(v.name);
    if (!mac || !name) continue;
    if (seen.has(mac)) continue;
    seen.add(mac);
    const entry: RecentDevice = { mac, name };
    const label = sanitizeLabel(v.label);
    if (label) entry.label = label;
    const lastBattery = sanitizeLastKnownBattery(v.lastBattery);
    if (lastBattery) entry.lastBattery = lastBattery;
    out.push(entry);
    if (out.length >= RECENT_LIMIT) break;
  }
  return out;
}

/**
 * Insert/refresh one device in the recent list. The device's reported `name`
 * always refreshes (it is what profile matching uses); a user `label` survives
 * a reconnect. Existing last-known battery is preserved unless a new snapshot
 * is supplied.
 */
export function upsertRecentDevice(
  list: RecentDevice[],
  entry: RecentDevice,
): RecentDevice[] {
  const mac = canonicalMac(entry.mac);
  if (!mac) return list;
  const name = sanitizeLabel(entry.name) ?? 'soundcore';
  const existing = list.find((d) => d.mac === mac);
  const next: RecentDevice = {
    mac,
    name,
    ...(entry.label ?? existing?.label ? { label: entry.label ?? existing?.label } : {}),
    ...(entry.lastBattery ?? existing?.lastBattery
      ? { lastBattery: entry.lastBattery ?? existing?.lastBattery }
      : {}),
  };
  return [next, ...list.filter((d) => d.mac !== mac)].slice(0, RECENT_LIMIT);
}

export function renameRecentDevice(
  list: RecentDevice[],
  mac: string,
  label: string | null,
): RecentDevice[] {
  const key = canonicalMac(mac);
  if (!key) return list;
  const clean = sanitizeLabel(label ?? '');
  return list.map((d) => {
    if (d.mac !== key) return d;
    const next: RecentDevice = { mac: d.mac, name: d.name };
    if (d.lastBattery) next.lastBattery = d.lastBattery;
    if (clean) next.label = clean;
    return next;
  });
}

/** The name the UI shows for a recent device: user label first, reported name second. */
export function recentDisplayName(device: RecentDevice): string {
  return device.label ?? device.name;
}

/** Human "last seen" text for an offline battery snapshot. */
export function formatLastSeen(at: number, now: number = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return 'unknown';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** One-line battery summary for the recent list; null when nothing is known. */
export function lastKnownSummary(snapshot: LastKnownBattery | undefined): string | null {
  if (!snapshot) return null;
  const parts: string[] = [];
  if (snapshot.left !== null) parts.push(`L ${snapshot.left}%`);
  if (snapshot.right !== null) parts.push(`R ${snapshot.right}%`);
  if (snapshot.case !== null) parts.push(`Case ${snapshot.case}%`);
  if (parts.length === 0) return null;
  return `${parts.join(' · ')} · ${formatLastSeen(snapshot.at)}`;
}

/* ------------------------------------------------------------------ */
/* EQ preset import / export                                           */
/* ------------------------------------------------------------------ */

export interface PresetFile {
  app: 'soundcontrol';
  kind: 'eq-presets';
  version: 1;
  exportedAt: number;
  presets: SavedEqPreset[];
}

export function buildPresetFile(presets: SavedEqPreset[]): PresetFile {
  return {
    app: 'soundcontrol',
    kind: 'eq-presets',
    version: 1,
    exportedAt: Date.now(),
    presets,
  };
}

export function serializePresetFile(presets: SavedEqPreset[]): string {
  return JSON.stringify(buildPresetFile(presets), null, 2);
}

/**
 * Parse an imported preset file. Accepts both the full export object and a
 * bare array of presets so a hand-written file still works. Unknown fields
 * are ignored and invalid rows are dropped rather than rejected wholesale —
 * the caller reports how many were imported.
 */
export function parsePresetFile(text: string): { presets: SavedEqPreset[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { presets: [], error: 'That file is not valid JSON.' };
  }
  const raw = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { presets?: unknown }).presets)
      ? (parsed as { presets: unknown[] }).presets
      : null;
  if (!raw) return { presets: [], error: 'No EQ presets were found in that file.' };
  const presets = sanitizeSavedPresets(raw);
  if (presets.length === 0) return { presets: [], error: 'The file contained no valid 8-band curves.' };
  return { presets };
}

/* ------------------------------------------------------------------ */
/* Settings backup / restore                                           */
/* ------------------------------------------------------------------ */

export interface AppPreferences {
  perModeEq: boolean;
  autoReconnect: boolean;
  reapplyOnSecondBud: boolean;
  lowBatteryNotifications: boolean;
  /** Optional app-wide hotkeys (only while SoundControl is running). */
  globalHotkeys: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  perModeEq: false,
  autoReconnect: false,
  reapplyOnSecondBud: true,
  lowBatteryNotifications: true,
  globalHotkeys: false,
};

export interface SettingsBackup {
  app: 'soundcontrol';
  kind: 'settings';
  version: 1;
  exportedAt: number;
  theme: ThemePref;
  prompts: boolean;
  preferences: AppPreferences;
  eqPresets: SavedEqPreset[];
  eqModeProfiles: Record<EqBucket, EqModeProfile | null>;
  recentDevices: RecentDevice[];
}

export function sanitizePreferences(value: unknown): AppPreferences {
  const base = { ...DEFAULT_PREFERENCES };
  if (typeof value !== 'object' || value === null) return base;
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof AppPreferences>) {
    if (typeof v[key] === 'boolean') base[key] = v[key] as boolean;
  }
  return base;
}

export function buildSettingsBackup(input: {
  theme: ThemePref;
  prompts: boolean;
  preferences: AppPreferences;
  eqPresets: SavedEqPreset[];
  eqModeProfiles: Record<EqBucket, EqModeProfile | null>;
  recentDevices: RecentDevice[];
}): SettingsBackup {
  return {
    app: 'soundcontrol',
    kind: 'settings',
    version: 1,
    exportedAt: Date.now(),
    theme: input.theme === 'dark' || input.theme === 'light' ? input.theme : 'system',
    prompts: input.prompts !== false,
    preferences: sanitizePreferences(input.preferences),
    eqPresets: sanitizeSavedPresets(input.eqPresets),
    eqModeProfiles: sanitizeEqModeProfiles(input.eqModeProfiles),
    recentDevices: sanitizeRecentDevices(input.recentDevices),
  };
}

export function serializeSettingsBackup(backup: SettingsBackup): string {
  return JSON.stringify(backup, null, 2);
}

export interface ParsedSettingsBackup {
  theme: ThemePref;
  prompts: boolean;
  preferences: AppPreferences;
  eqPresets: SavedEqPreset[];
  eqModeProfiles: Record<EqBucket, EqModeProfile | null>;
  recentDevices: RecentDevice[];
}

/**
 * Parse a settings backup. Rejects files that are not a SoundControl backup
 * (so a random JSON file cannot silently reset anything); individual sections
 * are sanitized and fall back to empty/defaults.
 */
export function parseSettingsBackup(text: string): { backup: ParsedSettingsBackup; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      backup: {
        theme: 'system',
        prompts: true,
        preferences: { ...DEFAULT_PREFERENCES },
        eqPresets: [],
        eqModeProfiles: sanitizeEqModeProfiles(null),
        recentDevices: [],
      },
      error: 'That file is not valid JSON.',
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      backup: {
        theme: 'system',
        prompts: true,
        preferences: { ...DEFAULT_PREFERENCES },
        eqPresets: [],
        eqModeProfiles: sanitizeEqModeProfiles(null),
        recentDevices: [],
      },
      error: 'That file is not a SoundControl settings backup.',
    };
  }
  const v = parsed as Record<string, unknown>;
  if (v.app !== 'soundcontrol' || v.kind !== 'settings') {
    return {
      backup: {
        theme: 'system',
        prompts: true,
        preferences: { ...DEFAULT_PREFERENCES },
        eqPresets: [],
        eqModeProfiles: sanitizeEqModeProfiles(null),
        recentDevices: [],
      },
      error: 'That file is not a SoundControl settings backup.',
    };
  }
  const theme: ThemePref = v.theme === 'dark' || v.theme === 'light' ? v.theme : 'system';
  return {
    backup: {
      theme,
      prompts: typeof v.prompts === 'boolean' ? v.prompts : true,
      preferences: sanitizePreferences(v.preferences),
      eqPresets: sanitizeSavedPresets(v.eqPresets),
      eqModeProfiles: sanitizeEqModeProfiles(v.eqModeProfiles),
      recentDevices: sanitizeRecentDevices(v.recentDevices),
    },
  };
}
