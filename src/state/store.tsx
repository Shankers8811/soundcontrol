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
import { isTransportBusyError } from '../lib/transportErrors';
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
  const [recentDevices, setRecentDevices] = useState<Array<{ mac: string; name: string }>>(() =>
    load('soundcontrol_recent_devices', [] as Array<{ mac: string; name: string }>),
  );
  // The low-battery nudge should fire once per connection, not every poll.
  const lowBatteryWarned = useRef(false);
  const [ancMode, setAncMode] = useState<AncMode>('anc');
  const [ancLevel, setAncLevel] = useState(5);
  const [ancScene, setAncScene] = useState<AncScene>('outdoor');
  const [transVocal, setTransVocalState] = useState(false);
  const [windNoise, setWindNoiseState] = useState(false);
  const [gaming, setGamingState] = useState(false);
  const [ldac, setLdacState] = useState(false);
  const [dual, setDualState] = useState(false);
  const [prompts, setPromptsState] = useState(() => load('sc.prompts', true));
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
      let chargingLeft: boolean | undefined;
      let chargingRight: boolean | undefined;

      if (cat === 0x01 && typ === 0x01) {
        // Full state update. Field offsets are model-specific — see
        // src/protocol/devices.ts, where each row cites the OpenSCQ30 packet
        // definition it came from.
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
          scale: profileRef.current.batteryMax,
        }),
      );

      // One quiet nudge per connection when any reported side drops under 20%.
      const scale = profileRef.current.batteryMax || 5;
      const low = [batteryLevel(rawLeft), batteryLevel(rawRight)]
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
    ) => {
      transportRef.current = t;
      setTransportLabel(t.label);
      setDeviceName(name);
      const nextProfile = matchDevice(name);
      profileRef.current = nextProfile;
      setProfile(nextProfile);
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
          (typeof dspChannel === 'number' ? ` · DSP ch${dspChannel}` : ''),
      );
      if (note) pushLog('sys', '', note);
      if (!nextProfile.eqCommand) {
        pushLog(
          'sys',
          '',
          `${nextProfile.name} takes its equalizer over the model-specific 03:87 HearID frame, which SoundControl does not send — EQ is disabled for this model.`,
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
        // Switching devices (ConnectSheet is reachable while connected, e.g.
        // from the Settings tab): tear the old session down first so its
        // WebSocket is not left registered in the helper's client list.
        await releaseTransport();
        // Filled in once connectBridge resolves; the link-down callback uses
        // it to verify the dropped transport is still the active one (a fast
        // disconnect→reconnect must not let the old socket's close tear down
        // the new session).
        const linked: { transport: Transport | null } = { transport: null };
        const { transport, name, battery: b, dspChannel } = await connectBridge(
          mac,
          onRx,
          label,
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
        await attach(transport, name, b, dspChannel);
        setConnectedMac(mac || null);
        // Settings persistence: remember the last few devices for one-tap
        // reconnect on the next launch.
        if (mac) {
          setRecentDevices((prev) => {
            const next = [
              { mac, name: name || 'soundcore' },
              ...prev.filter((d) => d.mac !== mac),
            ].slice(0, 5);
            save('soundcontrol_recent_devices', next);
            return next;
          });
        }
      }),
    [attach, clearDeviceState, onRx, prompts, pushLog, releaseTransport, wrapConnect],
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
    setAncLevel(5);
    setGamingState(false);
    if (prompts) await beep('ok');
  }, [prompts, write]);

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
      scene: over.scene ?? ancScene,
      transVocal: over.transVocal ?? transVocal,
      wind: over.wind ?? windNoise,
    }),
    [ancLevel, ancMode, ancScene, transVocal, windNoise],
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

  const setAnc = useCallback(
    async (mode: AncMode, level?: number, scene = ancScene) => {
      const appliedLevel = level ?? ancLevel;
      const prev = { mode: ancMode, level: ancLevel, scene: ancScene };
      setAncMode(mode);
      setAncLevel(appliedLevel);
      setAncScene(scene);
      setBusy('anc');
      try {
        const intent = ancIntent({ mode, level: appliedLevel, scene });
        await sendAnc(
          intent,
          `ANC ${mode}${mode === 'anc' || mode === 'adaptive' ? ` L${appliedLevel}` : ''}${
            profile.scenes ? ` ${scene}` : ''
          }`,
        );
      } catch (err) {
        // The 06:81 frame never reached the device: restore the previous real
        // mode instead of leaving the new one selected (PART G contract).
        setAncMode(prev.mode);
        setAncLevel(prev.level);
        setAncScene(prev.scene);
        throw err;
      } finally {
        setBusy(null);
      }
      if (prompts) await beep('mode');
    },
    [ancIntent, ancLevel, ancMode, ancScene, profile.scenes, prompts, sendAnc],
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
          `${profile.name} takes its equalizer over the model-specific 03:87 HearID frame; SoundControl does not guess that payload, so nothing was sent.`,
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
    setBusy('eq');
    try {
      await write(pkt, 'EQ custom');
    } finally {
      setBusy(null);
    }
  }, [bands, profile, write]);

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
      } catch (err) {
        setEqId(prev.eqId);
        setBands(prev.bands);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [bands, eqId, profile, write],
  );

  const inject = useCallback(
    async (bytes: Uint8Array, note = 'Injected') => {
      await write(bytes, note);
    },
    [write],
  );

  const setProfileId = useCallback((id: string) => {
    const hit = DEVICES.find((d) => d.id === id);
    if (hit) {
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
      log,
      recentDevices,
      forgetRecentDevice: (mac: string) => {
        setRecentDevices((prev) => {
          const next = prev.filter((d) => d.mac !== mac);
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
