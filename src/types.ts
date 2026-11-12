/** Tauri v2 + Rust backend types for SoundControl */

export type AncMode = 'off' | 'anc' | 'transparency' | 'adaptive' | 'wind' | 'scene';
export type TransparencyMode = 'full' | 'vocal';
export type SpatialMode = 'off' | 'music' | 'podcast' | 'movie' | 'gaming' | 'fixed' | 'head-tracking';
export type GameModeVariant = 'standard' | 'liberty-nc';
export type EqType = 'none' | 'factory' | 'custom_8band' | 'custom_10band' | 'hearid';
export type DeviceCategory = 'earbuds' | 'headphones' | 'speaker';
export type DeviceStatus = 'verified' | 'read_only' | 'catalog_only';
export type ThemePref = 'system' | 'dark' | 'light';
export type PageId = 'devices' | 'noise-control' | 'equalizer' | 'battery' | 'diagnostics' | 'settings';

export interface BluetoothDevice {
  mac: string;
  name: string | null;
  paired: boolean;
  connected: boolean;
  rssi: number | null;
  deviceClass: number | null;
}

export interface DeviceProfile {
  sku: string;
  marketingNames: string[];
  category: DeviceCategory;
  ancLevels: number | null;
  transparencyModes: string[];
  eqType: EqType;
  hasGameMode: boolean;
  hasLdac: boolean;
  hasDualConnection: boolean;
  hasSpatialAudio: boolean;
  hasWindNoise: boolean;
  hasTouchRemap: boolean;
  hasSafeVolume: boolean;
  hasHearid: boolean;
  firmwareByteOffset: number | null;
  status: DeviceStatus;
}

export interface KnownDevice {
  mac: string;
  sku: string | null;
  name: string | null;
  lastConnected: string | null;
  lastFirmware: string | null;
  settingsJson: string | null;
}

export interface DeviceSession {
  mac: string;
  sku: string | null;
  profile: DeviceProfile | null;
  rfcommChannel: number;
  connectedAt: string;
  lastActivity: string;
}

export interface BatteryTelemetry {
  leftPct: number | null;
  rightPct: number | null;
  casePct: number | null;
  leftCharging: boolean;
  rightCharging: boolean;
  caseCharging: boolean;
  timestamp: string;
}

export interface BatteryRecord {
  mac: string;
  timestamp: string;
  leftPct: number | null;
  rightPct: number | null;
  casePct: number | null;
  charging: boolean;
}

export interface DeviceState {
  mac: string;
  sku: string | null;
  name: string | null;
  profile: DeviceProfile | null;
  connected: boolean;
  battery: BatteryTelemetry | null;
  ancMode: AncMode | null;
  transparencyMode: TransparencyMode | null;
  eqPreset: number | null;
  customEq: number[] | null;
  gameMode: boolean;
  ldacEnabled: boolean;
  dualConnection: boolean;
  spatialMode: SpatialMode | null;
  firmwareVersion: string | null;
}

export interface EqPreset {
  id: number;
  sku: string;
  name: string;
  bands: number[];
  isFactory: boolean;
}

export interface FrameLogEntry {
  id: number;
  mac: string;
  direction: 'tx' | 'rx';
  frameHex: string;
  parsedJson: string | null;
  timestamp: string;
}

export interface FirmwareInfo {
  sku: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  checkedAt: string;
}

export interface Settings {
  theme: ThemePref;
  language: string;
  autoCheckUpdates: boolean;
  startMinimized: boolean;
  showTray: boolean;
  logLevel: string;
  bluetoothAdapter: string | null;
}

export interface UpdateSettingsRequest {
  theme?: ThemePref;
  language?: string;
  autoCheckUpdates?: boolean;
  startMinimized?: boolean;
  showTray?: boolean;
  logLevel?: string;
  bluetoothAdapter?: string;
}

export interface CommandResponse {
  success: boolean;
  message: string | null;
  data: any | null;
}

export interface DiagnosticBundle {
  timestamp: string;
  deviceMac: string;
  mainLog: string;
  bridgeLog: string;
  bluetoothInfo: string;
  recentFrames: FrameLogEntry[];
  appVersion: string;
  osInfo: string;
}

export interface HotkeyBinding {
  action: 'anc_cycle' | 'game_mode' | 'show_window';
  chord: string;
  scope: 'global';
}

export const EQ_HZ = [100, 200, 400, 800, 1600, 3200, 6400, 12800] as const;
export const EQ_BAND_COUNT = EQ_HZ.length;
export const EQ_BAND_MIN = -6;
export const EQ_BAND_MAX = 6;
export const EQ_BAND_STEP = 0.5;

export const ANC_MODES: { value: AncMode; label: string; icon: string }[] = [
  { value: 'off', label: 'Off', icon: 'volume-x' },
  { value: 'anc', label: 'Noise Cancelling', icon: 'volume-2' },
  { value: 'transparency', label: 'Transparency', icon: 'mic' },
  { value: 'adaptive', label: 'Adaptive', icon: 'cpu' },
  { value: 'wind', label: 'Wind Reduction', icon: 'wind' },
  { value: 'scene', label: 'Scene', icon: 'map-pin' },
];

export const TRANSPARENCY_MODES: { value: TransparencyMode; label: string }[] = [
  { value: 'full', label: 'Full Transparency' },
  { value: 'vocal', label: 'Vocal Mode' },
];

export const SPATIAL_MODES: { value: SpatialMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'music', label: 'Music' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'movie', label: 'Movie' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'head-tracking', label: 'Head Tracking' },
];

export const EQ_FACTORY_PRESET_NAMES = [
  'Default', 'Bass Boost', 'Bass Reducer', 'Classical', 'Dance', 'Deep',
  'Electronic', 'Flat', 'Hip Hop', 'Jazz', 'Latin', 'Loudness',
  'Lounge', 'Pop', 'R&B', 'Rock', 'Small Speakers', 'Spoken Word',
  'Treble Boost', 'Treble Reducer', 'Vocal Booster', 'Custom',
] as const;