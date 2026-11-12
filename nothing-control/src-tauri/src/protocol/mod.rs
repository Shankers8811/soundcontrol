//! Soundcore Protocol Implementation using openscq30-lib
//!
//! This module wraps the openscq30-lib crate to provide a clean Rust API
//! for controlling Soundcore devices over Bluetooth RFCOMM.

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info, warn, error};

/// Re-export openscq30 types
pub use openscq30_lib::{
    DeviceModel, BatteryInfo, AncMode, EqPreset, EqBand, 
    Gesture, GestureAction, SettingId, SettingValue,
    SoundcoreDevice, SoundcoreError, Result as OpenscqResult,
};

/// Protocol command types
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Command {
    // Battery
    GetBattery,
    
    // ANC
    GetAnc,
    SetAnc(AncMode),
    
    // Transparency
    SetTransparency,
    
    // In-ear detection
    GetInEar,
    SetInEar(bool),
    
    // Low latency / Game mode
    GetLatency,
    SetLatency(bool),
    
    // Equalizer
    GetEqPreset,
    SetEqPreset(u8),
    SetCustomEq(Vec<i8>),
    
    // Bass enhance
    GetBassEnhance,
    SetBassEnhance(bool),
    
    // Low latency / Game mode
    GetGameMode,
    SetGameMode(bool),
    
    // Multipoint
    GetMultipoint,
    SetMultipoint(bool),
    
    // LDAC
    GetLdac,
    SetLdac(bool),
    
    // Gestures
    GetGesture(String),
    SetGesture(String, GestureAction),
    
    // Bass enhance
    GetBassEnhanceLevel,
    SetBassEnhanceLevel(u8),
    
    // Wind noise reduction
    GetWindNoise,
    SetWindNoise(bool),
    
    // Wearing detection
    GetWearingDetection,
    SetWearingDetection(bool),
    
    // Easy Chat
    GetEasyChat,
    SetEasyChat(bool),
    
    // Auto power off
    GetAutoPowerOff,
    SetAutoPowerOff(u8),
    
    // LDAC codec
    GetLdacCodec,
    SetLdacCodec(bool),
    
    // Find my buds
    FindBuds,
    
    // Ear tip fit test
    EarTipTest,
    
    // Firmware
    GetFirmware,
    
    // Device info
    GetDeviceInfo,
    
    // Battery info
    GetBatteryInfo,
}

/// Battery information
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct BatteryInfo {
    pub left: Option<u8>,
    pub left_charging: bool,
    pub right: Option<u8>,
    pub right_charging: bool,
    pub case: Option<u8>,
    pub case_charging: bool,
}

/// ANC state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AncState {
    pub mode: AncMode,
}

/// Transparency state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransparencyState {
    pub enabled: bool,
    pub level: Option<u8>,
}

/// Game mode state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GameModeState {
    pub enabled: bool,
}

/// Multipoint state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MultipointState {
    pub enabled: bool,
}

/// LDAC state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LdacState {
    pub enabled: bool,
}

/// EQ state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EqState {
    pub preset: Option<u8>,
    pub custom_bands: Option<Vec<i8>>,
}

/// Bass enhance state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BassEnhanceState {
    pub enabled: bool,
    pub level: Option<u8>,
}

/// Wind noise state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WindNoiseState {
    pub enabled: bool,
}

/// Wearing detection state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WearingDetectionState {
    pub enabled: bool,
}

/// Easy Chat state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EasyChatState {
    pub enabled: bool,
}

/// Auto power off state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AutoPowerOffState {
    pub minutes: u8,
}

/// LDAC codec state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LdacCodecState {
    pub enabled: bool,
}

/// Device info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceInfo {
    pub model: String,
    pub name: String,
    pub firmware: String,
    pub hardware: String,
    pub color: String,
}

/// Soundcore device wrapper using openscq30-lib
pub struct SoundcoreDevice {
    inner: openscq30_lib::SoundcoreDevice,
    model: String,
    address: String,
}

impl SoundcoreDevice {
    pub fn new(inner: openscq30_lib::SoundcoreDevice, model: String, address: String) -> Self {
        Self { inner, model, address }
    }
    
    pub fn model(&self) -> &str {
        &self.model
    }
    
    pub fn address(&self) -> &str {
        &self.address
    }
    
    /// Get battery information
    pub async fn get_battery(&self) -> Result<BatteryInfo, String> {
        let info = self.inner.get_battery().await
            .map_err(|e| format!("Failed to get battery: {}", e))?;
        Ok(BatteryInfo {
            left: info.left,
            left_charging: info.left_charging,
            right: info.right,
            right_charging: info.right_charging,
            case: info.case,
            case_charging: info.case_charging,
        })
    }
    
