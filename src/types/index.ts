export interface DeviceInfo {
  name: string
  address: string
  model: string
  connected: boolean
  battery?: BatteryLevel
  anc_mode?: string
  eq_preset?: string
  game_mode: boolean
  ldac: boolean
  multipoint: boolean
}

export interface BatteryLevel {
  left: number | null
  right: number | null
  case: number | null
  left_charging: boolean
  right_charging: boolean
  case_charging: boolean
  single_earbud_mode: boolean
}

export interface DeviceProfile {
  name: string
  model: string
  anc_modes: string[]
  supports_transparency: boolean
  supports_adaptive: boolean
  supports_wind_noise: boolean
  supports_game_mode: boolean
  supports_ldac: boolean
  supports_multipoint: boolean
  supports_bass_enhance: boolean
  supports_wearing_detection: boolean
  supports_easy_chat: boolean
  supports_auto_power_off: boolean
  supports_find_buds: boolean
  supports_ear_tip_test: boolean
  supports_custom_gestures: boolean
  battery_count: number
  eq_bands: number
  rfcomm_channel: number
}

export interface EQPreset {
  name: string
  bands: number[]
}

export interface BatteryHistoryEntry {
  recorded_at: string
  left: number | null
  right: number | null
  case: number | null
  left_charging: boolean
  right_charging: boolean
  case_charging: boolean
}

export interface FrameLogEntry {
  direction: string
  frame_data: string
  logged_at: string
}

export interface HotkeyInfo {
  name: string
  key_combo: string
  enabled: boolean
}

export interface SettingsResponse {
  theme: string
  language: string
  auto_update: boolean
  start_minimized: boolean
  hotkeys: HotkeyInfo[]
}

export type DeviceFeature = 
  | 'ANC' | 'Transparency' | 'Adaptive' | 'WindNoise' | 'GameMode' 
  | 'LDAC' | 'Multipoint' | 'BassEnhance' | 'WearingDetection' 
  | 'EasyChat' | 'AutoPowerOff' | 'FindBuds' | 'EarTipTest' | 'CustomGestures'
