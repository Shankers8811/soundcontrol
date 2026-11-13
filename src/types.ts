export interface DeviceProfile {
  name: string;
  model: string;
  anc_modes: string[];
  supports_transparency: boolean;
  supports_adaptive: boolean;
  supports_wind_noise: boolean;
  supports_game_mode: boolean;
  supports_ldac: boolean;
  supports_multipoint: boolean;
  supports_bass_enhance: boolean;
  supports_wearing_detection: boolean;
  supports_easy_chat: boolean;
  supports_auto_power_off: boolean;
  supports_find_buds: boolean;
  supports_ear_tip_test: boolean;
  supports_custom_gestures: boolean;
  battery_count: number;
  eq_bands: number;
  rfcomm_channel: number;
}

export interface DiscoveredDevice {
  address: string;
  name: string;
  connected: boolean;
  profile: DeviceProfile | null;
}

export interface BatteryLevel {
  left: number | null;
  right: number | null;
  case: number | null;
  left_charging: boolean;
  right_charging: boolean;
  case_charging: boolean;
}

export interface DeviceFeatures {
  anc: boolean;
  transparency: boolean;
  adaptive: boolean;
  wind_noise: boolean;
  game_mode: boolean;
  ldac: boolean;
  multipoint: boolean;
  bass_enhance: boolean;
  wearing_detection: boolean;
  easy_chat: boolean;
  auto_power_off: boolean;
  find_buds: boolean;
  ear_tip_test: boolean;
  custom_gestures: boolean;
}

export interface AppSettings {
  theme: string;
  language: string;
  auto_connect: string;
  auto_update: string;
  notifications: string;
  hotkey_anc: string;
  hotkey_game: string;
  hotkey_eq: string;
}

export interface EQPreset {
  name: string;
  bands: string;
}

export interface FrameLogEntry {
  direction: string;
  frame_data: string;
  logged_at: string;
}
