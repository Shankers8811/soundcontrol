export type {
  DeviceProfile,
  DiscoveredDevice,
  DeviceFeatures,
  AppSettings,
  EQPreset,
  FrameLogEntry,
} from '../types';

export interface BatteryLevel {
  left: number | null;
  right: number | null;
  case: number | null;
  left_charging: boolean;
  right_charging: boolean;
  case_charging: boolean;
  single_earbud_mode: boolean;
}

export interface DeviceInfo {
  name: string;
  address: string;
  model: string;
  connected: boolean;
  battery?: BatteryLevel;
  anc_mode?: string;
  eq_preset?: string;
  game_mode: boolean;
  ldac: boolean;
  multipoint: boolean;
}

export interface BatteryHistoryEntry {
  recorded_at: string;
  left: number | null;
  right: number | null;
  case: number | null;
  left_charging: boolean;
  right_charging: boolean;
  case_charging: boolean;
}

export interface HotkeyInfo {
  name: string;
  key_combo: string;
  enabled: boolean;
}

export interface SettingsResponse {
  theme: string;
  language: string;
  auto_update: boolean;
  start_minimized: boolean;
  hotkeys: HotkeyInfo[];
}

export type DeviceFeature =
  | 'ANC' | 'Transparency' | 'Adaptive' | 'WindNoise' | 'GameMode'
  | 'LDAC' | 'Multipoint' | 'BassEnhance' | 'WearingDetection'
  | 'EasyChat' | 'AutoPowerOff' | 'FindBuds' | 'EarTipTest' | 'CustomGestures';