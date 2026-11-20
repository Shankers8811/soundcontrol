import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { beep } from '../lib/feedback';
import { toHex, verifyFrame } from '../protocol/codec';
// Legacy table retained ONLY for the dev-only simulator (Settings → Developer
// tools) and its unit tests. Real connections resolve through the installed
// JSON profile registry below — never through this table.
import { DEVICES } from '../protocol/devices';
import {
  DEVICE_INFO,
  DUAL,
  INIT,
  LDAC,
  buildAnc,
  buildBatteryQuery,
  buildCustomEq,
  buildEqPreset,
  buildGameMode,
  buildResetDevice,
  buildSurroundSound,
  describePacket,
  type AncIntent,
} from '../protocol/packets';
import { EQ_PRESETS, presetById, type EqPreset } from '../protocol/presets';
import { isTransportBusyError } from '../lib/transportErrors';
import { connectBridge } from '../transports/bridge';
import {
  batteryLevel,
  deriveCapabilities,
  deriveConnectionPhase,
  deriveEarbudState,
  emptyBattery,
  eqBucketForMode,
  mergeBatteryTelemetry,
  parseSoundModes,
  type Capabilities,
  type ConnectionPhase,
  type EarbudState,
} from './derive';
import {
  BUNDLED_FALLBACK,
  PROFILE_NOT_FOUND_NOTE,
  registryFromSnapshot,
  resolveProfile,
  type ProfileRegistry,
} from './profileRegistry';
import {
  DEFAULT_PREFERENCES,
  SAVED_PRESET_LIMIT,
  buildSettingsBackup,
  canonicalMac,
  parsePresetFile,
  parseSettingsBackup,
  renameRecentDevice as renameRecentInList,
  sanitizeEqModeProfiles,
  sanitizeLabel,
  sanitizePreferences,
  sanitizeRecentDevices,
  sanitizeSavedPresets,
  serializePresetFile,
  serializeSettingsBackup,
  upsertRecentDevice,
  type AppPreferences,
} from './localData';
import type {
  AncMode,
  AncScene,
  AncSubMode,
  BatteryState,
  DeviceProfile,
  EqBucket,
  EqModeProfile,
  LastKnownBattery,
  LogEntry,
  PageId,
  RecentDevice,
  SavedEqPreset,
  ThemePref,
  Transport,
} from '../types';
import { ZERO_BANDS } from '../types';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/**
 * Manual profile overrides, keyed by canonical MAC. The user picks a profile
 * on the Devices page; the choice must survive a reconnect for that exact
 * unit, but must never leak to a different device that happens to share a
 * marketing name. Persisted locally only — nothing is sent to hardware.
 */
const PROFILE_INTENT_KEY = 'sc.device.intent';

function readProfileIntent(): Record<string, string> {
  const raw = load<unknown>(PROFILE_INTENT_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 64) out[key] = value;
  }
  return out;
}

/** Clamp a value into a declared range, falling back to the protocol bounds. */
function clampToRange(value: number, range: { min: number; max: number } | undefined, fallback: { min: number; max: number }): number {
  const min = range?.min ?? fallback.min;
  const max = range?.max ?? fallback.max;
  return Math.max(min, Math.min(max, value));
}

/** A last-known battery snapshot, only when the device reported a real level. */
function snapshotBattery(b: BatteryState): LastKnownBattery | null {
  if (b.left === null && b.right === null && b.case === null) return null;
  return { left: b.left, right: b.right, case: b.case, at: Date.now() };
}

/**
 * Read a printable-ASCII field out of a state payload. Returns null when the
 * region is absent or contains non-text bytes, so a layout mismatch shows up
 * as "Unknown" in the UI instead of mojibake.
 */
function ascii(payload: Uint8Array, at: number, length: number): string | null {
  if (at + length > payload.length) return null;
  let out = '';
  for (let i = at; i < at + length; i++) {
    const b = payload[i];
    if (b === 0x00) break;
    if (b < 0x20 || b > 0x7e) return null;
    out += String.fromCharCode(b);
  }
  const trimmed = out.trim();
  return trimmed.length >= 3 ? trimmed : null;
}

/**
 * Which device operation is in flight (`null` = idle). Components disable
 * their controls while their own key is busy, so a slow RFCOMM write can
 * never be double-fired or look dead (loading state per operation).
 */
export type BusyKey = 'anc' | 'eq' | 'gaming' | 'ldac' | 'dual' | 'surround' | 'reset' | null;

