//! Bluetooth models - Data structures for Soundcore devices

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Device profile from SKU database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub model: String,
    pub bluetooth_name: String,
    pub display_name: String,
    pub icon: String,
    pub category: String,
    pub supports_anc: bool,
    pub supports_transparency: bool,
    pub supports_adaptive_anc: bool,
    pub supports_in_ear_detection: bool,
    pub supports_low_latency: bool,
    pub supports_gestures: bool,
    pub supports_eq: bool,
    pub supports_advanced_eq: bool,
    pub supports_bass_enhance: bool,
    pub supports_find_buds: bool,
    pub supports_ear_tip_test: bool,
    pub supports_ldac: bool,
    pub supports_multipoint: bool,
    pub supports_wind_noise: bool,
    pub supports_wearing_detection: bool,
    pub supports_easy_chat: bool,
    pub supports_auto_power_off: bool,
    pub supports_ldac_codec: bool,
    pub has_case_battery: bool,
    pub anc_modes: Vec<String>,
}

/// Bluetooth device info from system scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothDevice {
    pub mac: String,
    pub name: Option<String>,
    pub paired: bool,
    pub connected: bool,
    pub rssi: Option<i16>,
    pub device_class: Option<u32>,
}

/// Known device in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownDevice {
    pub mac: String,
    pub model: Option<String>,
    pub name: Option<String>,
    pub last_connected: Option<DateTime<Utc>>,
    pub last_firmware: Option<String>,
    pub settings_json: Option<String>,
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
    pub model: Option<String>,
    pub name: Option<String>,
    pub profile: Option<crate::protocol::DeviceProfile>,
    pub connected: bool,
    pub battery: Option<BatteryTelemetry>,
    pub anc_mode: Option<AncMode>,
    pub transparency_mode: Option<TransparencyMode>,
    pub eq_preset: Option<u8>,
    pub custom_eq: Option<Vec<i8>>,
    pub game_mode: bool,
    pub ldac_enabled: bool,
    pub dual_connection: bool,
    pub spatial_mode: Option<SpatialMode>,
    pub firmware_version: Option<String>,
}

/// EQ Preset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqPreset {
    pub id: i64,
    pub sku: String,
    pub name: String,
    pub bands: Vec<i8>,
    pub is_factory: bool,
}

/// Frame log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameLogEntry {
    pub id: i64,
    pub mac: String,
    pub direction: String,
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
    pub theme: String,
    pub language: String,
    pub auto_check_updates: bool,
    pub start_minimized: bool,
    pub show_tray: bool,
    pub log_level: String,
    pub bluetooth_adapter: Option<String>,
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

/// Hotkey binding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub action: String,
    pub chord: String,
    pub scope: String,
}