    /// Get ANC state
    pub async fn get_anc(&self) -> Result<AncState, String> {
        let mode = self.inner.get_anc_mode().await
            .map_err(|e| format!("Failed to get ANC: {}", e))?;
        Ok(AncState { mode })
    }
    
    /// Set ANC mode
    pub async fn set_anc(&self, mode: AncMode) -> Result<(), String> {
        self.inner.set_anc_mode(mode).await
            .map_err(|e| format!("Failed to set ANC: {}", e))
    }
    
    /// Get transparency state
    pub async fn get_transparency(&self) -> Result<TransparencyState, String> {
        // Transparency is part of ANC modes in openscq30
        let mode = self.inner.get_anc_mode().await
            .map_err(|e| format!("Failed to get transparency: {}", e))?;
        Ok(TransparencyState {
            enabled: mode == AncMode::Transparency,
            level: None,
        })
    }
    
    /// Set transparency mode
    pub async fn set_transparency(&self, enabled: bool) -> Result<(), String> {
        if enabled {
            self.inner.set_anc_mode(AncMode::Transparency).await
        } else {
            self.inner.set_anc_mode(AncMode::Off).await
        }.map_err(|e| format!("Failed to set transparency: {}", e))
    }
    
    /// Get game mode state
    pub async fn get_game_mode(&self) -> Result<GameModeState, String> {
        let enabled = self.inner.get_game_mode().await
            .map_err(|e| format!("Failed to get game mode: {}", e))?;
        Ok(GameModeState { enabled })
    }
    
    /// Set game mode
    pub async fn set_game_mode(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_game_mode(enabled).await
            .map_err(|e| format!("Failed to set game mode: {}", e))
    }
    
    /// Get multipoint state
    pub async fn get_multipoint(&self) -> Result<MultipointState, String> {
        let enabled = self.inner.get_multipoint().await
            .map_err(|e| format!("Failed to get multipoint: {}", e))?;
        Ok(MultipointState { enabled })
    }
    
    /// Set multipoint
    pub async fn set_multipoint(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_multipoint(enabled).await
            .map_err(|e| format!("Failed to set multipoint: {}", e))
    }
    
    /// Get LDAC state
    pub async fn get_ldac(&self) -> Result<LdacState, String> {
        let enabled = self.inner.get_ldac().await
            .map_err(|e| format!("Failed to get LDAC: {}", e))?;
        Ok(LdacState { enabled })
    }
    
    /// Set LDAC
    pub async fn set_ldac(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_ldac(enabled).await
            .map_err(|e| format!("Failed to set LDAC: {}", e))
    }
    
    /// Get EQ state
    pub async fn get_eq(&self) -> Result<EqState, String> {
        let preset = self.inner.get_eq_preset().await
            .map_err(|e| format!("Failed to get EQ preset: {}", e))?;
        let custom = self.inner.get_custom_eq().await
            .map_err(|e| format!("Failed to get custom EQ: {}", e))?;
        Ok(EqState { preset, custom_bands: custom })
    }
    
    /// Set EQ preset
    pub async fn set_eq_preset(&self, preset: u8) -> Result<(), String> {
        self.inner.set_eq_preset(preset).await
            .map_err(|e| format!("Failed to set EQ preset: {}", e))
    }
    
    /// Set custom EQ
    pub async fn set_custom_eq(&self, bands: Vec<i8>) -> Result<(), String> {
        self.inner.set_custom_eq(bands).await
            .map_err(|e| format!("Failed to set custom EQ: {}", e))
    }
    
    /// Get bass enhance state
    pub async fn get_bass_enhance(&self) -> Result<BassEnhanceState, String> {
        let enabled = self.inner.get_bass_enhance().await
            .map_err(|e| format!("Failed to get bass enhance: {}", e))?;
        let level = self.inner.get_bass_enhance_level().await
            .map_err(|e| format!("Failed to get bass level: {}", e))?;
        Ok(BassEnhanceState { enabled, level })
    }
    
    /// Set bass enhance
    pub async fn set_bass_enhance(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_bass_enhance(enabled).await
            .map_err(|e| format!("Failed to set bass enhance: {}", e))
    }
    
    /// Set bass enhance level
    pub async fn set_bass_enhance_level(&self, level: u8) -> Result<(), String> {
        self.inner.set_bass_enhance_level(level).await
            .map_err(|e| format!("Failed to set bass level: {}", e))
    }
    
    /// Get wind noise reduction state
    pub async fn get_wind_noise(&self) -> Result<WindNoiseState, String> {
        let enabled = self.inner.get_wind_noise_reduction().await
            .map_err(|e| format!("Failed to get wind noise: {}", e))?;
        Ok(WindNoiseState { enabled })
    }
    
