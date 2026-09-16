import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { beep } from '../lib/feedback';
import { toHex, verifyFrame } from '../protocol/codec';
import { DEVICES, matchDevice } from '../protocol/devices';
import {
  DUAL,
  INIT,
  LDAC,
  buildAnc,
  buildBatteryQuery,
  buildBassUp,
  buildCustomEq,
  buildEqPreset,
  buildGameMode,
  buildResetDevice,
  buildSpatialAudio,
  describePacket,
} from '../protocol/packets';
import type { EqPreset } from '../protocol/presets';
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
  /**
   * Firmware version as reported by the device, or null when the connected
   * model has not told us. Never invent a value here: the settings screen
   * used to show a hardcoded "04.88" and call it up to date.
   */
  firmware: string | null;
  touch: TouchMap;
  eqId: string;
  bands: number[];
  bassUp: boolean;
  spatialAudio: boolean;
  hearId: boolean;
  log: LogEntry[];
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
  setBassUp: (on: boolean) => Promise<void>;
  setSpatialAudio: (on: boolean) => Promise<void>;
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
  // Populated from the cat=01 type=01 device-info reply once the version field
  // is confirmed against a decompiled official-app dump. Until then the UI
  // reports "not reported by device" rather than a made-up version.
  const [firmware] = useState<string | null>(null);
  const [touch, setTouchState] = useState<TouchMap>(() => load('sc.touch', DEFAULT_TOUCH));
  const [eqId, setEqId] = useState('signature');
  const [bands, setBands] = useState<number[]>([...ZERO_BANDS]);
  const [bassUp, setBassUpState] = useState(false);
  const [spatialAudio, setSpatialAudioState] = useState(false);
  const [hearId, setHearIdState] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const push = useCallback((s: Exclude<StackId, null>) => setStack(s), []);
  const back = useCallback(() => setStack(null), []);

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

      // A device-info response carries the TWS values at payload offsets
      // 40/41/42. Older firmware also places them after one of a few known
      // three-byte markers. Values are raw 0..5/0..10 steps, not percentages.
      const payload = data.slice(9, data.length - 1);
      const level = (value: number | undefined): number | null =>
        value === undefined || value === 0xff || value > 100 ? null : value;
      let levels: [number | null, number | null, number | null] | null = null;
      let presence: EarbudPresence = 'unknown';
      let rawLeft: number | undefined;
      let rawRight: number | undefined;
      if (data[5] === 0x01 && data[6] === 0x01 && payload.length >= 43) {
        rawLeft = payload[40];
        rawRight = payload[41];
        levels = [level(rawLeft), level(rawRight), level(payload[42])];
      } else if (data[5] === 0x01 && data[6] === 0x03 && payload.length >= 2) {
        // The explicit battery query returns left/right in the first two
        // payload bytes. The case value remains from device-info.
        rawLeft = payload[0];
        rawRight = payload[1];
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
        batteryScale: profileRef.current.kind === 'earbuds' ? profileRef.current.batteryMax : null,
        presence: presence === 'unknown' ? previous.presence : presence,
      }));
    },
    [pushLog],
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
    async (t: Transport, name: string, bat?: Partial<BatteryState> | number | null) => {
      transportRef.current = t;
      setTransportLabel(t.label);
      setDeviceName(name);
      const nextProfile = matchDevice(name);
      profileRef.current = nextProfile;
      setProfile(nextProfile);
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
      pushLog('sys', '', `Linked via ${t.label}`);
      try {
        await t.write(INIT);
        pushLog('tx', INIT, 'Handshake');
      } catch (err) {
        pushLog('sys', '', err instanceof Error ? err.message : String(err));
      }
      try {
        await t.write(buildBatteryQuery());
        pushLog('tx', buildBatteryQuery(), 'Battery query');
      } catch (err) {
        // Some over-ear models only expose battery in the device-info frame.
        pushLog('sys', '', err instanceof Error ? err.message : String(err));
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
        const { transport, name, battery: b } = await connectBridge(mac, onRx, label, windowsBattery ?? null);
        await attach(transport, name, b);
      }),
    [attach, onRx, wrapConnect],
  );

  const connectSim = useCallback(
    (customProfileId?: string) =>
      wrapConnect(async () => {
        const { transport, name, battery: b } = connectSimulator(onRx);
        const targetProfile = customProfileId ? DEVICES.find((d) => d.id === customProfileId) : undefined;
        await attach(transport, targetProfile ? `${targetProfile.name} (sim)` : name, b);
        if (targetProfile) {
          setProfile(targetProfile);
        }
      }),
    [attach, onRx, wrapConnect],
  );

  const setBassUp = useCallback(
    async (on: boolean) => {
      setBassUpState(on);
      await write(buildBassUp(on), `BassUp ${on ? 'on' : 'off'}`);
      if (prompts) await beep('ok');
    },
    [prompts, write],
  );

  const setSpatialAudio = useCallback(
    async (on: boolean) => {
      setSpatialAudioState(on);
      await write(buildSpatialAudio(on), `Spatial Audio ${on ? 'on' : 'off'}`);
      if (prompts) await beep('ok');
    },
    [prompts, write],
  );

  const resetDevice = useCallback(async () => {
    await write(buildResetDevice(), 'Factory Reset');
    setBands([...ZERO_BANDS]);
    setEqId('signature');
    setBassUpState(false);
    setSpatialAudioState(false);
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

  const setAnc = useCallback(
    async (mode: AncMode, level?: number, scene = ancScene) => {
      // Adaptive ANC uses level 0 on TWS models. Keep that protocol value in
      // state too, otherwise the UI jumps back to the old level on the next
      // render and the following ANC command can use stale data.
      const appliedLevel = mode === 'adaptive' ? 0 : level ?? ancLevel;
      setAncMode(mode);
      setAncLevel(appliedLevel);
      setAncScene(scene);
      const pkt = buildAnc(profile.family, mode, appliedLevel, scene);
      await write(pkt, `ANC ${mode}${profile.family === 'tws' ? ` L${appliedLevel}` : ` ${scene}`}`);
      if (prompts) await beep('mode');
    },
    [ancLevel, ancScene, profile.family, prompts, write],
  );

  const setTransVocal = useCallback(
    async (on: boolean) => {
      setTransVocalState(on);
      await write(
        buildAnc(profile.family, 'transparency', ancLevel, ancScene),
        on ? 'Talk mode' : 'Full transparency',
      );
    },
    [ancLevel, ancScene, profile.family, write],
  );

  const setWindNoise = useCallback(
    async (on: boolean) => {
      setWindNoiseState(on);
      await write(buildAnc(profile.family, ancMode, ancLevel, ancScene), `Wind noise ${on ? 'on' : 'off'}`);
    },
    [ancLevel, ancMode, ancScene, profile.family, write],
  );

  const setGaming = useCallback(
    async (on: boolean) => {
      setGamingState(on);
      await write(buildGameMode(on), `Gaming ${on ? 'on' : 'off'}`);
      if (prompts) await beep('mode');
    },
    [prompts, write],
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
      setEqId(preset.id);
      setHearIdState(false);
      setBands([...preset.bands]);
      await write(buildEqPreset(preset), `EQ ${preset.name}`);
      if (prompts) await beep('ok');
    },
    [prompts, write],
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
    await write(buildCustomEq(bands), 'EQ custom');
  }, [bands, write]);

  const applyBands = useCallback(
    async (next: number[]) => {
      setEqId('custom');
      setBands(next);
      await write(buildCustomEq(next), 'EQ custom');
    },
    [write],
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
      touch,
      eqId,
      bands,
      bassUp,
      spatialAudio,
      hearId,
      log,
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
      setBassUp,
      setSpatialAudio,
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
      bassUp,
      spatialAudio,
      wearDetect,
      prompts,
      safeVolume,
      autoOff,
      firmware,
      touch,
      eqId,
      bands,
      hearId,
      log,
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
      setBassUp,
      setSpatialAudio,
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
