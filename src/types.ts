export type TransportKind = 'ble' | 'serial' | 'bridge' | 'sim';

export type AncMode = 'anc' | 'adaptive' | 'transparency' | 'normal';

export type AncScene = 'transport' | 'outdoor' | 'indoor';

export type DeviceFamily = 'classic' | 'tws';

export type TabId = 'device' | 'sounds' | 'controls' | 'settings';

export type StackId =
  | null
  | 'ambient'
  | 'eq-custom'
  | 'hearid'
  | 'touch'
  | 'diagnostics'
  | 'about'
  | 'safe-volume'
  | 'connect';

export type GestureAction = 'play' | 'next' | 'prev' | 'anc' | 'trans' | 'off';

export interface TouchMap {
  leftSingle: GestureAction;
  leftDouble: GestureAction;
  leftHold: GestureAction;
  rightSingle: GestureAction;
  rightDouble: GestureAction;
  rightHold: GestureAction;
}

export interface BatteryState {
  left: number | null;
  right: number | null;
  case: number | null;
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
  leftSingle: 'anc',
  leftDouble: 'prev',
  leftHold: 'off',
  rightSingle: 'play',
  rightDouble: 'next',
  rightHold: 'trans',
};
