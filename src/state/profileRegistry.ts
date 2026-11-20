/**
 * Renderer-side device-profile registry (Phase 2).
 *
 * The hardcoded table in `src/protocol/devices.ts` is no longer the source of
 * truth for a real connection. The main process validates every JSON file in
 * `%AppData%\soundcontrol\device_profiles` and sends a snapshot over IPC; this
 * module adapts a validated document to the runtime `DeviceProfile` shape and
 * resolves a reported device name/MAC to exactly one profile.
 *
 * Profile content is data only. Nothing here evaluates it, and every field the
 * protocol layer needs is copied explicitly. React is deliberately absent so
 * the matcher and adapter can be unit-tested without a DOM.
 */
import genericUnknownDocument from '../../profiles/generic_unknown.json';
import type { AncLayout, DeviceProfile, EqCommand, StateOffsets } from '../types';
import { canonicalMac } from './localData';

/**
 * The subset of the versioned JSON contract this renderer consumes. The main
 * process is authoritative for shape and range validation; this type exists so
 * the adapter cannot silently read a misspelled field.
 */
export interface ProfileDocument {
  schemaVersion: number;
  id: string;
  name: string;
  sku: string;
  kind: 'earbuds' | 'overear';
  family: 'tws' | 'classic';
  match: {
    names: string[];
    aliases?: string[];
    fallback?: boolean;
  };
  features: {
    anc: {
      layout: AncLayout;
      levels?: { min: number; max: number } | null;
      adaptiveSensitivity?: { min: number; max: number } | null;
      scenes?: boolean;
      transparency?: boolean;
      wind?: boolean;
      adaptive?: boolean;
    };
    eq: {
      command: EqCommand | null;
      bands?: number;
      rangeDb?: { min: number; max: number };
      presets?: string;
      defaultBands?: number[];
    };
    battery: { scale: number | null; case: boolean };
    dualConnection?: boolean;
    ldac?: boolean;
    surround?: boolean;
    gaming?: boolean;
    gamingMinFirmware?: string;
    factoryReset?: boolean;
    multipoint?: boolean;
    voicePrompt?: unknown;
  };
  state: {
    batteryLeft: number;
    batteryRight: number | null;
    batteryChargingLeft: number | null;
    batteryChargingRight: number | null;
    batteryCase: number | null;
    firmware: { at: number; length: number } | null;
    serial: { at: number; length: number } | null;
    eqPresetId: number | null;
    eqBands: { at: number; count: number } | null;
    soundModes: number | null;
    soundModeLength?: number | null;
  };
  provenance?: { source?: string; verified?: boolean };
}

/** One installed profile, keeping its JSON document next to the adapter result. */
export interface ProfileSource {
  file: string;
  builtin: boolean;
  document: ProfileDocument;
  profile: DeviceProfile;
}

export interface ProfileRegistry {
  /** Installed user profiles that can match a device. */
  sources: ProfileSource[];
  /** The one profile used when nothing matches (bundled generic fallback). */
  fallback: ProfileSource;
}

export interface ProfileResolution {
  source: ProfileSource;
  profile: DeviceProfile;
  /** Exact user-facing message when no installed profile matched. */
  note: string | null;
  missing: boolean;
}

export const PROFILE_NOT_FOUND_NOTE = 'Profile not found. Please download from GitHub.';

/**
 * Normalize a Bluetooth name for matching. Mirrors the executable validator so
 * a profile that validates against `match.names` also resolves here:
 * `Soundcore R50i NC`, `soundcore r50i-nc` and `R50i NC` all become `r50i nc`.
 *
 * The same normalization turns a MAC into `aa bb cc dd ee ff`, which means a
 * user may put a full address in `match.names` when one physical unit needs a
 * profile different from its model name.
 */
