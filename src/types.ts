export type TransportKind = 'bridge' | 'sim';

export type AncMode = 'anc' | 'adaptive' | 'transparency' | 'normal';

export type AncScene = 'transport' | 'outdoor' | 'indoor';

export type DeviceFamily = 'classic' | 'tws';

export type TabId = 'device' | 'sounds' | 'controls' | 'sleep' | 'settings';

export type StackId =
  | null
  | 'ambient'
  | 'eq-custom'
  | 'hearid'
  | 'touch'
  | 'diagnostics'
  | 'about'
  | 'safe-volume'
  | 'connect'
  | 'find-device'
  | 'device-select';

export type GestureAction =
  | 'play'
  | 'next'
  | 'prev'
  | 'vol-up'
  | 'vol-down'
  | 'anc'
  | 'trans'
  | 'voice-assistant'
  | 'game'
  | 'off';

export interface TouchMap {
  leftSingle: GestureAction;
  leftDouble: GestureAction;
  leftTriple: GestureAction;
  leftHold: GestureAction;
  rightSingle: GestureAction;
  rightDouble: GestureAction;
  rightTriple: GestureAction;
  rightHold: GestureAction;
}

export type EarbudPresence = 'both' | 'left' | 'right' | 'none' | 'unknown';

export interface BatteryState {
  left: number | null;
  right: number | null;
  case: number | null;
  leftCharging?: boolean;
  rightCharging?: boolean;
  caseCharging?: boolean;
  /** Null means the values are already percentages (for example Windows PnP). */
  batteryScale?: number | null;
  /** Reported only when the Soundcore telemetry identifies each TWS side. */
  presence?: EarbudPresence;
}

export interface DeviceProfile {
  id: string;
  name: string;
  sku: string;
  kind: 'earbuds' | 'overear';
  family: DeviceFamily;
  gaming: boolean;
  ancLevels: boolean;
  scenes: boolean;
  ldac: boolean;
  dual: boolean;
  /** Raw Soundcore battery levels are often 0..5 or 0..10, not percentages. */
  batteryMax: number;
  names: string[];
  /**
   * True when the capability flags were derived from the product family and
   * published specs rather than confirmed on real hardware. The official app
   * keeps per-device feature data server-side, so these profiles cannot be
   * verified from its APK. Surfaced in the UI instead of being presented as
   * fact.
   */
  inferred?: boolean;
}

export interface LogEntry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx' | 'sys';
  hex: string;
  note?: string;
  valid?: boolean | null;
}

export interface Transport {
  kind: TransportKind;
  label: string;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export const EQ_HZ = [100, 200, 400, 800, 1600, 3200, 6400, 12800] as const;

export const ZERO_BANDS = [0, 0, 0, 0, 0, 0, 0, 0];

export const DEFAULT_TOUCH: TouchMap = {
  leftSingle: 'vol-down',
  leftDouble: 'prev',
  leftTriple: 'voice-assistant',
  leftHold: 'anc',
  rightSingle: 'vol-up',
  rightDouble: 'next',
  rightTriple: 'game',
  rightHold: 'play',
};
