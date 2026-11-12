//! Bluetooth models - Data structures for Soundcore devices

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

/// Device profile from SKU database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub sku: String,
    pub marketing_names: Vec<String>,
    pub category: String, // "earbuds" | "headphones" | "speaker"
    pub anc_levels: Option<u8>,
    pub transparency_modes: Vec<String>,
    pub eq_type: String, // "none" | "factory" | "custom_8band" | "custom_10band" | "hearid"
    pub has_game_mode: bool,
    pub has_ldac: bool,
    pub has_dual_connection: bool,
    pub has_spatial_audio: bool,
    pub has_wind_noise: bool,
    pub has_touch_remap: bool,
    pub has_safe_volume: bool,
    pub has_hearid: bool,
    pub firmware_byte_offset: Option<u8>,
    pub status: String, // "verified" | "read_only" | "catalog_only"
}

/// Known device in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownDevice {
    pub mac: String,
    pub sku: Option<String>,
    pub name: Option<String>,
    pub last_connected: Option<DateTime<Utc>>,
    pub last_firmware: Option<String>,
    pub settings_json: Option<String>,
}

/// EQ Preset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqPreset {
    pub id: i64,
    pub sku: String,
    pub name: String,
    pub bands: Vec<f32>, // 8 or 10 values, -6.0 to +6.0
    pub is_factory: bool,
}

/// ANC Mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AncMode {
    Off = 0,
    Anc = 1,
    Transparency = 2,
    Adaptive = 3,
    Wind = 4,
    Scene = 5,
}

impl AncMode {
    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            0 => Some(AncMode::Off),
            1 => Some(AncMode::Anc),
            2 => Some(AncMode::Transparency),
            3 => Some(AncMode::Adaptive),
            4 => Some(AncMode::Wind),
            5 => Some(AncMode::Scene),
            _ => None,
        }
    }
    
    pub fn to_byte(self) -> u8 {
        self as u8
    }
}

/// Transparency sub-mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransparencyMode {
    Full = 0,
    Vocal = 1,
}

impl TransparencyMode {
    pub fn to_byte(self) -> u8 {
        self as u8
    }
}

/// Game mode variant
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameModeVariant {
    Standard,    // 01:87
    LibertyNC,   // 10:85
}

/// Spatial audio mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpatialMode {
    Off = 0,
    Music = 1,
    Podcast = 2,
    Movie = 3,
    Gaming = 4,
    Fixed = 5,
    HeadTracking = 6,
}

/// Battery telemetry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryTelemetry {
    pub left_pct: Option<u8>,
    pub right_pct: Option<u8>,
    pub case_pct: Option<u8>,
    pub left_charging: bool,
    pub right_charging: bool,
    pub case_charging: bool,
    pub timestamp: DateTime<Utc>,
}

/// Device state (full state for UI)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceState {
    pub mac: String,
    pub sku: Option<String>,
    pub name: Option<String>,
    pub profile: Option<DeviceProfile>,
    pub connected: bool,
    pub battery: Option<BatteryTelemetry>,
    pub anc_mode: Option<AncMode>,
    pub transparency_mode: Option<TransparencyMode>,
    pub eq_preset: Option<u8>, // 0-21 factory, 100+ custom
    pub custom_eq: Option<Vec<f32>>,
    pub game_mode: bool,
    pub ldac_enabled: bool,
    pub dual_connection: bool,
    pub spatial_mode: Option<SpatialMode>,
    pub firmware_version: Option<String>,
}

/// Command response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<serde_json::Value>,
}

impl CommandResponse {
    pub fn ok() -> Self {
        Self { success: true, message: None, data: None }
    }
    
    pub fn ok_with_data(data: serde_json::Value) -> Self {
        Self { success: true, message: None, data: Some(data) }
    }
    
    pub fn err(msg: String) -> Self {
        Self { success: false, message: Some(msg), data: None }
    }
}

/// Frame log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameLogEntry {
    pub id: i64,
    pub mac: String,
    pub direction: String, // "tx" | "rx"
    pub frame_hex: String,
    pub parsed_json: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// Firmware info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareInfo {
    pub sku: String,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub checked_at: DateTime<Utc>,
}

/// Settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub theme: String, // "system" | "light" | "dark"
    pub language: String,
    pub auto_check_updates: bool,
    pub start_minimized: bool,
    pub show_tray: bool,
    pub log_level: String,
    pub bluetooth_adapter: Option<String>,
}

/// Hotkey binding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub action: String, // "anc_cycle" | "game_mode" | "show_window"
    pub chord: String,  // e.g., "Ctrl+Alt+G"
    pub scope: String,  // "global"
}

/// Diagnostic bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticBundle {
    pub timestamp: DateTime<Utc>,
    pub device_mac: String,
    pub main_log: String,
    pub bridge_log: String,
    pub bluetooth_info: String,
    pub recent_frames: Vec<FrameLogEntry>,
    pub app_version: String,
    pub os_info: String,
}