export function normalizeMatchName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^soundcore\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Adapt a validated JSON document to the runtime profile the protocol uses. */
export function adaptProfileDocument(doc: ProfileDocument): DeviceProfile {
  const anc = doc.features.anc;
  const eq = doc.features.eq;
  const battery = doc.features.battery;

  const state: StateOffsets = {
    batteryLeft: doc.state.batteryLeft,
    batteryRight: doc.state.batteryRight,
    batteryChargingLeft: doc.state.batteryChargingLeft,
    batteryChargingRight: doc.state.batteryChargingRight,
    batteryCase: doc.state.batteryCase,
    firmware: doc.state.firmware,
    serial: doc.state.serial,
    eqPresetId: doc.state.eqPresetId,
    eqBands: doc.state.eqBands,
    soundModes: doc.state.soundModes,
    ...(typeof doc.state.soundModeLength === 'number'
      ? { soundModeLength: doc.state.soundModeLength }
      : {}),
  };

  // Only fields the JSON actually declares become overrides. An omitted flag
  // inherits the documented wire layout in deriveCapabilities(); an explicit
  // false narrows the capability without ever widening it.
  const ancFeatures: NonNullable<DeviceProfile['ancFeatures']> = {};
  if (anc.levels !== undefined) ancFeatures.level = anc.levels !== null;
  if (anc.scenes !== undefined) ancFeatures.scenes = anc.scenes;
  if (anc.transparency !== undefined) ancFeatures.transVocal = anc.transparency;
  if (anc.wind !== undefined) ancFeatures.wind = anc.wind;
  if (anc.adaptive !== undefined) ancFeatures.adaptive = anc.adaptive;

  return {
    id: doc.id,
    name: doc.name,
    sku: doc.sku,
    gamingMinFirmware: doc.features.gamingMinFirmware,
    kind: doc.kind,
    family: doc.family,
    gaming: doc.features.gaming === true,
    ancLevels: anc.levels !== undefined && anc.levels !== null,
    scenes: anc.scenes === true,
    ldac: doc.features.ldac === true,
    dual: doc.features.dualConnection === true,
    surround: doc.features.surround === true,
    transparency: anc.transparency === true,
    wind: anc.wind === true,
    batteryMax: battery.scale,
    names: [...(doc.match.names ?? []), ...(doc.match.aliases ?? [])],
    ancLayout: anc.layout,
    eqCommand: eq.command,
    state,
    factoryReset: doc.features.factoryReset === true,
    source: doc.provenance?.source ?? '',
    verified: doc.provenance?.verified === true,
    fallback: doc.match.fallback === true,
    ancFeatures,
    ancLevelRange: anc.levels ?? undefined,
    adaptiveSensitivityRange: anc.adaptiveSensitivity ?? undefined,
    eqRangeDb: eq.rangeDb,
    defaultBands: eq.defaultBands,
  };
}

function createBundledFallback(): ProfileSource {
  const document = genericUnknownDocument as unknown as ProfileDocument;
  return {
    file: 'generic_unknown.json',
    builtin: true,
    document,
    profile: adaptProfileDocument(document),
  };
}

/**
 * The renderer can always render an honest fallback even before the first IPC
 * snapshot arrives (or in the browser preview, where Electron is absent).
 */
export const BUNDLED_FALLBACK: ProfileSource = createBundledFallback();

/** Build the registry from the validated main-process snapshot. */
export function registryFromSnapshot(snapshot: DeviceProfilesSnapshot): ProfileRegistry {
  const userFallback = snapshot.profiles.find((entry) => entry.fallback);
  const sources: ProfileSource[] = snapshot.profiles
    .filter((entry) => !entry.fallback)
    .map((entry) => {
      const document = entry.document as ProfileDocument;
      return {
        file: entry.file,
        builtin: false,
        document,
        profile: adaptProfileDocument(document),
      };
    });

  const builtinEntry = snapshot.builtin.find((entry) => entry.fallback) ?? snapshot.builtin[0];
  const fallbackEntry = userFallback ?? builtinEntry;
  if (!fallbackEntry) return { sources, fallback: BUNDLED_FALLBACK };

  const document = fallbackEntry.document as ProfileDocument;
  return {
    sources,
    fallback: {
      file: fallbackEntry.file,
      builtin: fallbackEntry.builtin === true,
      document,
      profile: adaptProfileDocument(document),
    },
  };
}

/** Longest alias first, so `R50i NC` cannot lose to `R50i`. */
function rankedAliases(sources: ProfileSource[]): Array<{ alias: string; source: ProfileSource }> {
  return sources
    .flatMap((source) =>
      source.profile.names.map((name) => ({
        alias: normalizeMatchName(name),
        source,
      })),
    )
    .filter((entry) => entry.alias.length > 0)
    .sort((a, b) => b.alias.length - a.alias.length);
}

/**
 * Resolve a reported name/MAC to exactly one profile.
 *
 * Order:
 *   1. A persisted manual override for this MAC (`sc.device.intent`).
 *   2. A profile whose `match.names` contains the normalized reported name
 *      or MAC (longest alias first).
 *   3. The bundled generic fallback, with an explicit download note.
 */
export function resolveProfile(
  name: string | null | undefined,
  mac: string | null | undefined,
  registry: ProfileRegistry,
  intent: Record<string, string> = {},
): ProfileResolution {
  const macKey = canonicalMac(mac);
  if (macKey) {
    const wanted = intent[macKey];
    if (wanted) {
      const hit =
        registry.sources.find((source) => source.profile.id === wanted) ??
        (registry.fallback.profile.id === wanted ? registry.fallback : undefined);
      if (hit) {
        return { source: hit, profile: hit.profile, note: null, missing: false };
      }
    }
  }

  const normalizedName = normalizeMatchName(name ?? '');
  const normalizedMac = normalizeMatchName(mac ?? '');
  const hit = rankedAliases(registry.sources).find(({ alias }) => {
    if (normalizedName && normalizedName.includes(alias)) return true;
    if (!normalizedMac) return false;
    return normalizedMac.includes(alias) || alias.includes(normalizedMac);
  });
  if (hit) {
    return { source: hit.source, profile: hit.source.profile, note: null, missing: false };
  }

  return {
    source: registry.fallback,
    profile: registry.fallback.profile,
    note: PROFILE_NOT_FOUND_NOTE,
    missing: true,
  };
}
