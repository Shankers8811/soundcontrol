import { invoke } from '@tauri-apps/api/core';

export async function getSettings() {
  return invoke<AppSettings>('get_settings');
}

export async function updateSetting(key: string, value: string) {
  return invoke('update_setting', { key, value });
}

export async function scanDevices() {
  return invoke<DiscoveredDevice[]>('scan_devices');
}

export async function connectDevice(address: string) {
  return invoke('connect_device', { address });
}

export async function disconnectDevice(address: string) {
  return invoke('disconnect_device', { address });
}

export async function getBluetoothState() {
  return invoke<string>('get_bluetooth_state');
}

export async function getDeviceInfo(address: string) {
  return invoke<{ address: string; profile: DeviceProfile | null; features: DeviceFeatures; connected: boolean }>('get_device_info', { address });
}

export async function setAncMode(address: string, mode: string) {
  return invoke('set_anc_mode', { address, mode });
}

export async function setTransparency(address: string, enabled: boolean) {
  return invoke('set_transparency', { address, enabled });
}

export async function setAdaptiveNoise(address: string, enabled: boolean) {
  return invoke('set_adaptive_noise', { address, enabled });
}

export async function setWindNoise(address: string, enabled: boolean) {
  return invoke('set_wind_noise', { address, enabled });
}

export async function setGameMode(address: string, enabled: boolean) {
  return invoke('set_game_mode', { address, enabled });
}

export async function setLDAC(address: string, enabled: boolean) {
  return invoke('set_ldac', { address, enabled });
}

export async function setMultipoint(address: string, enabled: boolean) {
  return invoke('set_multipoint', { address, enabled });
}

export async function setBassEnhance(address: string, enabled: boolean) {
  return invoke('set_bass_enhance', { address, enabled });
}

export async function setWearingDetection(address: string, enabled: boolean) {
  return invoke('set_wearing_detection', { address, enabled });
}

export async function setEasyChat(address: string, enabled: boolean) {
  return invoke('set_easy_chat', { address, enabled });
}

export async function setAutoPowerOff(address: string, enabled: boolean) {
  return invoke('set_auto_power_off', { address, enabled });
}

export async function setFindBuds(address: string, enabled: boolean) {
  return invoke('set_find_buds', { address, enabled });
}

export async function setEarTipTest(address: string, enabled: boolean) {
  return invoke('set_ear_tip_test', { address, enabled });
}

export async function setGestures(address: string, leftGesture: string, rightGesture: string) {
  return invoke('set_gestures', { address, left_gesture: leftGesture, right_gesture: rightGesture });
}

export async function getBatteryLevels(address: string) {
  return invoke<BatteryLevel>('get_battery_levels', { address });
}

export async function getEQPresets() {
  return invoke<EQPreset[]>('get_eq_presets');
}

export async function saveEQPreset(name: string, bands: string) {
  return invoke('save_eq_preset', { name, bands });
}

export async function deleteEQPreset(name: string) {
  return invoke('delete_eq_preset', { name });
}

export async function applyEQPreset(address: string, name: string) {
  return invoke('apply_eq_preset', { address, name });
}

export async function setEQBand(address: string, band: number, gain: number) {
  return invoke('set_eq_band', { address, band, gain });
}

export async function getBatteryHistory(address: string, limit: number) {
  return invoke<any[]>('get_battery_history', { address, limit });
}

export async function getFrameLog(limit: number) {
  return invoke<FrameLogEntry[]>('get_frame_log', { limit });
}

export async function exportDiagnostics() {
  return invoke<string>('export_diagnostics');
}

export async function checkFirmwareUpdate(model: string) {
  return invoke<any>('check_firmware_update', { model });
}

export async function registerHotkey(keyCombo: string, action: string) {
  return invoke('register_hotkey', { key_combo: keyCombo, action });
}

export async function unregisterHotkey(action: string) {
  return invoke('unregister_hotkey', { action });
}

export async function getHotkeys() {
  return invoke<{ anc: string; game_mode: string; eq: string }>('get_hotkeys');
}

export async function showWindow() {
  return invoke('show_window');
}

export async function minimizeWindow() {
  return invoke('minimize_window');
}

export async function quitApp() {
  return invoke('quit_app');
}

export async function checkForUpdates() {
  return invoke<any>('check_for_updates');
}
