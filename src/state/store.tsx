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
  buildCustomEq,
  buildEqPreset,
  buildGameMode,
  describePacket,
} from '../protocol/packets';
import type { EqPreset } from '../protocol/presets';
import { isUserCancel } from '../lib/bluetoothEnv';
import { connectBluetooth } from '../transports/ble';
import { connectBridge } from '../transports/bridge';
import { connectSerial } from '../transports/serial';
import { connectSimulator } from '../transports/simulator';
import type {
  AncMode,
  AncScene,
  BatteryState,
  DeviceProfile,
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
  firmware: string;
  touch: TouchMap;
  eqId: string;
  bands: number[];
  hearId: boolean;
  log: LogEntry[];
  error: string | null;
  clearError: () => void;
  connectBle: () => Promise<void>;
  connectSerial: () => Promise<void>;
  connectBridge: (mac: string, name?: string) => Promise<void>;
  connectSim: () => Promise<void>;
  disconnect: () => Promise<void>;
  setAnc: (mode: AncMode, level?: number, scene?: AncScene) => Promise<void>;
  setTransVocal: (on: boolean) => Promise<void>;
  setWindNoise: (on: boolean) => Promise<void>;
  setGaming: (on: boolean) => Promise<void>;
  setLdac: (on: boolean) => Promise<void>;
  setDual: (on: boolean) => Promise<void>;
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
  const [firmware] = useState('04.88');
  const [touch, setTouchState] = useState<TouchMap>(() => load('sc.touch', DEFAULT_TOUCH));
  const [eqId, setEqId] = useState('signature');
  const [bands, setBands] = useState<number[]>([...ZERO_BANDS]);
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
      if (data[0] === 0x09 && data.length >= 52) {
        const l = data[49];
        const r = data[50];
        const c = data[51];
        if (l <= 100 && r <= 100) {
          setBattery({
            left: l,
            right: r,
            case: c <= 100 ? c : null,
          });
        }
      }
    },
    [pushLog],
  );

  const write = useCallback(
    async (data: Uint8Array, note?: string) => {
      const t = transportRef.current;
      if (!t) throw new Error('Connect a device first');
      pushLog('tx', data, note);
      await t.write(data);
    },
    [pushLog],
  );

  const attach = useCallback(
    async (t: Transport, name: string, bat?: Partial<BatteryState> | number | null) => {
      transportRef.current = t;
      setTransportLabel(t.label);
      setDeviceName(name);
      setProfile(matchDevice(name));
      if (typeof bat === 'number') {
        setBattery({ left: bat, right: bat, case: null });
      } else if (bat && typeof bat === 'object') {
        setBattery({
          left: bat.left ?? null,
          right: bat.right ?? null,
          case: bat.case ?? null,
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
        if (isUserCancel(err)) return;
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

  const connectBle = useCallback(
    () =>
      wrapConnect(async () => {
        const { transport, name, battery: b } = await connectBluetooth(onRx);
        await attach(transport, name, b);
      }),
    [attach, onRx, wrapConnect],
  );

  const connectSerialPort = useCallback(
    () =>
      wrapConnect(async () => {
        const { transport, name } = await connectSerial(onRx);
        await attach(transport, name);
      }),
    [attach, onRx, wrapConnect],
  );

  const connectBridgePort = useCallback(
    (mac: string, label?: string) =>
      wrapConnect(async () => {
        const { transport, name } = await connectBridge(mac, onRx, label);
        await attach(transport, name);
      }),
    [attach, onRx, wrapConnect],
  );

  const connectSim = useCallback(
    () =>
      wrapConnect(async () => {
        const { transport, name, battery: b } = connectSimulator(onRx);
        await attach(transport, name, b);
      }),
    [attach, onRx, wrapConnect],
  );

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
    async (mode: AncMode, level = ancLevel, scene = ancScene) => {
      setAncMode(mode);
      if (level) setAncLevel(level);
      if (scene) setAncScene(scene);
      const pkt = buildAnc(profile.family, mode, level, scene);
      await write(pkt, `ANC ${mode}${profile.family === 'tws' ? ` L${level}` : ` ${scene}`}`);
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
    if (hit) setProfile(hit);
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
      hearId,
      log,
      error,
      clearError: () => setError(null),
      connectBle,
      connectSerial: connectSerialPort,
      connectBridge: connectBridgePort,
      connectSim,
      disconnect,
      setAnc,
      setTransVocal,
      setWindNoise,
      setGaming,
      setLdac,
      setDual,
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
      connectBle,
      connectSerialPort,
      connectBridgePort,
      connectSim,
      disconnect,
      setAnc,
      setTransVocal,
      setWindNoise,
      setGaming,
      setLdac,
      setDual,
      applyPreset,
      setBand,
      commitEq,
      applyBands,
      inject,
      findDevice,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
