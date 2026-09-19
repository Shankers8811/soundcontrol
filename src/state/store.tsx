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
import { DEVICES, matchDevice, matchNote } from '../protocol/devices';
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
import { presetById, type EqPreset } from '../protocol/presets';
import { requiredStateLength, targetModelForProfile, withDeviceBoundary } from '../protocol/modelRegistry';
import { createSessionGuard, parseDeviceToggles } from '../protocol/responses';
import { AncExchange } from '../protocol/ancExchange';
import { planP30iAnc, p30iReportMatches, validP30iSoundModes } from '../protocol/p30i';
import { diagnosticFrame } from '../protocol/diagnosticPrivacy';
import { connectBridge } from '../transports/bridge';
import {
  batteryLevel,
  deriveCapabilities,
  deriveConnectionPhase,
  deriveEarbudState,
  emptyBattery,
  mergeBatteryTelemetry,
  parseSoundModes,
  type Capabilities,
  type ConnectionPhase,
  type EarbudState,
} from './derive';
import type {
  AncMode,
  AncScene,
  BatteryState,
  DeviceProfile,
  LogEntry,
  PageId,
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
  setProfileId: (id: string) => void;
  battery: BatteryState;
  ancStatus: string;
  readAncState: () => Promise<void>;
  recordAncObservation: (effect: string) => void;
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
  log: LogEntry[];
  /** Last few bridge devices, most recent first — one-tap reconnect. */
  recentDevices: Array<{ mac: string; name: string }>;
  /** Drop one entry from the local reconnect list (real, local-only action). */
  forgetRecentDevice: (mac: string) => void;
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
  // Phase 18 session isolation: exactly one connection may update parsed
  // device state. begin() on every connect attempt, end() on disconnect —
  // a late frame from a previous device/session is dropped before parsing.
  const sessionGuardRef = useRef(createSessionGuard());
  const [page, setPage] = useState<PageId>('dashboard');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [transportLabel, setTransportLabel] = useState('Not connected');
  const [deviceName, setDeviceName] = useState('No device');
  const [connectedMac, setConnectedMac] = useState<string | null>(null);
  const [profile, setProfile] = useState<DeviceProfile>(matchDevice('R50i'));
  const profileRef = useRef(profile);
  const [battery, setBattery] = useState<BatteryState>({ left: null, right: null });
  // Persisted recent-device list. Sanitized on load: only well-formed
  // {mac,name} entries survive, and a non-array value falls back to empty —
  // consumers map/filter this list during connect and render, so a corrupt
  // stored value must degrade to "no recents", never to a crash.
  // Pass 11 §19: the MAC must also be syntactically valid, and duplicates
  // (including case variants of the same address) are dropped keeping the
  // first — the Devices list renders one row per MAC as a React key, so
  // duplicate entries would mean duplicate keys and the same device twice.
  const [recentDevices, setRecentDevices] = useState<Array<{ mac: string; name: string }>>(() => {
    const raw = load<unknown>('soundcontrol_recent_devices', []);
    if (!Array.isArray(raw)) return [];
    const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
    const seen = new Set<string>();
    const out: Array<{ mac: string; name: string }> = [];
    for (const d of raw) {
      if (typeof d !== 'object' || d === null) continue;
      const mac = (d as { mac?: unknown }).mac;
      const name = (d as { name?: unknown }).name;
      if (typeof mac !== 'string' || !MAC_RE.test(mac)) continue;
      if (typeof name !== 'string' || name.length === 0) continue;
      const key = mac.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ mac: key, name });
    }
    return out;
  });
  // The low-battery nudge should fire once per connection, not every poll.
  const lowBatteryWarned = useRef(false);
  const [ancStatus, setAncStatus] = useState('Device ANC state unknown — physical effect unverified');
  const ancExchange = useRef(new AncExchange());
  const ancInFlight = useRef(false);
  const p30iState = useRef<Uint8Array | null>(null);
  const [ancMode, setAncMode] = useState<AncMode>('anc');
  const [ancLevel, setAncLevel] = useState(5);
  const [ancScene, setAncScene] = useState<AncScene>('outdoor');
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

  /** Set when the Bluetooth name matched an unverified alias, not a real profile. */
  const profileNote = useMemo(() => matchNote(deviceName), [deviceName]);

  /** Protocol-derived capability matrix for the connected (or previewed) model. */
  const capabilities = useMemo(() => deriveCapabilities(profile), [profile]);

  /** Per-side earbud state; null for hardware without independent L/R sides. */
  const earbudState = useMemo(() => deriveEarbudState(battery, capabilities), [battery, capabilities]);

  /** The one connection phase every badge in the UI renders from. */
  const connectionPhase = useMemo(
    () => deriveConnectionPhase({ connected, connecting, error }),
    [connected, connecting, error],
  );

  const pushLog = useCallback((dir: LogEntry['dir'], data: ArrayLike<number> | string, note?: string) => {
    const hex = typeof data === 'string' ? data : diagnosticFrame(data);
    const valid = typeof data === 'string' ? null : verifyFrame(data);
    setLog((prev) => {
      const next: LogEntry[] = [
        {
          id: seq++,
          ts: Date.now(),
          dir,
          hex,
          note: note ?? (typeof data === 'string' ? undefined : describePacket(data)),
          valid,
        },
        ...prev,
      ];
      return next.slice(0, 2000);
    });
  }, []);

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
    const previous = p30iState.current;
    if (profileRef.current.id === 'p30i') p30iState.current = payload.slice(0, 7);
    pushLog('sys', '', `RX_SOUND_MODE_MIRROR ${JSON.stringify(report)}`);
    if (previous && toHex(previous) !== toHex(payload)) pushLog('sys', '', 'DEVICE_STATE_CHANGED — reported bytes changed; acoustic effect unverified');
    setAncStatus('Device reported ' + report.mode + (report.level ? ` L${report.level}` : '') + ' — physical effect unverified');
    setAncMode(report.mode);
    if (report.level !== undefined) setAncLevel(report.level);
    if (report.transVocal !== undefined) setTransVocalState(report.transVocal);
    if (report.wind !== undefined) setWindNoiseState(report.wind);
    if (report.scene !== undefined) setAncScene(report.scene);
  }, [pushLog]);

  const onRx = useCallback(
    (data: Uint8Array) => {
      const meta = transportRef.current?.diagnostics?.();
      pushLog('rx', data, `RX_FRAME SESSION=${meta?.session ?? 'UNAVAILABLE'} RFCOMM_CHANNEL=${meta?.channel ?? 'UNKNOWN'} (serial bytes redacted where present)`);
      if (data[0] !== 0x09 || data[1] !== 0xff || data.length < 10) return;
      // A frame that fails the additive checksum is malformed wire data, not
      // telemetry: it is already logged (marked invalid) and must never move
      // parsed state — absence of valid data keeps the previous confirmed
      // values, while valid data with an absent side clears it (see
      // mergeBatteryTelemetry).
      if (!verifyFrame(data) || (data[7] | (data[8] << 8)) !== data.length) return;
      ancExchange.current.receive(data);

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
      let chargingLeft: boolean | undefined;
      let chargingRight: boolean | undefined;

      if (cat === 0x01 && typ === 0x01) {
        // Full state update. Field offsets are model-specific — see
        // src/protocol/devices.ts, where each row cites the OpenSCQ30 packet
        // definition it came from.
        // Phase 18 malformed-response guard: a state payload too short to
        // hold the fields THIS profile documents is not telemetry — it is
        // ignored whole, never partially parsed into a half-updated UI.
        if (payload.length < requiredStateLength(offsets)) {
          pushLog(
            'sys',
            '',
            `State frame ignored — payload ${payload.length} bytes is shorter than the ${requiredStateLength(offsets)}-byte layout documented for ${profileRef.current.name} (${profileRef.current.sku})`,
          );
          return;
        }
        if (offsets.soundModes !== null) {
          const size = profileRef.current.ancLayout === 'classic' ? 4 : profileRef.current.ancLayout === 'tws-l3pro' ? 6 : 7;
          syncSoundModes(payload.slice(offsets.soundModes, offsets.soundModes + size));
        }
        sawBatteryFrame = true;
        rawLeft = payload[offsets.batteryLeft];
        rawRight = offsets.batteryRight === null ? undefined : payload[offsets.batteryRight];
        // The case byte stays a wire fact (see PROTOCOL.md) but is never
        // surfaced: many models do not report it and over-ears have no case.
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
        // Phase 18 device-confirmed toggles (Task 19): where the model
        // mirrors gaming/surround/dual flags in its state update, the
        // device's own report is the truth — the optimistic UI state is
        // corrected to what the hardware actually reports (A3959 firmware
        // gate for the gaming byte is applied inside the parser).
        const mirror = parseDeviceToggles(payload, offsets);
        if (mirror.gaming !== null) setGamingState(mirror.gaming);
        if (mirror.surround !== null) setSurroundState(mirror.surround);
        if (mirror.dual !== null) setDualState(mirror.dual);
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
      if (!lowBatteryWarned.current && low.length > 0) {
        lowBatteryWarned.current = true;
        pushLog(
          'sys',
          '',
          `Low battery: ${low.map((p) => `${Math.round(p)}%`).join(', ')} — charge soon`,
        );
      }
    },
    [pushLog, syncSoundModes],
  );
  const write = useCallback(
    async (data: Uint8Array, note?: string, ancOwned = false) => {
      if (ancInFlight.current && !ancOwned) throw new Error('ANC diagnostic transaction in progress — other writes paused');
      const t = transportRef.current;
      if (!t) throw new Error('Connect a device first');
      pushLog('tx', data, note);
      try {
        await t.write(data);
      } catch (err) {
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
    ) => {
      // Phase 17+18 transport boundary: EVERY transport (real bridge, demo
      // simulator, anything future) is wrapped before installation, so each
      // and every write — UI command, connect handshake, background battery
      // poll, diagnostics-console frame — passes BOTH gates before it can
      // reach the wire:
      //   1. earbud-only: a recognized, checksum-valid Soundcore command
      //      (Phase 17 registry — src/protocol/targets.ts);
      //   2. model-aware: the CONNECTED model must actually support the
      //      command (Phase 18 registry — src/protocol/modelRegistry.ts),
      //      including the custom-EQ (0xFEFE) distinction. A UI bug that
      //      shows ANC controls for an R50i still cannot put 06:81 on the wire.
      t = withDeviceBoundary(t, () => profileRef.current, (reason) => {
        pushLog('sys', '', `Earbud-only boundary: frame NOT sent — ${reason}`);
      });
      transportRef.current = t;
      setTransportLabel(t.label);
      setDeviceName(name);
      const nextProfile = matchDevice(name);
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      ancExchange.current.cancel();
      p30iState.current = null;
      setAncStatus('Device ANC state unknown — physical effect unverified');
      // Clear the previous device's telemetry: firmware and serial are read
      // per device, and showing a stale value is worse than showing none.
      setFirmware('Unknown');
      setSerial(null);
      lowBatteryWarned.current = false;
      setLinkInfo(
        typeof dspChannel === 'number'
          ? `RFCOMM channel ${dspChannel} — ANC control unverified`
          : null,
      );
      const note = matchNote(name);
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
      setAncLevel(5);
      setAncScene('outdoor');
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
          (typeof dspChannel === 'number' ? ` · DSP ch${dspChannel}` : '') +
          // Honest evidence level (Phase 18): the target models' commands are
          // protocol-verified against OpenSCQ30, but no physical device has
          // been validated yet — the UI must never imply otherwise.
          (targetModelForProfile(nextProfile.id)
            ? ' · protocol-verified · physical validation pending'
            : ''),
      );
      if (note) pushLog('sys', '', note);
      if (!nextProfile.eqCommand) {
        pushLog(
          'sys',
          '',
          nextProfile.id === 'unknown'
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
    ancExchange.current.cancel();
    p30iState.current = null;
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
    ancExchange.current.cancel();
    p30iState.current = null;
    setAncStatus('Device ANC state unknown — physical effect unverified');
    setConnected(false);
    setConnectedMac(null);
    setTransportLabel('Not connected');
    setDeviceName('No device');
    setBattery(emptyBattery());
    setLinkInfo(null);
    setFirmware('Unknown');
    setSerial(null);
    const fresh = matchDevice('R50i');
    profileRef.current = fresh;
    setProfile(fresh);
    setAncMode('anc');
    setAncLevel(5);
    setAncScene('outdoor');
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
        // Phase 18 session isolation: this attempt becomes the only session
        // allowed to update parsed state; frames still queued from a previous
        // device/session are dropped by the guarded rx callback below.
        const mySession = sessionGuardRef.current.begin();
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
        const guardedRx = (data: Uint8Array) => {
          if (!sessionGuardRef.current.isActive(mySession)) return;
          onRx(data);
        };
        const { transport, name, battery: b, dspChannel } = await connectBridge(
          mac,
          guardedRx,
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
            sessionGuardRef.current.end();
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
        await attach(transport, name, b, dspChannel);
        setConnectedMac(mac || null);
        // Settings persistence: remember the last few devices for one-tap
        // reconnect on the next launch.
        if (mac) {
          setRecentDevices((prev) => {
            // Canonical uppercase MAC (the bridge's normal form) so a
            // lowercase manual entry cannot persist as a case-variant
            // duplicate of the same address.
            const key = mac.toUpperCase();
            const next = [
              { mac: key, name: name || 'soundcore' },
              ...prev.filter((d) => d.mac.toUpperCase() !== key),
            ].slice(0, 5);
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
        const mySession = sessionGuardRef.current.begin();
        // Leave any real bridge session before starting the simulator (and
        // release its RFCOMM link in the helper) — see releaseTransport.
        await releaseTransport();
        const targetProfile = customProfileId
          ? DEVICES.find((d) => d.id === customProfileId)
          : undefined;
        const simProfile = targetProfile ?? profileRef.current;
        const guardedRx = (data: Uint8Array) => {
          if (!sessionGuardRef.current.isActive(mySession)) return;
          onRx(data);
        };
        const { transport, name, battery: b } = connectSimulator(guardedRx, simProfile);
        await attach(transport, name, b);
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
        // Only A3959-class models mirror the surround flag (byte 74).
        if (profile.state.surround == null) {
          pushLog('sys', '', 'Command sent — device confirmation unavailable for this model');
        }
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
    [profile, prompts, pushLog, surround, write],
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
    setAncLevel(5);
    setGamingState(false);
    if (prompts) await beep('ok');
  }, [prompts, write]);

  const disconnect = useCallback(async () => {
    const t = transportRef.current;
    transportRef.current = null;
    // Phase 18: the session ends with the link — a frame that arrives after
    // this point can never update (now cleared) device state.
    sessionGuardRef.current.end();
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
      scene: over.scene ?? ancScene,
      transVocal: over.transVocal ?? transVocal,
      wind: over.wind ?? windNoise,
    }),
    [ancLevel, ancMode, ancScene, transVocal, windNoise],
  );

  const queryAncState = useCallback(async () => {
    const t = transportRef.current;
    if (!t || profileRef.current.id !== 'p30i') throw new Error('Connect the A3959 / P30i profile first');
    const reply = await ancExchange.current.run(
      () => write(INIT, 'ANC diagnostic state request', true),
      f => f[5] === 1 && f[6] === 1 && f.length >= 100 && validP30iSoundModes(f.slice(73, 80)),
      '01:01 A3959 state',
    );
    if (transportRef.current !== t) throw new Error('Device session changed');
    return reply.slice(73, 80);
  }, [write]);

  const readAncState = useCallback(async () => {
    if (ancInFlight.current) throw new Error('ANC action already in progress');
    ancInFlight.current = true; setBusy('anc');
    try { await queryAncState(); }
    catch (err) { setAncStatus(String(err)); pushLog('sys', '', String(err)); throw err; }
    finally { ancInFlight.current = false; setBusy(null); }
  }, [pushLog, queryAncState]);

  const sendAnc = useCallback(async (intent: AncIntent, note: string) => {
    if (ancInFlight.current) throw new Error('ANC action already in progress');
    ancInFlight.current = true; setBusy('anc');
    const t = transportRef.current;
    const actionMeta = t?.diagnostics?.();
    pushLog('sys', '', `ANC_ACTION MODEL=${profileRef.current.sku} PROFILE=${profileRef.current.id} MODE=${intent.mode} LEVEL=${intent.level} SCENE=${intent.scene} WIND=${intent.wind} FRAME=NOT_CONSTRUCTED RFCOMM_CHANNEL=${actionMeta?.channel ?? 'UNKNOWN'} SESSION=${actionMeta?.session ?? 'UNAVAILABLE'} — request; fresh state required before A3959 write`);
    try {
      let before: Uint8Array | null = null;
      if (profileRef.current.id === 'p30i') {
        before = await queryAncState();
        intent.p30iState = before;
        // Preserve settings unrelated to this action from the fresh device report.
        if (!note.startsWith('Wind')) intent.wind = !!(before[4] & 1);
        else {
          intent.mode = before[0] === 0 ? (before[3] === 1 ? 'adaptive' : 'anc') : before[0] === 1 ? 'transparency' : 'normal';
          intent.p30iAutomation = before[3];
        }
        if (!note.includes(' L')) intent.level = before[1] >> 4;
        if (!note.includes('Scene')) intent.scene = before[6] === 0 ? 'transport' : before[6] === 1 ? 'outdoor' : 'indoor';
      }
      const pkt = buildAnc(profileRef.current.ancLayout, intent);
      if (!pkt) throw new Error('This model has no sound-mode command');
      const steps = before ? planP30iAnc(before, pkt.slice(9, -1)) : [pkt];
      setAncStatus('Command prepared — waiting for device confirmation');
      const meta = t?.diagnostics?.();
      for (const step of steps) {
        if (transportRef.current !== t) throw new Error('Device session changed');
        pushLog('sys', '', `ANC_ACTION MODEL=${profileRef.current.sku} PROFILE=${profileRef.current.id} MODE=${intent.mode} LEVEL=${intent.level} SCENE=${intent.scene} WIND=${intent.wind} FRAME=${toHex(step)} RFCOMM_CHANNEL=${meta?.channel ?? 'UNKNOWN'} SESSION=${meta?.session ?? 'UNAVAILABLE'} — source-derived transition, physical effect unverified`);
        if (before) {
          await ancExchange.current.run(() => write(step, note, true), f => f[5] === 6 && f[6] === 0x81, '06:81 reply');
          pushLog('sys', '', 'Device 06:81 reply received — not a sound-mode report or acoustic confirmation');
        } else await write(step, note, true);
      }
      setAncStatus('Command sent — waiting for device confirmation');
      if (before) {
        const actual = await queryAncState();
        const matches = p30iReportMatches(actual, pkt.slice(9, -1));
        const status = matches ? 'DEVICE REPORT CONFIRMED — physical acoustic effect unverified' : 'DEVICE REPORT MISMATCH — device state wins; requested state not confirmed';
        setAncStatus(status); pushLog('sys', '', status);
      }
    } catch (err) {
      if (transportRef.current === t) setAncStatus(`ANC unconfirmed: ${String(err)}`);
      pushLog('sys', '', `ANC_ERROR ${String(err)} — no automatic retry; use Read state`);
      throw err;
    } finally { ancInFlight.current = false; setBusy(null); }
  }, [pushLog, queryAncState, write]);

  const setAnc = useCallback(async (mode: AncMode, level?: number, scene?: AncScene) => {
    const intent = ancIntent({ mode, level: level ?? ancLevel, scene: scene ?? ancScene });
    if (scene !== undefined && profileRef.current.id === 'p30i') intent.p30iAutomation = 2;
    await sendAnc(intent, `ANC ${mode}${level !== undefined ? ` L${level}` : ''}${scene !== undefined ? ` Scene ${scene}` : ''}`);
  }, [ancIntent, ancLevel, ancScene, sendAnc]);

  const setTransVocal = useCallback(async (on: boolean) => {
    await sendAnc(ancIntent({ mode: 'transparency', transVocal: on }), on ? 'Talk mode' : 'Full transparency');
  }, [ancIntent, sendAnc]);

  const setWindNoise = useCallback(async (on: boolean) => {
    await sendAnc(ancIntent({ wind: on }), `Wind noise ${on ? 'on' : 'off'}`);
  }, [ancIntent, sendAnc]);

  const recordAncObservation = useCallback((effect: string) => {
    pushLog('sys', '', `USER_OBSERVATION ${effect} MODE_REPORTED=${ancMode} LEVEL_REPORTED=${ancLevel} FIRMWARE=${firmware} — user-entered, not automated verification`);
  }, [ancMode, ancLevel, firmware, pushLog]);

  const setGaming = useCallback(
    async (on: boolean) => {
      const prev = gaming;
      setGamingState(on);
      setBusy('gaming');
      try {
        await write(buildGameMode(profile, on), `Gaming ${on ? 'on' : 'off'}`);
        // Task 19 — no fake success: only models that mirror the gaming flag
        // in their state update (A3949 byte 65; A3959 byte 77 with the
        // firmware gate) get a device-confirmed state. For every other model
        // the honest wording is logged instead of implying confirmation.
        if (profile.state.gaming == null) {
          pushLog('sys', '', 'Command sent — device confirmation unavailable for this model');
        }
      } catch (err) {
        setGamingState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('mode');
    },
    [gaming, profile, prompts, pushLog, write],
  );

  const setLdac = useCallback(
    async (on: boolean) => {
      const prev = ldac;
      setLdacState(on);
      setBusy('ldac');
      try {
        await write(on ? LDAC.enable : LDAC.disable, `LDAC ${on ? 'on' : 'off'}`);
        // No model mirrors the LDAC state in the 01:01 blob (OpenSCQ30 reads
        // it via a separate 01:7F query SoundControl does not send), so the
        // honest wording is always logged for LDAC changes.
        pushLog('sys', '', 'Command sent — device confirmation unavailable for this model');
      } catch (err) {
        setLdacState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [ldac, pushLog, write],
  );

  const setDual = useCallback(
    async (on: boolean) => {
      const prev = dual;
      setDualState(on);
      setBusy('dual');
      try {
        await write(on ? DUAL.enable : DUAL.disable, `Dual ${on ? 'on' : 'off'}`);
        // Only A3959-class models mirror the dual-connections flag (byte 73).
        if (profile.state.dualConnections == null) {
          pushLog('sys', '', 'Command sent — device confirmation unavailable for this model');
        }
      } catch (err) {
        setDualState(prev);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [dual, profile, pushLog, write],
  );

  const applyPreset = useCallback(
    async (preset: EqPreset) => {
      const pkt = buildEqPreset(profile, preset);
      if (!pkt) {
        pushLog(
          'sys',
          '',
          profile.id === 'unknown'
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
      if (prompts) await beep('ok');
    },
    [bands, eqId, profile, prompts, pushLog, write],
  );

  const setBand = useCallback((index: number, db: number) => {
    setEqId('custom');
    setBands((prev) => {
      const next = [...prev];
      next[index] = Math.max(-6, Math.min(6, Math.round(db * 2) / 2));
      return next;
    });
  }, []);

  const commitEq = useCallback(async () => {
    const pkt = buildCustomEq(profile, bands);
    if (!pkt) return;
    // Task 9 — never send an unsupported custom curve: A3949 (R50i/P20i)
    // accepts factory presets only (OpenSCQ30 custom_preset_id: None), so
    // the FEFE frame is refused here and by the model gate under it.
    if (!profile.customEq) {
      pushLog(
        'sys',
        '',
        `Custom curves are not supported by ${profile.name} (${profile.sku}) — factory presets only. Nothing was sent.`,
      );
      return;
    }
    setBusy('eq');
    try {
      await write(pkt, 'EQ custom');
    } finally {
      setBusy(null);
    }
  }, [bands, profile, pushLog, write]);

  const applyBands = useCallback(
    async (next: number[]) => {
      const pkt = buildCustomEq(profile, next);
      if (!pkt) return;
      // Same Task 9 guard as commitEq — the custom FEFE frame is never sent
      // to a model without custom-curve support.
      if (!profile.customEq) {
        pushLog(
          'sys',
          '',
          `Custom curves are not supported by ${profile.name} (${profile.sku}) — factory presets only. Nothing was sent.`,
        );
        return;
      }
      const prev = { eqId, bands };
      setEqId('custom');
      setBands(next);
      setBusy('eq');
      try {
        await write(pkt, 'EQ custom');
      } catch (err) {
        setEqId(prev.eqId);
        setBands(prev.bands);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [bands, eqId, profile, pushLog, write],
  );

  const inject = useCallback(
    async (bytes: Uint8Array, note = 'Injected') => {
      await write(bytes, note);
    },
    [write],
  );

  const setProfileId = useCallback((id: string) => {
    if (ancInFlight.current) return;
    const hit = DEVICES.find((d) => d.id === id);
    if (hit) {
      ancExchange.current.cancel();
      p30iState.current = null;
      setAncStatus('Device ANC state unknown — profile changed');
      profileRef.current = hit;
      setProfile(hit);
    }
  }, []);

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
      if (stopped || !t || ancInFlight.current) return;
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
      setProfileId,
      battery,
      ancStatus,
      readAncState,
      recordAncObservation,
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
      setProfileId,
      battery,
      ancStatus,
      readAncState,
      recordAncObservation,
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
      log,
      recentDevices,
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
