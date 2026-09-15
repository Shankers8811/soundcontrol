export type TransportKind = 'ble' | 'serial' | 'bridge' | 'sim';

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

export interface BatteryState {
  left: number | null;
  right: number | null;
  case: number | null;
  leftCharging?: boolean;
  rightCharging?: boolean;
  caseCharging?: boolean;
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
  names: string[];
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
