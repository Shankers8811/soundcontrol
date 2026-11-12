// Tauri v2 API client
import { invoke } from '@tauri-apps/api/core';
import type {
  BluetoothDevice,
  DeviceState,
  DeviceProfile,
  KnownDevice,
  EqPreset,
  BatteryRecord,
  FrameLogEntry,
  FirmwareInfo,
  Settings,
  UpdateSettingsRequest,
  CommandResponse,
  DiagnosticBundle,
} from '../types';

export const api = {
  // Settings
  getSettings: () => invoke<Settings>('get_settings'),
  updateSettings: (request: UpdateSettingsRequest) => invoke<Settings>('update_settings', { request }),

  // Bluetooth
  scanDevices: () => invoke<BluetoothDevice[]>('scan_devices'),
  connectDevice: (mac: string) => invoke<DeviceState>('connect_device', { mac }),
  disconnectDevice: (mac: string) => invoke<CommandResponse>('disconnect_device', { mac }),
  getDeviceState: (mac: string) => invoke<DeviceState>('get_device_state', { mac }),

  // Audio controls
  setAncMode: (mac: string, mode: string, subMode?: number) => 
    invoke<CommandResponse>('set_anc_mode', { mac, mode, subMode }),
  setTransparencyMode: (mac: string, mode: string) => 
    invoke<CommandResponse>('set_transparency_mode', { mac, mode }),
  setEqPreset: (mac: string, presetId: number) => 
    invoke<CommandResponse>('set_eq_preset', { mac, presetId }),
  setCustomEq: (mac: string, bands: number[]) => 
    invoke<CommandResponse>('set_custom_eq', { mac, bands }),

  // EQ presets
  saveEqPreset: (sku: string, name: string, bands: number[]) => 
    invoke<EqPreset>('save_eq_preset', { sku, name, bands }),
  deleteEqPreset: (id: number) => 
    invoke<CommandResponse>('delete_eq_preset', { id }),
  listEqPresets: (sku: string) => 
    invoke<EqPreset[]>('list_eq_presets', { sku }),

  // Connectivity features
  toggleGameMode: (mac: string, enabled: boolean, variant?: string) => 
    invoke<CommandResponse>('toggle_game_mode', { mac, enabled, variant }),
  toggleLdac: (mac: string, enabled: boolean) => 
    invoke<CommandResponse>('toggle_ldac', { mac, enabled }),
  toggleDualConnection: (mac: string, enabled: boolean) => 
    invoke<CommandResponse>('toggle_dual_connection', { mac, enabled }),

  // Diagnostics
  getBatteryHistory: (mac: string, hours?: number) => 
    invoke<BatteryRecord[]>('get_battery_history', { mac, hours }),
  getFrameLog: (mac: string, limit?: number) => 
    invoke<FrameLogEntry[]>('get_frame_log', { mac, limit }),
  exportDiagnostics: (mac: string) => 
    invoke<string>('export_diagnostics', { mac }),

  // Firmware
  checkFirmware: (sku: string) => 
    invoke<FirmwareInfo>('check_firmware', { sku }),

  // System
  registerHotkeys: () => 
    invoke<CommandResponse>('register_hotkeys'),
  unregisterHotkeys: () => 
    invoke<CommandResponse>('unregister_hotkeys'),
  showNotification: (title: string, body: string) => 
    invoke<CommandResponse>('show_notification', { title, body }),
  checkUpdates: () => 
    invoke<CommandResponse>('check_updates'),
  installUpdate: () => 
    invoke<CommandResponse>('install_update'),
  minimizeToTray: () => 
    invoke<CommandResponse>('minimize_to_tray'),
  showWindow: () => 
    invoke<CommandResponse>('show_window'),
  quitApp: () => 
    invoke<CommandResponse>('quit_app'),
};