    /// Set wind noise reduction
    pub async fn set_wind_noise(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_wind_noise_reduction(enabled).await
            .map_err(|e| format!("Failed to set wind noise: {}", e))
    }
    
    /// Get wearing detection state
    pub async fn get_wearing_detection(&self) -> Result<WearingDetectionState, String> {
        let enabled = self.inner.get_wearing_detection().await
            .map_err(|e| format!("Failed to get wearing detection: {}", e))?;
        Ok(WearingDetectionState { enabled })
    }
    
    /// Set wearing detection
    pub async fn set_wearing_detection(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_wearing_detection(enabled).await
            .map_err(|e| format!("Failed to set wearing detection: {}", e))
    }
    
    /// Get easy chat state
    pub async fn get_easy_chat(&self) -> Result<EasyChatState, String> {
        let enabled = self.inner.get_easy_chat().await
            .map_err(|e| format!("Failed to get easy chat: {}", e))?;
        Ok(EasyChatState { enabled })
    }
    
    /// Set easy chat
    pub async fn set_easy_chat(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_easy_chat(enabled).await
            .map_err(|e| format!("Failed to set easy chat: {}", e))
    }
    
    /// Get auto power off state
    pub async fn get_auto_power_off(&self) -> Result<AutoPowerOffState, String> {
        let minutes = self.inner.get_auto_power_off().await
            .map_err(|e| format!("Failed to get auto power off: {}", e))?;
        Ok(AutoPowerOffState { minutes })
    }
    
    /// Set auto power off
    pub async fn set_auto_power_off(&self, minutes: u8) -> Result<(), String> {
        self.inner.set_auto_power_off(minutes).await
            .map_err(|e| format!("Failed to set auto power off: {}", e))
    }
    
    /// Get LDAC codec state
    pub async fn get_ldac_codec(&self) -> Result<LdacCodecState, String> {
        let enabled = self.inner.get_ldac_codec().await
            .map_err(|e| format!("Failed to get LDAC codec: {}", e))?;
        Ok(LdacCodecState { enabled })
    }
    
    /// Set LDAC codec
    pub async fn set_ldac_codec(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_ldac_codec(enabled).await
            .map_err(|e| format!("Failed to set LDAC codec: {}", e))
    }
    
    /// Find my buds
    pub async fn find_buds(&self) -> Result<(), String> {
        self.inner.find_my_earbuds().await
            .map_err(|e| format!("Failed to find buds: {}", e))
    }
    
    /// Ear tip fit test
    pub async fn ear_tip_test(&self) -> Result<(), String> {
        self.inner.ear_tip_fit_test().await
            .map_err(|e| format!("Failed to start ear tip test: {}", e))
    }
    
    /// Get firmware version
    pub async fn get_firmware(&self) -> Result<String, String> {
        self.inner.get_firmware_version().await
            .map_err(|e| format!("Failed to get firmware: {}", e))
    }
    
    /// Get device info
    pub async fn get_device_info(&self) -> Result<DeviceInfo, String> {
        let info = self.inner.get_device_info().await
            .map_err(|e| format!("Failed to get device info: {}", e))?;
        Ok(DeviceInfo {
            model: self.model.clone(),
            name: info.name,
            firmware: info.firmware_version,
            hardware: info.hardware_version,
            color: info.color,
        })
    }
    
    /// Get gesture setting
    pub async fn get_gesture(&self, gesture: &str) -> Result<GestureAction, String> {
        let action = self.inner.get_gesture(gesture).await
            .map_err(|e| format!("Failed to get gesture: {}", e))?;
        Ok(action)
    }
    
    /// Set gesture
    pub async fn set_gesture(&self, gesture: &str, action: GestureAction) -> Result<(), String> {
        self.inner.set_gesture(gesture, action).await
            .map_err(|e| format!("Failed to set gesture: {}", e))
    }
    
    /// Get all available gestures
    pub async fn get_all_gestures(&self) -> Result<Vec<(String, GestureAction)>, String> {
        self.inner.get_all_gestures().await
            .map_err(|e| format!("Failed to get gestures: {}", e))
    }
    
    /// Get multipoint state
    pub async fn get_multipoint_state(&self) -> Result<MultipointState, String> {
        let enabled = self.inner.get_multipoint().await
            .map_err(|e| format!("Failed to get multipoint: {}", e))?;
        Ok(MultipointState { enabled })
    }
    
    /// Set multipoint
    pub async fn set_multipoint_state(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_multipoint(enabled).await
            .map_err(|e| format!("Failed to set multipoint: {}", e))
    }
    
    /// Get LDAC state
    pub async fn get_ldac_state(&self) -> Result<LdacState, String> {
        let enabled = self.inner.get_ldac().await
            .map_err(|e| format!("Failed to get LDAC: {}", e))?;
        Ok(LdacState { enabled })
    }
    
