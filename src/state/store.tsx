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
import { connectSimulator } from '../transports/simulator';
import type {
  AncMode,
  AncScene,
  BatteryState,
  DeviceProfile,
  EarbudPresence,
  GestureAction,
  LogEntry,
  StackId,
  TabId,
  TouchMap,
  Transport,
} from '../types';
import { DEFAULT_TOUCH, ZERO_BANDS } from '../types';

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

interface AppState {
  tab: TabId;
  setTab: (t: TabId) => void;
  stack: StackId;
  push: (s: Exclude<StackId, null>) => void;
  back: () => void;
  connected: boolean;
  connecting: boolean;
  transportLabel: string;
  deviceName: string;
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
  wearDetect: boolean;
  prompts: boolean;
  safeVolume: number;
  autoOff: number;
  firmware: string;
  serial: string | null;
  linkInfo: string | null;
  profileNote: string | null;
  touch: TouchMap;
  eqId: string;
  bands: number[];
  surround: boolean;
  hearId: boolean;
  log: LogEntry[];
  /** Last few bridge devices, most recent first — one-tap reconnect. */
  recentDevices: Array<{ mac: string; name: string }>;
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
  setWearDetect: (on: boolean) => void;
  setPrompts: (on: boolean) => void;
  setSafeVolume: (n: number) => void;
  setAutoOff: (n: number) => void;
  setTouch: (side: keyof TouchMap, action: GestureAction) => void;
  applyPreset: (preset: EqPreset) => Promise<void>;
  setBand: (index: number, db: number) => void;
  commitEq: () => Promise<void>;
  applyBands: (bands: number[]) => Promise<void>;
  setHearId: (on: boolean) => void;
  inject: (bytes: Uint8Array, note?: string) => Promise<void>;
  clearLog: () => void;
  findDevice: () => Promise<void>;
  resetDevice: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

let seq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const transportRef = useRef<Transport | null>(null);
  const [tab, setTab] = useState<TabId>('device');
  const [stack, setStack] = useState<StackId>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [transportLabel, setTransportLabel] = useState('Not connected');
  const [deviceName, setDeviceName] = useState('No device');
  const [profile, setProfile] = useState<DeviceProfile>(matchDevice('R50i'));
  const profileRef = useRef(profile);
  const [battery, setBattery] = useState<BatteryState>({ left: null, right: null, case: null });
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
  const [wearDetect, setWearDetectState] = useState(() => load('sc.wear', true));
  const [prompts, setPromptsState] = useState(() => load('sc.prompts', true));
  const [safeVolume, setSafeVolumeState] = useState(() => load('sc.safe', 85));
  const [autoOff, setAutoOffState] = useState(() => load('sc.autoOff', 60));
  // Read from the device over `01:05` (or the state blob where the layout is
  // known). "Unknown" until the hardware answers — never a made-up version.
  const [firmware, setFirmware] = useState('Unknown');
  const [serial, setSerial] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<string | null>(null);
  const [touch, setTouchState] = useState<TouchMap>(() => load('sc.touch', DEFAULT_TOUCH));
  const [eqId, setEqId] = useState('signature');
  const [bands, setBands] = useState<number[]>([...ZERO_BANDS]);
  const [surround, setSurroundState] = useState(false);
  const [hearId, setHearIdState] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Set when the Bluetooth name matched an unverified alias, not a real profile. */
  const profileNote = useMemo(() => matchNote(deviceName), [deviceName]);

  const push = useCallback((s: Exclude<StackId, null>) => setStack(s), []);
  const back = useCallback(() => setStack(null), []);