interface AppState {
  page: PageId;
  setPage: (p: PageId) => void;
  connected: boolean;
  connecting: boolean;
  /** Derived single-source-of-truth phase for badges across the UI. */
  connectionPhase: ConnectionPhase;
  /** Per-model, protocol-derived feature matrix — see src/state/derive.ts. */
  capabilities: Capabilities;
  /** Per-side earbud state; `supported` is false without L/R hardware. */
  earbudState: EarbudState;
  /** Operation currently in flight, for loading/disabled states. */
  busy: BusyKey;
  transportLabel: string;
  deviceName: string;
  /** Bluetooth address of the active bridge session (null for simulator/none). */
  connectedMac: string | null;
  profile: DeviceProfile;
  /** Every installed profile (plus the fallback) for the Devices preview picker. */
  availableProfiles: DeviceProfile[];
  setProfileId: (id: string) => void;
  battery: BatteryState;
  ancMode: AncMode;
  ancLevel: number;
  ancScene: AncScene;
  transVocal: boolean;
  windNoise: boolean;
  gaming: boolean;
  ldac: boolean;
  dual: boolean;
  /** Local interface sounds (real app behavior, persisted). */
  prompts: boolean;
  /** Appearance preference (Settings → Appearance), persisted. */
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  firmware: string;
  serial: string | null;
  linkInfo: string | null;
  profileNote: string | null;
  eqId: string;
  bands: number[];
  surround: boolean;
  /** Named user EQ curves, stored locally; applying one sends a real EQ frame. */
  savedPresets: SavedEqPreset[];
  /** Remember the current curve as a named local preset. */
  savePreset: (name: string) => SavedEqPreset | null;
  deleteSavedPreset: (id: string) => void;
  /** Apply a locally saved curve through the model's real EQ command. */
  applySavedPreset: (preset: SavedEqPreset) => Promise<void>;
  /** Import presets from an exported JSON file; returns the number added. */
  importSavedPresets: (text: string) => { added: number; error?: string };
  /** Serialized export of every saved preset (local file download). */
  exportSavedPresets: () => string;
  /** One remembered curve per noise mode (local-only memory, re-applied on mode change). */
  eqModeProfiles: Record<EqBucket, EqModeProfile | null>;
  clearEqModeProfile: (bucket: EqBucket) => void;
  /** Behaviour preferences (persisted; see localData.AppPreferences). */
  preferences: AppPreferences;
  setPreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
  log: LogEntry[];
  /** Last few bridge devices, most recent first — one-tap reconnect. */
  recentDevices: RecentDevice[];
  /** Drop one entry from the local reconnect list (real, local-only action). */
  forgetRecentDevice: (mac: string) => void;
  /** Set/clear the local display name for a recent device (never sent to hardware). */
  renameRecentDevice: (mac: string, label: string | null) => void;
  /** Re-open the control link to the current device (Windows audio route is OS-owned). */
  reclaimAudio: () => Promise<void>;
  /** Serialized backup of local settings (theme, preferences, presets, recents). */
  exportSettings: () => string;
  /** Restore a backup produced by exportSettings; returns a short outcome message. */
  importSettings: (text: string) => { ok: boolean; message: string };
  /** Reset every local app setting to its default (does not touch the device). */
  resetAppSettings: () => void;
  error: string | null;
  clearError: () => void;
  connectBridge: (mac: string, name?: string, windowsBattery?: number | null) => Promise<void>;
  connectSim: (customProfileId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setAnc: (mode: AncMode, level?: number, scene?: AncScene) => Promise<void>;
  setTransVocal: (on: boolean) => Promise<void>;
  setWindNoise: (on: boolean) => Promise<void>;
  setGaming: (on: boolean) => Promise<void>;
  setLdac: (on: boolean) => Promise<void>;
  setDual: (on: boolean) => Promise<void>;
  setSurroundSound: (on: boolean) => Promise<void>;
  setPrompts: (on: boolean) => void;
  applyPreset: (preset: EqPreset) => Promise<void>;
  setBand: (index: number, db: number) => void;
  commitEq: () => Promise<void>;
  applyBands: (bands: number[]) => Promise<void>;
  inject: (bytes: Uint8Array, note?: string) => Promise<void>;
  clearLog: () => void;
  resetDevice: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

/**
 * Exported only as a seam for the deterministic render tests
 * (scripts/test_ui_render.mjs), which render cards against fixed states
 * without a browser. AppProvider remains the only production writer.
 */
export const AppContext = Ctx;

let seq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const transportRef = useRef<Transport | null>(null);
  const [page, setPage] = useState<PageId>('dashboard');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [transportLabel, setTransportLabel] = useState('Not connected');
  const [deviceName, setDeviceName] = useState('No device');
  const [connectedMac, setConnectedMac] = useState<string | null>(null);
  // Before any device is linked (and whenever the installed set changes) the
  // honest preview is the bundled generic profile: it claims no capability.
  const [profile, setProfile] = useState<DeviceProfile>(BUNDLED_FALLBACK.profile);
  const profileRef = useRef(profile);
  const [registry, setRegistry] = useState<ProfileRegistry>(() => ({
    sources: [],
    fallback: BUNDLED_FALLBACK,
  }));
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const [profileMissing, setProfileMissing] = useState(false);
  // A simulator session pins an explicit profile; folder changes must not
  // re-resolve it to the fallback while the dev-only sim is running.
  const simPinnedRef = useRef(false);
  const [battery, setBattery] = useState<BatteryState>(emptyBattery);
  // Persisted recent-device list. Sanitized on load: only well-formed entries
  // survive, a non-array value falls back to empty, MACs are canonicalized,
  // and duplicates are dropped keeping the first. Optional user labels and
  // last-known battery snapshots are validated by localData.
  const [recentDevices, setRecentDevices] = useState<RecentDevice[]>(() =>
    sanitizeRecentDevices(load<unknown>('soundcontrol_recent_devices', [])),
  );
  const recentDevicesRef = useRef<RecentDevice[]>(recentDevices);
  recentDevicesRef.current = recentDevices;
  // Named EQ curves and per-noise-mode memory are local-only conveniences.
  const [savedPresets, setSavedPresets] = useState<SavedEqPreset[]>(() =>
    sanitizeSavedPresets(load<unknown>('sc.eq.presets', [])),
  );
  const [eqModeProfiles, setEqModeProfiles] = useState<Record<EqBucket, EqModeProfile | null>>(
    () => sanitizeEqModeProfiles(load<unknown>('sc.eq.modes', null)),
  );
  const eqModeProfilesRef = useRef(eqModeProfiles);
  eqModeProfilesRef.current = eqModeProfiles;
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    sanitizePreferences(load<unknown>('sc.prefs', DEFAULT_PREFERENCES)),
  );
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  // The low-battery nudge should fire once per connection, not every poll.
  const lowBatteryWarned = useRef(false);
  const [ancMode, setAncMode] = useState<AncMode>('anc');
  const ancModeRef = useRef(ancMode);
  ancModeRef.current = ancMode;
  const [ancLevel, setAncLevel] = useState(5);
  const [ancScene, setAncScene] = useState<AncScene>('outdoor');
  // The A3959 firmware owns the adaptive strength and sensitivity; these mirror
  // the last `06:01` report so every write echoes them back unchanged.
  const [ancSubMode, setAncSubMode] = useState<AncSubMode>('manual');
  const [ancAdaptiveLevel, setAncAdaptiveLevel] = useState(5);
  const [ancSensitivity, setAncSensitivity] = useState<number | undefined>(undefined);
  const [transVocal, setTransVocalState] = useState(false);
  const [windNoise, setWindNoiseState] = useState(false);
  const [gaming, setGamingState] = useState(false);
  const [ldac, setLdacState] = useState(false);
  const [dual, setDualState] = useState(false);
  // Sanitized on load: only a real boolean survives; anything corrupt falls
  // back to the default (prompts on), matching the theme sanitization below.
  const [prompts, setPromptsState] = useState(() => {
    const p = load<unknown>('sc.prompts', true);
    return typeof p === 'boolean' ? p : true;
  });
  // Appearance preference. Sanitized on load: a corrupt/legacy value falls
  // back to 'system' rather than an invalid data-theme attribute.
  const [theme, setThemeState] = useState<ThemePref>(() => {
    const v = load<string>('sc.theme', 'system');
    return v === 'dark' || v === 'light' ? v : 'system';
  });
  // Read from the device over `01:05` (or the state blob where the layout is
  // known). "Unknown" until the hardware answers — never a made-up version.
  const [firmware, setFirmware] = useState('Unknown');
  const [serial, setSerial] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<string | null>(null);
  const [eqId, setEqId] = useState('signature');
  const [bands, setBands] = useState<number[]>([...ZERO_BANDS]);
  const [surround, setSurroundState] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Hydrate the profile registry from the main process and keep it live: the
   * folder watcher pushes a fresh validated snapshot whenever a `.json` file
   * is added, edited or removed, so a downloaded profile takes effect without
   * restarting the app. Nothing is fetched from the network.
   */
  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!api?.listDeviceProfiles) return;
    let cancelled = false;
    const apply = (snapshot: DeviceProfilesSnapshot) => {
      if (cancelled) return;
      setRegistry(registryFromSnapshot(snapshot));
    };
    void api
      .listDeviceProfiles()
      .then(apply)
      .catch(() => {
        /* no IPC surface (browser preview): the bundled fallback still works */
      });
    const unsubscribe = api.onDeviceProfilesChanged?.(apply);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /**
   * Re-resolve the active profile from the current identity and registry.
   * `resolveProfile` checks a persisted per-MAC override first, then the
   * normalized name/MAC against every installed `match.names` alias, then the
   * bundled fallback with the explicit download note.
   */
  useEffect(() => {
    if (simPinnedRef.current) return;
    if (!connected) {
      // Before a device links, preview the fallback: no capability is claimed
      // until a real identity (or an explicit override) picks a profile.
      const fresh = registry.fallback.profile;
      profileRef.current = fresh;
      setProfile(fresh);
      setProfileMissing(false);
      return;
    }
    const resolution = resolveProfile(deviceName, connectedMac, registry, readProfileIntent());
    profileRef.current = resolution.profile;
    setProfile(resolution.profile);
    setProfileMissing(resolution.missing);
  }, [connected, connectedMac, deviceName, registry]);

  /** Exact download prompt when no installed profile matched the device. */
  const profileNote = profileMissing ? PROFILE_NOT_FOUND_NOTE : null;

  /** Installed profiles for the Devices preview picker (fallback last). */
  const availableProfiles = useMemo<DeviceProfile[]>(() => {
    const installed = registry.sources.map((source) => source.profile);
    const fallback = registry.fallback.profile;
    return installed.some((p) => p.id === fallback.id) ? installed : [...installed, fallback];
  }, [registry]);

  /** Protocol-derived capability matrix for the connected (or previewed) model. */
  const capabilities = useMemo(
    () => deriveCapabilities(profile, firmware),
    [profile, firmware],
  );

  /** Per-side earbud state; null for hardware without independent L/R sides. */
  const earbudState = useMemo(() => deriveEarbudState(battery, capabilities), [battery, capabilities]);

  /** The one connection phase every badge in the UI renders from. */
  const connectionPhase = useMemo(
    () => deriveConnectionPhase({ connected, connecting, error }),
    [connected, connecting, error],
  );

  /**
   * Mirror a `06:01` sound-mode report back into the UI. Layouts differ per
   * TWS family, so this reads only the bytes that are unambiguous in all of
   * them: byte 0 is the ambient mode everywhere, and byte 1's high nibble is
   * the manual ANC level everywhere.
   */
  const syncSoundModes = useCallback((payload: Uint8Array) => {
    // The device's own sound-mode report is the ONLY input that moves the
    // confirmed ANC state; parseSoundModes (pure, unit-tested) rejects
    // malformed mirrors so garbage can never overwrite a confirmed mode.
    const report = parseSoundModes(payload, profileRef.current.ancLayout);
    if (!report) return;
    setAncMode(report.mode);
    if (report.level !== undefined) setAncLevel(report.level);
    if (report.subMode !== undefined) setAncSubMode(report.subMode);
    if (report.adaptiveLevel !== undefined) setAncAdaptiveLevel(report.adaptiveLevel);
    if (report.adaptiveSensitivity !== undefined) setAncSensitivity(report.adaptiveSensitivity);
    if (report.transVocal !== undefined) setTransVocalState(report.transVocal);
    if (report.wind !== undefined) setWindNoiseState(report.wind);
    if (report.scene !== undefined) setAncScene(report.scene);
  }, []);

  const pushLog = useCallback((dir: LogEntry['dir'], data: ArrayLike<number> | string, note?: string) => {
    const hex = typeof data === 'string' ? data : toHex(data);
    const valid = typeof data === 'string' ? null : verifyFrame(data);
    setLog((prev) => {
      const next: LogEntry[] = [
        {
          id: seq++,
          ts: performance.now(),
          dir,
          hex,
          note: note ?? (typeof data === 'string' ? undefined : describePacket(data)),
          valid,
        },
        ...prev,
      ];
      return next.slice(0, 400);
    });
  }, []);

  /**
   * Windows toast via the desktop bridge. Silently absent in browser/dev
   * preview — the in-app activity log still records every nudge, so nothing
   * is lost when the OS notification surface is unavailable.
   */
  const notify = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined') return;
    try {
      void window.electronAPI?.notify?.(title, body);
    } catch {
      /* notification support is optional */
    }
  }, []);

  const onRx = useCallback(
    (data: Uint8Array) => {
      pushLog('rx', data);
      if (data[0] !== 0x09 || data[1] !== 0xff || data.length < 10) return;
      // A frame that fails the additive checksum is malformed wire data, not
      // telemetry: it is already logged (marked invalid) and must never move
      // parsed state — absence of valid data keeps the previous confirmed
      // values, while valid data with an absent side clears it (see
      // mergeBatteryTelemetry).
      if (!verifyFrame(data)) return;

      const cat = data[5];
      const typ = data[6];
      const payload = data.slice(9, data.length - 1);
      const offsets = profileRef.current.state;

      // `0xFF` means "that side is not connected to the host"; it is not a
      // zero-percent battery. Over-ears report one level, not a pair. The
      // byte rules live in derive.batteryLevel so tests cover them.

      if (cat === 0x01 && typ === 0x05) {
        // Serial number + firmware: 10 bytes of ASCII "XX.XX" + "XX.XX",
        // then 16 bytes of ASCII serial. Every supported model answers this,
        // which is why firmware is read here rather than from the state blob.
        const fw = ascii(payload, 0, 10);
        const sn = ascii(payload, 10, 16);
        if (fw) setFirmware(fw);
        if (sn) setSerial(sn);
        return;
      }

      if (cat === 0x01 && typ === 0x04 && payload.length >= 1) {
        // Charging flag for the first reported side (PROTOCOL.md documents
        // "charging flag(s)" without byte-confirmed multi-side semantics, so
        // only byte0 is consumed). A flag can never attach to a side the
        // device has explicitly reported absent — a charging bud is present
        // by definition, so this frame contradicts a confirmed 'right'/'none'
        // presence and is ignored rather than allowed to dirty the state.
        setBattery((p) =>
          p.presence === 'right' || p.presence === 'none'
            ? p
            : { ...p, leftCharging: (payload[0] & 0x01) !== 0 },
        );
        return;
      }

      if (cat === 0x02 && (typ === 0x81 || typ === 0x83) && payload.length >= 4) {
        const id = payload[0] | (payload[1] << 8);
        const at = offsets.eqBands?.at ?? 2 + 1;
        const count = offsets.eqBands?.count ?? 8;
        const bandStart = typ === 0x81 ? 3 : 2;
        const raw = payload.slice(bandStart, bandStart + count);
        if (raw.length === count) {
          const hit = presetById(id);
          setEqId(hit ? hit.id : 'custom');
          setBands(Array.from(raw.slice(0, 8), (b) => Math.round(b - 120) / 10));
        }
        void at;
        return;
      }

      if (cat === 0x06 && typ === 0x01) {
        // The device's own sound-mode report. Mirroring it back keeps the UI
        // honest when a level was changed from the phone app.
        syncSoundModes(payload);
        return;
      }

      let sawBatteryFrame = false;
      let rawLeft: number | undefined;
      let rawRight: number | undefined;
      let rawCase: number | undefined;
      let chargingLeft: boolean | undefined;
      let chargingRight: boolean | undefined;

      if (cat === 0x01 && typ === 0x01) {
        // Full state update. Field offsets are model-specific — see
        // src/protocol/devices.ts, where each row cites the OpenSCQ30 packet
        // definition it came from.
        sawBatteryFrame = true;
        rawLeft = payload[offsets.batteryLeft];
        rawRight = offsets.batteryRight === null ? undefined : payload[offsets.batteryRight];
        // Only models whose documented layout carries a case byte expose one;
        // the UI renders it only when the profile says it is real.
        rawCase = offsets.batteryCase === null ? undefined : payload[offsets.batteryCase];
        if (offsets.batteryChargingLeft !== null) {
          chargingLeft = (payload[offsets.batteryChargingLeft] & 0x01) !== 0;
        }
        if (offsets.batteryChargingRight !== null) {
          chargingRight = (payload[offsets.batteryChargingRight] & 0x01) !== 0;
        }
        if (offsets.firmware) {
          const fw = ascii(payload, offsets.firmware.at, offsets.firmware.length);
          if (fw) setFirmware(fw);
        }
        if (offsets.serial) {
          const sn = ascii(payload, offsets.serial.at, offsets.serial.length);
          if (sn) setSerial(sn);
        }
      } else if (cat === 0x01 && typ === 0x03 && payload.length >= 1) {
        // The explicit battery query returns left/right in the first bytes.
        sawBatteryFrame = true;
        rawLeft = payload[0];
        rawRight = offsets.batteryRight === null ? undefined : payload[1];
      }
      if (!sawBatteryFrame) return;

      // Single source-of-truth merge (derive.mergeBatteryTelemetry, covered
      // by the stale-battery regression tests): a side whose CURRENT byte is
      // 0xFF (explicitly absent), missing, or untrustworthy (> 100) becomes
      // null — a previous level can never survive telemetry that says the
      // side is gone. Device-reported levels are the model's raw steps
      // (0..5 / 0..10 — PROTOCOL.md); batteryPercent() passes values above
      // the scale through, so percent-reporting firmware degrades safely.
      setBattery((previous) =>
        mergeBatteryTelemetry(previous, {
          rawLeft,
          rawRight,
          rawCase,
          chargingLeft,
          chargingRight,
          // An unidentified model has no proven scale: levels stay raw and
          // every percent readout degrades to the honest "unavailable".
          scale: profileRef.current.batteryMax ?? 'unknown',
        }),
      );

      // One quiet nudge per connection when any reported side drops under 20%.
      // Never for an unidentified model: without a proven scale the "20%"
      // threshold itself would be a guess (raw 4 is 80% on scale-5, 40% on
      // scale-10) — the nudge stays silent instead of warning with a
      // fabricated percentage.
      const scale = profileRef.current.batteryMax;
      const low =
        scale === null
          ? []
          : [batteryLevel(rawLeft), batteryLevel(rawRight)]
              .filter((v): v is number => v !== null)
              .map((v) => (v / scale) * 100)
              .filter((p) => p < 20);
      const caseLevel = scale === null ? null : batteryLevel(rawCase);
      const caseLow = scale !== null && caseLevel !== null && (caseLevel / scale) * 100 < 20;
      if (!lowBatteryWarned.current && (low.length > 0 || caseLow)) {
        lowBatteryWarned.current = true;
        const parts: string[] = [];
        if (low.length > 0) parts.push(low.map((p) => `${Math.round(p)}%`).join(', '));
        if (caseLow) parts.push('charging case');
        const message = `Low battery: ${parts.join(' · ')} — charge soon`;
        pushLog('sys', '', message);
        if (preferencesRef.current.lowBatteryNotifications) {
          notify('SoundControl — low battery', message);
        }
      }
    },
    [notify, pushLog, syncSoundModes],
  );
  const write = useCallback(
    async (data: Uint8Array, note?: string) => {
      const t = transportRef.current;
      if (!t) throw new Error('Connect a device first');
      pushLog('tx', data, note);
      try {
        await t.write(data);
      } catch (err) {
        // A Windows Bluetooth operation can be busy while audio is streaming.
        // The UI is already optimistic, so acknowledge the transient failure
        // and let the user resend without showing an error popup.
        if (isTransportBusyError(err)) {
          pushLog('sys', '', 'Earbuds busy — kept your setting, tap again to resend');
          if (prompts) await beep('ok');
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        pushLog('sys', '', msg);
        throw err;
      }
    },
    [prompts, pushLog],
  );

  const attach = useCallback(
    async (
      t: Transport,
      name: string,
      bat?: Partial<BatteryState> | number | null,
      dspChannel?: number | null,
      mac?: string | null,
      override?: DeviceProfile,
    ) => {
      transportRef.current = t;
      setTransportLabel(t.label);
      setDeviceName(name);
      // A real session resolves from the installed JSON profiles (name or MAC
      // against `match.names`, plus a persisted per-MAC override). The
      // dev-only simulator passes the profile its scripted telemetry was
      // captured for, so its state offsets stay correct.
      const resolution = override
        ? { profile: override, note: null, missing: false }
        : resolveProfile(name, mac, registryRef.current, readProfileIntent());
      const nextProfile = resolution.profile;
      simPinnedRef.current = override !== undefined;
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      setProfileMissing(resolution.missing);
      // Clear the previous device's telemetry: firmware and serial are read
      // per device, and showing a stale value is worse than showing none.
      setFirmware('Unknown');
      setSerial(null);
      lowBatteryWarned.current = false;
      setLinkInfo(
        typeof dspChannel === 'number'
          ? `DSP verified on RFCOMM channel ${dspChannel}`
          : null,
      );
      const note = resolution.note;
      // A fresh connection ALWAYS starts from the cleared battery state —
      // even when no seed is supplied (manual-MAC connects have none). Both
      // sides stay `unknown` until the device's own telemetry confirms them;
      // a Bluetooth link is never treated as "both earbuds connected".
      const seed = emptyBattery();
      if (typeof bat === 'number') {
        // Windows PnP aggregate percent (scale null = already a percentage).
        // It goes to `left` only — copying it to `right` would fabricate a
        // per-side value Windows never reported.
        seed.left = bat;
      } else if (bat && typeof bat === 'object') {
        if (bat.left != null) seed.left = bat.left;
        if (bat.right != null) seed.right = bat.right;
        seed.batteryScale = bat.batteryScale ?? null;
        seed.presence = bat.presence ?? 'unknown';
      }
      setBattery(seed);
      // Feature state is per-device as well: back to power-on defaults until
      // the new device confirms its own (06:01 sound-mode / 02:81 EQ mirrors).
      setAncMode('anc');
      setAncLevel(
        clampToRange(5, nextProfile.ancLevelRange, { min: 1, max: 5 }),
      );
      setAncScene('outdoor');
      setAncSubMode('manual');
      setAncAdaptiveLevel(5);
      setAncSensitivity(undefined);
      setTransVocalState(false);
      setWindNoiseState(false);
      setGamingState(false);
      setLdacState(false);
      setDualState(false);
      setSurroundState(false);
      setEqId('signature');
      setBands([...ZERO_BANDS]);
      setConnected(true);
      setPage('dashboard');
      pushLog(
        'sys',
        '',
        `Linked via ${t.label} · profile ${nextProfile.name} (${nextProfile.sku})` +
          (typeof dspChannel === 'number' ? ` · DSP ch${dspChannel}` : ''),
      );
      if (note) pushLog('sys', '', note);
      if (!nextProfile.eqCommand) {
        pushLog(
          'sys',
          '',
          nextProfile.fallback
            ? 'The device model could not be identified, so SoundControl sends no equalizer frames — EQ stays disabled until the model is known. No payload is ever guessed.'
            : `${nextProfile.name} takes its equalizer over the model-specific 03:87 HearID frame, which SoundControl does not send — EQ is disabled for this model.`,
        );
      }
      try {
        await t.write(INIT);
        pushLog('tx', INIT, 'State request');
      } catch (err) {
        pushLog('sys', '', err instanceof Error ? err.message : String(err));
      }
      try {
        // `01:05` is the only firmware/serial read every supported model
        // implements, so it goes out on every connect.
        await t.write(DEVICE_INFO);
        pushLog('tx', DEVICE_INFO, 'Serial + firmware query');
      } catch (err) {
        pushLog('sys', '', err instanceof Error ? err.message : String(err));
      }
      try {
        await t.write(buildBatteryQuery());
        pushLog('tx', buildBatteryQuery(), 'Battery query');
      } catch (err) {
        // Some over-ear models only expose battery in the state-update frame.
        pushLog('sys', '', err instanceof Error ? err.message : String(err));
      }
      if (nextProfile.ldac && t.kind === 'bridge') {
        try {
          await t.write(LDAC.query);
          pushLog('tx', LDAC.query, 'LDAC query');
        } catch {
          /* codec query is best-effort; the toggle still works */
        }
      }
      await beep('ok');
    },
    [pushLog],
  );

  // True while a connect is running. Duplicate attempts (double-tap, or a
  // second device picked while the first is still connecting) are ignored:
  // two concurrent bridge sessions would leave a stale WebSocket registered
  // in the helper's client list and deliver every device frame twice.
  const connectInFlight = useRef(false);

  const wrapConnect = useCallback(
    async (fn: () => Promise<void>) => {
      if (connectInFlight.current) return;
      connectInFlight.current = true;
      setError(null);
      setConnecting(true);
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        pushLog('sys', '', msg);
        await beep('warn');
        throw err;
      } finally {
        connectInFlight.current = false;
        setConnecting(false);
      }
    },
    [pushLog],
  );

  /**
   * Close and forget the active transport *before* a new connect starts.
   * Order matters: the bridge owns exactly one RFCOMM link, so sending the
   * old session's `disconnect` *after* the new connect finished would tear
   * down the new device link.
   */
  const releaseTransport = useCallback(async () => {
    const t = transportRef.current;
    transportRef.current = null;
    if (t) {
      try {
        await t.close();
      } catch {
        /* the old link may already be dead */
      }
    }
  }, []);

  /**
   * Clear EVERY piece of device-specific state: identity, battery (levels,
   * per-side presence, charging, scale), link info, firmware/serial, ANC
   * intent, feature toggles and EQ. Used by both the explicit disconnect and
   * the unexpected link-down path — no stale value may survive the control
   * link, and capabilities fall back to the same default profile a fresh
   * launch shows.
   */
  const clearDeviceState = useCallback(() => {
    setConnected(false);
    setConnectedMac(null);
    setTransportLabel('Not connected');
    setDeviceName('No device');
    setBattery(emptyBattery());
    setLinkInfo(null);
    setFirmware('Unknown');
    setSerial(null);
    const fresh = registryRef.current.fallback.profile;
    simPinnedRef.current = false;
    profileRef.current = fresh;
    setProfile(fresh);
    setProfileMissing(false);
    setAncMode('anc');
    setAncLevel(clampToRange(5, fresh.ancLevelRange, { min: 1, max: 5 }));
    setAncScene('outdoor');
    setAncSubMode('manual');
    setAncAdaptiveLevel(5);
    setAncSensitivity(undefined);
    setTransVocalState(false);
    setWindNoiseState(false);
    setGamingState(false);
    setLdacState(false);
    setDualState(false);
    setSurroundState(false);
    setEqId('signature');
    setBands([...ZERO_BANDS]);
  }, []);

  const connectBridgePort = useCallback(
    (mac: string, label?: string, windowsBattery?: number | null) =>
      wrapConnect(async () => {
        // Switching devices (ConnectSheet is reachable while connected, e.g.
        // from the Settings tab): tear the old session down first so its
        // WebSocket is not left registered in the helper's client list.
        await releaseTransport();
        // Manual-address connects carry no label. Fall back to the name
        // Windows reported the last time THIS mac connected (the persisted
        // recent list): the model name selects the device profile — and with
        // it the battery scale — so restoring a real persisted name beats
        // treating a known device as generic (a scale-5 model read against
        // the scale-10 default shows half its real percentage). Nothing is
        // invented: a mac that was never named stays unnamed.
        const resolvedLabel =
          label ??
          recentDevices.find((d) => d.mac.toUpperCase() === mac.toUpperCase())?.name;
        // Filled in once connectBridge resolves; the link-down callback uses
        // it to verify the dropped transport is still the active one (a fast
        // disconnect→reconnect must not let the old socket's close tear down
        // the new session).
        const linked: { transport: Transport | null } = { transport: null };
        const { transport, name, battery: b, dspChannel } = await connectBridge(
          mac,
          onRx,
          resolvedLabel,
          windowsBattery ?? null,
          // Bridge diagnostics (probe results, silent-link watchdog) belong
          // in the same console the user watches while connecting.
          (text) => pushLog('sys', '', text),
          // The helper socket dropped unexpectedly after a successful connect
          // (helper exit/crash/restart): leave the "Connected" state out loud
          // instead of sitting there until the next write fails.
          (reason) => {
            if (!linked.transport || transportRef.current !== linked.transport) return;
            transportRef.current = null;
            // The whole control link died: every piece of device state goes
            // with it — a stale name/battery/L-R panel next to a dead link is
            // exactly the misleading UI the state model forbids.
            clearDeviceState();
            setError(reason);
            pushLog('sys', '', reason);
            if (prompts) void beep('warn');
          },
        );
        linked.transport = transport;
        await attach(transport, name, b, dspChannel, mac || null);
        setConnectedMac(mac || null);
        // Settings persistence: remember the last few devices for one-tap
        // reconnect on the next launch.
        if (mac) {
          setRecentDevices((prev) => {
            // Canonical uppercase MAC (the bridge's normal form) so a
            // lowercase manual entry cannot persist as a case-variant
            // duplicate. A user label and the previous battery snapshot
            // survive a reconnect; the reported name is refreshed.
            const next = upsertRecentDevice(prev, {
              mac,
              name: name || 'soundcore',
            });
            save('soundcontrol_recent_devices', next);
            return next;
          });
        }
      }),
    [attach, clearDeviceState, onRx, prompts, pushLog, recentDevices, releaseTransport, wrapConnect],
  );

  const connectSim = useCallback(
    (customProfileId?: string) =>
      wrapConnect(async () => {
        // TEST DATA ONLY — dev builds. `import.meta.env.DEV` folds to a
        // literal at build time, so production bundles constant-fold this
        // whole branch away and Rollup never emits the simulator module:
        // emulated device state cannot leak into the packaged app.
        if (!import.meta.env.DEV) {
          throw new Error('The developer simulator is only available in development builds.');
        }
        const { connectSimulator } = await import('../transports/simulator');
        // Leave any real bridge session before starting the simulator (and
        // release its RFCOMM link in the helper) — see releaseTransport.
        await releaseTransport();
        const targetProfile = customProfileId
          ? DEVICES.find((d) => d.id === customProfileId)
          : undefined;
        const simProfile = targetProfile ?? profileRef.current;
        const { transport, name, battery: b } = connectSimulator(onRx, simProfile);
        // Pin the simulator's own profile: folder changes must not re-resolve
        // the scripted session to a downloaded or fallback profile.
        await attach(transport, name, b, undefined, null, simProfile);
        setConnectedMac(null);
      }),
    [attach, onRx, releaseTransport, wrapConnect],
  );

  const setSurroundSound = useCallback(
    async (on: boolean) => {
      const prev = surround;
      setSurroundState(on);
      setBusy('surround');
      try {
        await write(buildSurroundSound(on), `3D Surround ${on ? 'on' : 'off'}`);
      } catch (err) {
        // The command never reached the device: restore the real state so the
        // toggle cannot claim something the hardware did not do.
        setSurroundState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('ok');
    },
    [prompts, surround, write],
  );

  const resetDevice = useCallback(async () => {
    setBusy('reset');
    try {
      await write(buildResetDevice(), 'Factory Reset');
    } catch (err) {
      // Reset did not reach the device — keep the UI state as it is.
      throw err;
    } finally {
      setBusy(null);
    }
    // The device confirmed the reset frame; mirror the factory defaults it
    // now holds instead of keeping pre-reset values on screen.
    setBands([...ZERO_BANDS]);
    setEqId('signature');
    setSurroundState(false);
    setAncMode('anc');
    setAncLevel(clampToRange(5, profile.ancLevelRange, { min: 1, max: 5 }));
    setAncSubMode('manual');
    setAncAdaptiveLevel(5);
    setAncSensitivity(undefined);
    setGamingState(false);
    if (prompts) await beep('ok');
  }, [profile.ancLevelRange, prompts, write]);

  const disconnect = useCallback(async () => {
    const t = transportRef.current;
    transportRef.current = null;
    clearDeviceState();
    try {
      await t?.close();
    } catch {
      /* */
    }
    pushLog('sys', '', 'Disconnected');
  }, [clearDeviceState, pushLog]);

  /**
   * Every sound-mode change re-sends the whole `06:81` payload, so all four
   * pieces of intent have to be current at once — sending a partial frame is
   * how a level silently reverts on the device.
   */
  const ancIntent = useCallback(
    (over: Partial<AncIntent> = {}): AncIntent => ({
      mode: over.mode ?? ancMode,
      level: over.level ?? ancLevel,
      // The sub-mode travels with every frame: on the A3959 the automation
      // byte decides whether the manual level, the adaptive mode or the
      // multi-scene selection is the one the firmware applies.
      subMode: over.subMode ?? ancSubMode,
      adaptiveLevel: over.adaptiveLevel ?? ancAdaptiveLevel,
      adaptiveSensitivity: over.adaptiveSensitivity ?? ancSensitivity,
      scene: over.scene ?? ancScene,
      transVocal: over.transVocal ?? transVocal,
      wind: over.wind ?? windNoise,
    }),
    [
      ancAdaptiveLevel,
      ancLevel,
      ancMode,
      ancScene,
      ancSensitivity,
      ancSubMode,
      transVocal,
      windNoise,
    ],
  );

  const sendAnc = useCallback(
    async (intent: AncIntent, note: string) => {
      const pkt = buildAnc(profile.ancLayout, intent);
      if (!pkt) {
        pushLog(
          'sys',
          '',
          `${profile.name} (${profile.sku}) has no sound-mode control — nothing was sent.`,
        );
        return;
      }
      await write(pkt, note);
    },
    [profile.ancLayout, profile.name, profile.sku, pushLog, write],
  );

  /** Persist one curve as the remembered curve for a noise-mode bucket. */
  const rememberEq = useCallback((bucket: EqBucket, entry: EqModeProfile) => {
    if (!preferencesRef.current.perModeEq) return;
    setEqModeProfiles((prev) => {
      const next = { ...prev, [bucket]: entry };
      save('sc.eq.modes', next);
      return next;
    });
  }, []);

  /**
   * Re-apply the locally remembered curve for a noise mode. This sends the
   * same documented EQ frame the user originally chose — never a new command
   * — and is skipped silently when nothing is remembered or the model has no
   * documented EQ path.
   */
  const applyEqMemory = useCallback(
    async (bucket: EqBucket) => {
      const entry = eqModeProfilesRef.current[bucket];
      if (!entry) return;
      if (entry.kind === 'preset') {
        const preset = EQ_PRESETS.find((p) => p.id === entry.presetId);
        if (!preset) return;
        const pkt = buildEqPreset(profile, preset);
        if (!pkt) return;
        setEqId(preset.id);
        setBands([...preset.bands]);
        await write(pkt, `EQ ${preset.name} (${bucket} memory)`);
      } else {
        const pkt = buildCustomEq(profile, entry.bands);
        if (!pkt) return;
        setEqId('custom');
        setBands([...entry.bands]);
        await write(pkt, `EQ custom (${bucket} memory)`);
      }
    },
    [profile, write],
  );

  const setAnc = useCallback(
    async (mode: AncMode, level?: number, scene?: AncScene) => {
      // The profile may narrow the documented 1..5 range; never send a level
      // the JSON says this model does not accept.
      const appliedLevel = clampToRange(
        level ?? ancLevel,
        profile.ancLevelRange,
        { min: 1, max: 5 },
      );
      const appliedScene = scene ?? ancScene;
      // Which sub-mode the user just chose. An explicit scene pick means
      // multi-scene; the adaptive toggle means adaptive; a level button means
      // manual. On the A3959 these are mutually exclusive (byte 3), so the
      // frame always states the one that was actually selected instead of
      // leaving the firmware on a stale automation mode.
      const subMode: AncSubMode =
        scene !== undefined ? 'multiscene' : mode === 'adaptive' ? 'adaptive' : 'manual';
      const prev = { mode: ancMode, level: ancLevel, scene: ancScene, subMode: ancSubMode };
      setAncMode(mode);
      setAncLevel(appliedLevel);
      setAncScene(appliedScene);
      setAncSubMode(subMode);
      setBusy('anc');
      try {
        const intent = ancIntent({ mode, level: appliedLevel, scene: appliedScene, subMode });
        await sendAnc(
          intent,
          `ANC ${mode}${mode === 'anc' || mode === 'adaptive' ? ` L${appliedLevel}` : ''}${
            profile.scenes ? ` ${appliedScene}` : ''
          }`,
        );
      } catch (err) {
        // The 06:81 frame never reached the device: restore the previous real
        // mode instead of leaving the new one selected (PART G contract).
        setAncMode(prev.mode);
        setAncLevel(prev.level);
        setAncScene(prev.scene);
        setAncSubMode(prev.subMode);
        throw err;
      } finally {
        setBusy(null);
      }
      // Per-mode EQ memory (optional): switching noise modes re-sends the
      // curve the user last chose for that mode. Only documented EQ frames
      // are used, and a failure never rolls back the ANC mode that succeeded.
      if (preferencesRef.current.perModeEq) {
        setBusy('eq');
        try {
          await applyEqMemory(eqBucketForMode(mode));
        } catch (err) {
          pushLog(
            'sys',
            '',
            `Per-mode EQ re-apply failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          setBusy(null);
        }
      }
      if (prompts) await beep('mode');
    },
    [
      ancIntent,
      ancLevel,
      ancMode,
      ancScene,
      ancSubMode,
      applyEqMemory,
      profile.ancLevelRange,
      profile.scenes,
      prompts,
      pushLog,
      sendAnc,
    ],
  );

  const setTransVocal = useCallback(
    async (on: boolean) => {
      const prev = { vocal: transVocal, mode: ancMode };
      setTransVocalState(on);
      setAncMode('transparency');
      setBusy('anc');
      try {
        const intent = ancIntent({ mode: 'transparency', transVocal: on });
        await sendAnc(intent, on ? 'Talk mode' : 'Full transparency');
      } catch (err) {
        setTransVocalState(prev.vocal);
        setAncMode(prev.mode);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('ok');
    },
    [ancIntent, ancMode, prompts, sendAnc, transVocal],
  );

  const setWindNoise = useCallback(
    async (on: boolean) => {
      const prev = windNoise;
      setWindNoiseState(on);
      setBusy('anc');
      try {
        await sendAnc(ancIntent({ wind: on }), `Wind noise ${on ? 'on' : 'off'}`);
      } catch (err) {
        setWindNoiseState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('ok');
    },
    [ancIntent, prompts, sendAnc, windNoise],
  );

  const setGaming = useCallback(
    async (on: boolean) => {
      const prev = gaming;
      setGamingState(on);
      setBusy('gaming');
      try {
        await write(buildGameMode(profile, on), `Gaming ${on ? 'on' : 'off'}`);
      } catch (err) {
        setGamingState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('mode');
    },
    [gaming, profile, prompts, write],
  );

  const setLdac = useCallback(
    async (on: boolean) => {
      const prev = ldac;
      setLdacState(on);
      setBusy('ldac');
      try {
        await write(on ? LDAC.enable : LDAC.disable, `LDAC ${on ? 'on' : 'off'}`);
      } catch (err) {
        setLdacState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [ldac, write],
  );

  const setDual = useCallback(
    async (on: boolean) => {
      const prev = dual;
      setDualState(on);
      setBusy('dual');
      try {
        await write(on ? DUAL.enable : DUAL.disable, `Dual ${on ? 'on' : 'off'}`);
      } catch (err) {
        setDualState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [dual, write],
  );

  const applyPreset = useCallback(
    async (preset: EqPreset) => {
      const pkt = buildEqPreset(profile, preset);
      if (!pkt) {
        pushLog(
          'sys',
          '',
          profile.fallback
            ? 'The device model is unknown, so SoundControl does not guess an equalizer payload — nothing was sent.'
            : `${profile.name} takes its equalizer over the model-specific 03:87 HearID frame; SoundControl does not guess that payload, so nothing was sent.`,
        );
        return;
      }
      const prev = { eqId, bands };
      setEqId(preset.id);
      setBands([...preset.bands]);
      setBusy('eq');
      try {
        await write(pkt, `EQ ${preset.name}`);
      } catch (err) {
        setEqId(prev.eqId);
        setBands(prev.bands);
        throw err;
      } finally {
        setBusy(null);
      }
      rememberEq(eqBucketForMode(ancModeRef.current), { kind: 'preset', presetId: preset.id });
      if (prompts) await beep('ok');
    },
    [bands, eqId, profile, prompts, pushLog, rememberEq, write],
  );

  const setBand = useCallback((index: number, db: number) => {
    setEqId('custom');
    setBands((prev) => {
      const next = [...prev];
      next[index] = clampToRange(Math.round(db * 2) / 2, profile.eqRangeDb, {
        min: -6,
        max: 6,
      });
      return next;
    });
  }, [profile.eqRangeDb]);

  const commitEq = useCallback(async () => {
    const pkt = buildCustomEq(profile, bands);
    if (!pkt) return;
    setBusy('eq');
    try {
      await write(pkt, 'EQ custom');
      rememberEq(eqBucketForMode(ancModeRef.current), { kind: 'custom', bands: [...bands] });
    } finally {
      setBusy(null);
    }
  }, [bands, profile, rememberEq, write]);

  const applyBands = useCallback(
    async (next: number[]) => {
      const pkt = buildCustomEq(profile, next);
      if (!pkt) return;
      const prev = { eqId, bands };
      setEqId('custom');
      setBands(next);
      setBusy('eq');
      try {
        await write(pkt, 'EQ custom');
        rememberEq(eqBucketForMode(ancModeRef.current), { kind: 'custom', bands: [...next] });
      } catch (err) {
        setEqId(prev.eqId);
        setBands(prev.bands);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [bands, eqId, profile, rememberEq, write],
  );

  /* ---------------------------------------------------- local user data */

  const savePreset = useCallback(
    (name: string): SavedEqPreset | null => {
      const clean = sanitizeLabel(name);
      if (!clean) return null;
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `eq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preset: SavedEqPreset = {
        id,
        name: clean,
        bands: [...bands],
        createdAt: Date.now(),
      };
      setSavedPresets((prev) => {
        const next = [preset, ...prev].slice(0, SAVED_PRESET_LIMIT);
        save('sc.eq.presets', next);
        return next;
      });
      return preset;
    },
    [bands],
  );

  const deleteSavedPreset = useCallback((id: string) => {
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save('sc.eq.presets', next);
      return next;
    });
  }, []);

  const applySavedPreset = useCallback(
    async (preset: SavedEqPreset) => {
      await applyBands([...preset.bands]);
    },
    [applyBands],
  );

  const importSavedPresets = useCallback((text: string) => {
    const parsed = parsePresetFile(text);
    if (parsed.error) return { added: 0, error: parsed.error };
    let added = 0;
    setSavedPresets((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      const names = new Set(prev.map((p) => p.name.toLowerCase()));
      const fresh = parsed.presets.filter(
        (p) => !ids.has(p.id) && !names.has(p.name.toLowerCase()),
      );
      added = fresh.length;
      const next = [...fresh, ...prev].slice(0, SAVED_PRESET_LIMIT);
      save('sc.eq.presets', next);
      return next;
    });
    return { added };
  }, []);

  const exportSavedPresets = useCallback(() => serializePresetFile(savedPresets), [savedPresets]);

  const clearEqModeProfile = useCallback((bucket: EqBucket) => {
    setEqModeProfiles((prev) => {
      const next = { ...prev, [bucket]: null };
      save('sc.eq.modes', next);
      return next;
    });
  }, []);

  const setPreference = useCallback(
    <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        save('sc.prefs', next);
        return next;
      });
    },
    [],
  );

  const renameRecentDevice = useCallback((mac: string, label: string | null) => {
    setRecentDevices((prev) => {
      const next = renameRecentInList(prev, mac, label);
      save('soundcontrol_recent_devices', next);
      return next;
    });
  }, []);

  /**
   * Re-open the control link. The Windows audio route itself is owned by the
   * OS/firmware; this only re-establishes SoundControl's RFCOMM session, which
   * is what the app can honestly do after a phone call steals the link.
   */
  const reclaimAudio = useCallback(async () => {
    const mac = connectedMac ?? recentDevicesRef.current[0]?.mac;
    if (!mac) {
      pushLog('sys', '', 'No device is known yet — connect one on the Devices page first.');
      return;
    }
    const label = connectedMac
      ? deviceName
      : recentDevicesRef.current[0]?.label ?? recentDevicesRef.current[0]?.name;
    await connectBridgePort(mac, label);
    pushLog('sys', '', 'Control link re-opened. If Windows still routes audio elsewhere, pick the earbuds as the output device.');
  }, [connectBridgePort, connectedMac, deviceName, pushLog]);

  const exportSettings = useCallback(
    () =>
      serializeSettingsBackup(
        buildSettingsBackup({
          theme,
          prompts,
          preferences,
          eqPresets: savedPresets,
          eqModeProfiles,
          recentDevices,
        }),
      ),
    [eqModeProfiles, preferences, prompts, recentDevices, savedPresets, theme],
  );

  const importSettings = useCallback(
    (text: string) => {
      const { backup, error } = parseSettingsBackup(text);
      if (error) return { ok: false, message: error };
      setThemeState(backup.theme);
      save('sc.theme', backup.theme);
      setPromptsState(backup.prompts);
      save('sc.prompts', backup.prompts);
      setPreferences(backup.preferences);
      save('sc.prefs', backup.preferences);
      setSavedPresets(backup.eqPresets);
      save('sc.eq.presets', backup.eqPresets);
      setEqModeProfiles(backup.eqModeProfiles);
      save('sc.eq.modes', backup.eqModeProfiles);
      setRecentDevices(backup.recentDevices);
      save('soundcontrol_recent_devices', backup.recentDevices);
      return {
        ok: true,
        message: `Restored ${backup.eqPresets.length} preset(s) and ${backup.recentDevices.length} recent device(s).`,
      };
    },
    [],
  );

  const resetAppSettings = useCallback(() => {
    setThemeState('system');
    save('sc.theme', 'system');
    setPromptsState(true);
    save('sc.prompts', true);
    setPreferences({ ...DEFAULT_PREFERENCES });
    save('sc.prefs', DEFAULT_PREFERENCES);
    setSavedPresets([]);
    save('sc.eq.presets', []);
    setEqModeProfiles({ anc: null, normal: null, transparency: null });
    save('sc.eq.modes', { anc: null, normal: null, transparency: null });
    setRecentDevices([]);
    save('soundcontrol_recent_devices', []);
  }, []);

  const inject = useCallback(
    async (bytes: Uint8Array, note = 'Injected') => {
      await write(bytes, note);
    },
    [write],
  );

  /**
   * Apply a manual profile choice. A real connection persists it per MAC
   * (`sc.device.intent`) so the same physical unit keeps the override across
   * reconnects; a disconnected preview is in-memory only, because there is no
   * MAC to key it to.
   */
  const setProfileId = useCallback(
    (id: string) => {
      const reg = registryRef.current;
      const hit =
        reg.sources.find((source) => source.profile.id === id) ??
        (reg.fallback.profile.id === id ? reg.fallback : null);
      if (!hit) return;
      profileRef.current = hit.profile;
      setProfile(hit.profile);
      setProfileMissing(false);
      const key = canonicalMac(connectedMac);
      if (key) {
        const intent = readProfileIntent();
        intent[key] = id;
        save(PROFILE_INTENT_KEY, intent);
      }
    },
    [connectedMac],
  );

  // Keep the recent list's last-known battery fresh while connected. Only
  // real device telemetry reaches this effect, and only an actual change is
  // written back — a 30 s poll with identical bytes does not churn storage.
  useEffect(() => {
    if (!connected || !connectedMac) return;
    // A TWS model's pre-telemetry seed may be a Windows aggregate placed in
    // `left`; it is not a per-side reading, so wait for the device's own
    // presence before recording a last-known snapshot.
    if (profileRef.current.state.batteryRight !== null && battery.presence === 'unknown') return;
    const key = canonicalMac(connectedMac);
    if (!key) return;
    const snapshot = snapshotBattery(battery);
    if (!snapshot) return;
    setRecentDevices((prev) => {
      const current = prev.find((d) => d.mac === key);
      if (!current) return prev;
      const before = current.lastBattery;
      if (
        before &&
        before.left === snapshot.left &&
        before.right === snapshot.right &&
        before.case === snapshot.case
      ) {
        return prev;
      }
      const next = prev.map((d) => (d.mac === key ? { ...d, lastBattery: snapshot } : d));
      save('soundcontrol_recent_devices', next);
      return next;
    });
  }, [battery, connected, connectedMac]);

  // Optional: re-apply the user's current ANC/EQ intent when the second bud
  // joins. Only a real presence transition (left/right -> both) triggers it,
  // and only documented frames are sent.
  const lastPresenceRef = useRef<string>('unknown');
  useEffect(() => {
    const current = earbudState.connection;
    const previous = lastPresenceRef.current;
    lastPresenceRef.current = current;
    if (!connected) return;
    if (!preferencesRef.current.reapplyOnSecondBud) return;
    if (!((previous === 'left' || previous === 'right') && current === 'both')) return;
    void (async () => {
      try {
        if (capabilities.supportsNoiseControl) {
          await sendAnc(ancIntent(), 'Re-apply after second earbud connected');
        }
        if (preferencesRef.current.perModeEq) {
          await applyEqMemory(eqBucketForMode(ancModeRef.current));
        }
        pushLog('sys', '', 'Second earbud connected — re-applied the current settings.');
      } catch (err) {
        pushLog(
          'sys',
          '',
          `Re-apply after second earbud failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }, [
    ancIntent,
    applyEqMemory,
    capabilities.supportsNoiseControl,
    connected,
    earbudState.connection,
    pushLog,
    sendAnc,
  ]);

  // Optional launch reconnect. Off by default (the app is a normal desktop
  // app with no background behaviour); when enabled it reuses the exact same
  // bridge path as the Devices page, with the same error handling.
  const autoReconnectTried = useRef(false);
  useEffect(() => {
    if (autoReconnectTried.current) return;
    autoReconnectTried.current = true;
    if (!preferencesRef.current.autoReconnect) return;
    const first = recentDevicesRef.current[0];
    if (!first) return;
    void connectBridgePort(first.mac, first.label ?? first.name).catch(() => {});
  }, [connectBridgePort]);

  // Optional app-wide hotkeys (off by default). Registering happens in the
  // main process; here we only ask for the toggle state and map a press to the
  // exact same store action a click uses, so the same documented frames are
  // sent and the same capability gates apply.
  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!api?.setGlobalHotkeys) return;
    let cancelled = false;
    void api
      .setGlobalHotkeys(preferences.globalHotkeys)
      .then((result) => {
        if (cancelled || !preferences.globalHotkeys) return;
        pushLog(
          'sys',
          '',
          result.registered.length > 0
            ? `Global hotkeys active: ${result.registered.join(', ')}`
            : 'Global hotkeys could not be registered — another app may already own those keys.',
        );
      })
      .catch(() => {
        /* the toggle simply has no effect outside the desktop app */
      });
    return () => {
      cancelled = true;
    };
  }, [preferences.globalHotkeys, pushLog]);

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!api?.onHotkey) return;
    return api.onHotkey((action) => {
      if (action === 'cycle-anc') {
        if (!connected || !capabilities.supportsNoiseControl) return;
        // Adaptive cancelling is the same user-facing mode as ANC, so it
        // advances from the same slot in the cycle.
        const order: AncMode[] = ['anc', 'normal', 'transparency'];
        const index = ancMode === 'adaptive' ? 0 : order.indexOf(ancMode);
        void setAnc(order[(index + 1) % order.length]).catch(() => {});
      } else if (action === 'cycle-eq') {
        if (!connected || !capabilities.supportsEqualizer) return;
        const index = EQ_PRESETS.findIndex((p) => p.id === eqId);
        void applyPreset(EQ_PRESETS[(index + 1) % EQ_PRESETS.length]).catch(() => {});
      }
    });
  }, [
    ancMode,
    applyPreset,
    capabilities.supportsEqualizer,
    capabilities.supportsNoiseControl,
    connected,
    eqId,
    setAnc,
  ]);

  // Keep TWS battery levels fresh while connected to real hardware: the
  // device-info frame arrives once after the handshake, but the explicit
  // 01 03 battery query can be re-sent cheaply. Simulator sessions skip
  // this to keep the diagnostics log clean.
  useEffect(() => {
    if (!connected) return;
    if (transportRef.current?.kind !== 'bridge') return;
    let stopped = false;
    const timer = window.setInterval(() => {
      const t = transportRef.current;
      if (stopped || !t) return;
      const pkt = buildBatteryQuery();
      t.write(pkt)
        .then(() => pushLog('tx', pkt, 'Battery query (auto)'))
        .catch(() => {
          /* transient RFCOMM busy; next interval retries */
        });
    }, 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [connected, pushLog]);

  const value = useMemo<AppState>(
    () => ({
      page,
      setPage,
      connected,
      connecting,
      connectionPhase,
      capabilities,
      earbudState,
      busy,
      transportLabel,
      deviceName,
      connectedMac,
      profile,
      availableProfiles,
      setProfileId,
      battery,
      ancMode,
      ancLevel,
      ancScene,
      transVocal,
      windNoise,
      gaming,
      ldac,
      dual,
      surround,
      prompts,
      firmware,
      serial,
      linkInfo,
      profileNote,
      eqId,
      bands,
      savedPresets,
      savePreset,
      deleteSavedPreset,
      applySavedPreset,
      importSavedPresets,
      exportSavedPresets,
      eqModeProfiles,
      clearEqModeProfile,
      preferences,
      setPreference,
      log,
      recentDevices,
      forgetRecentDevice: (mac: string) => {
        setRecentDevices((prev) => {
          const key = mac.toUpperCase();
          const next = prev.filter((d) => d.mac.toUpperCase() !== key);
          save('soundcontrol_recent_devices', next);
          return next;
        });
      },
      renameRecentDevice,
      reclaimAudio,
      exportSettings,
      importSettings,
      resetAppSettings,
      error,
      clearError: () => setError(null),
      connectBridge: connectBridgePort,
      connectSim,
      disconnect,
      setAnc,
      setTransVocal,
      setWindNoise,
      setGaming,
      setLdac,
      setDual,
      setSurroundSound,
      setPrompts: (on) => {
        setPromptsState(on);
        save('sc.prompts', on);
      },
      theme,
      setTheme: (t) => {
        setThemeState(t);
        save('sc.theme', t);
      },
      applyPreset,
      setBand,
      commitEq,
      applyBands,
      inject,
      clearLog: () => setLog([]),
      resetDevice,
    }),
    [
      page,
      connected,
      connecting,
      connectionPhase,
      capabilities,
      earbudState,
      busy,
      transportLabel,
      deviceName,
      connectedMac,
      profile,
      availableProfiles,
      setProfileId,
      battery,
      ancMode,
      ancLevel,
      ancScene,
      transVocal,
      windNoise,
      gaming,
      ldac,
      dual,
      surround,
      prompts,
      theme,
      firmware,
      serial,
      linkInfo,
      profileNote,
      eqId,
      bands,
      savedPresets,
      savePreset,
      deleteSavedPreset,
      applySavedPreset,
      importSavedPresets,
      exportSavedPresets,
      eqModeProfiles,
      clearEqModeProfile,
      preferences,
      setPreference,
      log,
      recentDevices,
      renameRecentDevice,
      reclaimAudio,
      exportSettings,
      importSettings,
      resetAppSettings,
      error,
      connectBridgePort,
      connectSim,
      disconnect,
      setAnc,
      setTransVocal,
      setWindNoise,
      setGaming,
      setLdac,
      setDual,
      setSurroundSound,
      applyPreset,
      setBand,
      commitEq,
      applyBands,
      inject,
      resetDevice,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