    /// Set LDAC
    pub async fn set_ldac_state(&self, enabled: bool) -> Result<(), String> {
        self.inner.set_ldac(enabled).await
            .map_err(|e| format!("Failed to set LDAC: {}", e))
    }
}

/// Protocol error
#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Device not found: {0}")]
    DeviceNotFound(String),
    #[error("Protocol error: {0}")]
    ProtocolError(String),
    #[error("Timeout: {0}")]
    Timeout(String),
    #[error("Not supported: {0}")]
    NotSupported(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<openscq30_lib::SoundcoreError> for ProtocolError {
    fn from(e: openscq30_lib::SoundcoreError) -> Self {
        ProtocolError::ProtocolError(e.to_string())
    }
}

/// Result type for protocol operations
pub type ProtocolResult<T> = Result<T, ProtocolError>;

/// Device profile loaded from TOML
#[derive(Debug, Clone, serde::Deserialize)]
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

impl DeviceProfile {
    /// Load all device profiles from embedded TOML
    pub fn load_all() -> Vec<Self> {
        let toml_str = env!("DEVICE_PROFILES_TOML");
        let value: toml::Value = toml::from_str(&toml_str).expect("Failed to parse device profiles");
        let devices = value.get("device").and_then(|v| v.as_array()).unwrap_or(&[]);
        devices.iter().filter_map(|d| {
            toml::from_str::<DeviceProfile>(&d.to_string()).ok()
        }).collect()
    }
    
    /// Find profile by model name
    pub fn find_by_model(model: &str) -> Option<Self> {
        Self::load_all().into_iter().find(|d| d.model == model)
    }
    
    /// Find profile by Bluetooth name
    pub fn find_by_bluetooth_name(name: &str) -> Option<Self> {
        Self::load_all().into_iter().find(|d| d.bluetooth_name == name)
    }
    
    /// Check if device supports a feature
    pub fn supports(&self, feature: &str) -> bool {
        match feature {
            "anc" => self.supports_anc,
            "transparency" => self.supports_transparency,
            "adaptive_anc" => self.supports_adaptive_anc,
            "in_ear_detection" => self.supports_in_ear_detection,
            "low_latency" => self.supports_low_latency,
            "gestures" => self.supports_gestures,
            "eq" => self.supports_eq,
            "advanced_eq" => self.supports_advanced_eq,
            "bass_enhance" => self.supports_bass_enhance,
            "find_buds" => self.supports_find_buds,
            "ear_tip_test" => self.supports_ear_tip_test,
            "ldac" => self.supports_ldac,
            "multipoint" => self.supports_multipoint,
            "wind_noise" => self.supports_wind_noise,
            "wearing_detection" => self.supports_wearing_detection,
            "easy_chat" => self.supports_easy_chat,
            "auto_power_off" => self.supports_auto_power_off,
            "ldac_codec" => self.supports_ldac_codec,
            "case_battery" => self.has_case_battery,
            _ => false,
        }
    }
}

/// ANC modes from profile
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AncModeProfile {
    Off,
    Anc,
    Transparency,
    Adaptive,
}

impl AncModeProfile {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "off" => Some(AncModeProfile::Off),
            "anc" => Some(AncModeProfile::Anc),
            "transparency" => Some(AncModeProfile::Transparency),
            "adaptive" => Some(AncModeProfile::Adaptive),
            _ => None,
        }
    }
    
    pub fn to_openscq30(self) -> openscq30_lib::AncMode {
        match self {
            AncModeProfile::Off => openscq30_lib::AncMode::Off,
            AncModeProfile::Anc => openscq30_lib::AncMode::Anc,
            AncModeProfile::Transparency => openscq30_lib::AncMode::Transparency,
            AncModeProfile::Adaptive => openscq30_lib::AncMode::Adaptive,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_device_profile_loading() {
        let profiles = DeviceProfile::load_all();
        assert!(!profiles.is_empty(), "Should load at least one device profile");
        assert!(profiles.len() >= 40, "Should load 40+ device profiles");
    }
    
    #[test]
    fn test_device_profile_find() {
        let profile = DeviceProfile::find_by_model("A3954");
        assert!(profile.is_some());
        let p = profile.unwrap();
        assert_eq!(p.display_name, "Soundcore Liberty 4 Pro");
        assert!(p.supports_anc);
        assert!(p.supports_adaptive_anc);
    }
    
    #[test]
    fn test_feature_check() {
        let profile = DeviceProfile::find_by_model("A3949").unwrap(); // P20i
        assert!(!profile.supports("anc"));
        assert!(!profile.supports("transparency"));
        assert!(profile.supports("eq"));
        assert!(!profile.supports("advanced_eq"));
    }
}