  /**
   * Mirror a `06:01` sound-mode report back into the UI. Layouts differ per
   * TWS family, so this reads only the bytes that are unambiguous in all of
   * them: byte 0 is the ambient mode everywhere, and byte 1's high nibble is
   * the manual ANC level everywhere.
   */
  const syncSoundModes = useCallback((payload: Uint8Array) => {
    if (payload.length < 2) return;
    const layout = profileRef.current.ancLayout;
    if (layout === 'none') return;
    const mode: AncMode =
      payload[0] === 0x00 ? 'anc' : payload[0] === 0x01 ? 'transparency' : 'normal';
    setAncMode(mode);
    const manual = (payload[1] >> 4) & 0x0f;
    if (manual >= 1 && manual <= 5) setAncLevel(manual);
    if (layout === 'tws-l4nc' && payload.length >= 5) {
      setTransVocalState((payload[2] & 0x01) !== 0);
      setWindNoiseState((payload[4] & 0x01) !== 0);
    } else if ((layout === 'tws-p30i' || layout === 'tws-l3pro') && payload.length >= 5) {
      setWindNoiseState((payload[4] & 0x01) !== 0);
    }
    if (layout === 'classic' && payload.length >= 4) {
      setTransVocalState((payload[2] & 0x01) !== 0);
      const scene = payload[1];
      setAncScene(scene === 0x00 ? 'transport' : scene === 0x02 ? 'indoor' : 'outdoor');
    }
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

      const cat = data[5];
      const typ = data[6];
      const payload = data.slice(9, data.length - 1);
      const offsets = profileRef.current.state;

      // `0xFF` means "that side is not connected to the host"; it is not a
      // zero-percent battery. Over-ears report one level, not a pair.
      const level = (value: number | undefined): number | null =>
        value === undefined || value === 0xff || value > 100 ? null : value;

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
        // Charging flag for the single reported side.
        setBattery((p) => ({ ...p, leftCharging: (payload[0] & 0x01) !== 0 }));
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

      let levels: [number | null, number | null, number | null] | null = null;
      let presence: EarbudPresence = 'unknown';
      let rawLeft: number | undefined;
      let rawRight: number | undefined;
      let chargingLeft: boolean | undefined;
      let chargingRight: boolean | undefined;

      if (cat === 0x01 && typ === 0x01) {
        // Full state update. Field offsets are model-specific — see
        // src/protocol/devices.ts, where each row cites the OpenSCQ30 packet
        // definition it came from.
        rawLeft = payload[offsets.batteryLeft];
        rawRight = offsets.batteryRight === null ? undefined : payload[offsets.batteryRight];
        levels = [
          level(rawLeft),
          level(rawRight),
          offsets.batteryCase === null ? null : level(payload[offsets.batteryCase]),
        ];
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
        // The case value carries over from the state update.
        rawLeft = payload[0];
        rawRight = offsets.batteryRight === null ? undefined : payload[1];
        levels = [level(rawLeft), level(rawRight), null];
      }
      if (!levels) return;
      if (
        levels.every((value) => value === null) &&
        !(rawLeft === 0xff || rawRight === 0xff)
      ) return;
      if (rawLeft !== undefined && rawRight !== undefined) {
        const leftPresent = rawLeft !== 0xff;
        const rightPresent = rawRight !== 0xff;
        presence = leftPresent && rightPresent ? 'both' : leftPresent ? 'left' : rightPresent ? 'right' : 'none';
      }

      setBattery((previous) => ({
        left: levels![0] ?? previous.left,
        right: levels![1] ?? previous.right,
        case: levels![2] ?? previous.case,
        leftCharging: chargingLeft ?? previous.leftCharging,
        rightCharging: chargingRight ?? previous.rightCharging,
        batteryScale: profileRef.current.kind === 'earbuds' ? profileRef.current.batteryMax : null,
        presence: presence === 'unknown' ? previous.presence : presence,
      }));

      // One quiet nudge per connection when any reported side drops under 20%.
      const scale = profileRef.current.batteryMax || 5;
      const low = (levels as Array<number | null>)
        .filter((v): v is number => v !== null)
        .map((v) => (v / scale) * 100)
        .filter((p) => p < 20);
      if (!lowBatteryWarned.current && low.length > 0) {
        lowBatteryWarned.current = true;
        pushLog(
          'sys',
          '',
          `Low battery: ${low.map((p) => `${Math.round(p)}%`).join(', ')} — time to find the case`,
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
      if (typeof bat === 'number') {
        setBattery({ left: bat, right: bat, case: null, batteryScale: null, presence: 'unknown' });
      } else if (bat && typeof bat === 'object') {
        setBattery({
          left: bat.left ?? null,
          right: bat.right ?? null,
          case: bat.case ?? null,
          batteryScale: bat.batteryScale ?? null,
          presence: bat.presence ?? 'unknown',
        });
      }
      setConnected(true);
      setStack(null);
      setTab('device');
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

  const wrapConnect = useCallback(
    async (fn: () => Promise<void>) => {
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
        setConnecting(false);
      }
    },
    [pushLog],
  );

  const connectBridgePort = useCallback(
    (mac: string, label?: string, windowsBattery?: number | null) =>
      wrapConnect(async () => {
        const { transport, name, battery: b, dspChannel } = await connectBridge(
          mac,
          onRx,
          label,
          windowsBattery ?? null,
          // Bridge diagnostics (probe results, silent-link watchdog) belong
          // in the same console the user watches while connecting.
          (text) => pushLog('sys', '', text),
        );
        await attach(transport, name, b, dspChannel);
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
    [attach, onRx, pushLog, wrapConnect],
  );

  const connectSim = useCallback(
    (customProfileId?: string) =>
      wrapConnect(async () => {
        const targetProfile = customProfileId
          ? DEVICES.find((d) => d.id === customProfileId)
          : undefined;
        const simProfile = targetProfile ?? profileRef.current;
        const { transport, name, battery: b } = connectSimulator(onRx, simProfile);
        await attach(transport, name, b);
      }),
    [attach, onRx, wrapConnect],
  );

  const setSurroundSound = useCallback(
    async (on: boolean) => {
      setSurroundState(on);
      await write(buildSurroundSound(on), `3D Surround ${on ? 'on' : 'off'}`);
      if (prompts) await beep('ok');
    },
    [prompts, write],
  );

  const resetDevice = useCallback(async () => {
    await write(buildResetDevice(), 'Factory Reset');
    setBands([...ZERO_BANDS]);
    setEqId('signature');
    setSurroundState(false);
    setHearIdState(false);
    setAncMode('anc');
    setAncLevel(5);
    setGamingState(false);
    if (prompts) await beep('ok');
  }, [prompts, write]);

  const disconnect = useCallback(async () => {
    const t = transportRef.current;
    transportRef.current = null;
    setConnected(false);
    setTransportLabel('Not connected');
    try {
      await t?.close();
    } catch {
      /* */
    }
    pushLog('sys', '', 'Disconnected');
  }, [pushLog]);

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
      setAncMode(mode);
      setAncLevel(appliedLevel);
      setAncScene(scene);
      const intent = ancIntent({ mode, level: appliedLevel, scene });
      await sendAnc(
        intent,
        `ANC ${mode}${mode === 'anc' || mode === 'adaptive' ? ` L${appliedLevel}` : ''}${
          profile.scenes ? ` ${scene}` : ''
        }`,
      );
      if (prompts) await beep('mode');
    },
    [ancIntent, ancLevel, ancScene, profile.scenes, prompts, sendAnc],
  );

  const setTransVocal = useCallback(
    async (on: boolean) => {
      setTransVocalState(on);
      const intent = ancIntent({ mode: 'transparency', transVocal: on });
      setAncMode('transparency');
      await sendAnc(intent, on ? 'Talk mode' : 'Full transparency');
      if (prompts) await beep('ok');
    },
    [ancIntent, prompts, sendAnc],
  );

  const setWindNoise = useCallback(
    async (on: boolean) => {
      setWindNoiseState(on);
      await sendAnc(ancIntent({ wind: on }), `Wind noise ${on ? 'on' : 'off'}`);
      if (prompts) await beep('ok');
    },
    [ancIntent, prompts, sendAnc],
  );

  const setGaming = useCallback(
    async (on: boolean) => {
      setGamingState(on);
      await write(buildGameMode(profile, on), `Gaming ${on ? 'on' : 'off'}`);
      if (prompts) await beep('mode');
    },
    [profile, prompts, write],
  );

  const setLdac = useCallback(
    async (on: boolean) => {
      setLdacState(on);
      await write(on ? LDAC.enable : LDAC.disable, `LDAC ${on ? 'on' : 'off'}`);
    },
    [write],
  );

  const setDual = useCallback(
    async (on: boolean) => {
      setDualState(on);
      await write(on ? DUAL.enable : DUAL.disable, `Dual ${on ? 'on' : 'off'}`);
    },
    [write],
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
      setEqId(preset.id);
      setHearIdState(false);
      setBands([...preset.bands]);
      await write(pkt, `EQ ${preset.name}`);
      if (prompts) await beep('ok');
    },
    [profile, prompts, pushLog, write],
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
    await write(pkt, 'EQ custom');
  }, [bands, profile, write]);

  const applyBands = useCallback(
    async (next: number[]) => {
      const pkt = buildCustomEq(profile, next);
      if (!pkt) return;
      setEqId('custom');
      setBands(next);
      await write(pkt, 'EQ custom');
    },
    [profile, write],
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

  const findDevice = useCallback(async () => {
    for (let i = 0; i < 6; i++) {
      await beep(i % 2 ? 'ok' : 'mode');
      await new Promise((r) => setTimeout(r, 280));
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
      tab,
      setTab: (t) => {
        setTab(t);
        setStack(null);
      },
      stack,
      push,
      back,
      connected,
      connecting,
      transportLabel,
      deviceName,
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
      wearDetect,
      prompts,
      safeVolume,
      autoOff,
      firmware,
      serial,
      linkInfo,
      profileNote,
      touch,
      eqId,
      bands,
      surround,
      hearId,
      log,
      recentDevices,
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
      setWearDetect: (on) => {
        setWearDetectState(on);
        save('sc.wear', on);
      },
      setPrompts: (on) => {
        setPromptsState(on);
        save('sc.prompts', on);
      },
      setSafeVolume: (n) => {
        setSafeVolumeState(n);
        save('sc.safe', n);
      },
      setAutoOff: (n) => {
        setAutoOffState(n);
        save('sc.autoOff', n);
      },
      setTouch: (side, action) => {
        setTouchState((prev) => {
          const next = { ...prev, [side]: action };
          save('sc.touch', next);
          return next;
        });
      },
      applyPreset,
      setBand,
      commitEq,
      applyBands,
      setHearId: setHearIdState,
      inject,
      clearLog: () => setLog([]),
      findDevice,
      resetDevice,
    }),
    [
      tab,
      stack,
      push,
      back,
      connected,
      connecting,
      transportLabel,
      deviceName,
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
      wearDetect,
      prompts,
      safeVolume,
      autoOff,
      firmware,
      serial,
      linkInfo,
      profileNote,
      touch,
      eqId,
      bands,
      hearId,
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
      findDevice,
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
