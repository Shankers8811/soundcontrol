use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub name: String,
    pub model: String,
    pub anc_modes: Vec<String>,
    pub supports_transparency: bool,
    pub supports_adaptive: bool,
    pub supports_wind_noise: bool,
    pub supports_game_mode: bool,
    pub supports_ldac: bool,
    pub supports_multipoint: bool,
    pub supports_bass_enhance: bool,
    pub supports_wearing_detection: bool,
    pub supports_easy_chat: bool,
    pub supports_auto_power_off: bool,
    pub supports_find_buds: bool,
    pub supports_ear_tip_test: bool,
    pub supports_custom_gestures: bool,
    pub battery_count: u8,
    pub eq_bands: u8,
    pub rfcomm_channel: u8,
}

impl DeviceProfile {
    pub fn from_toml(device: &toml::Value) -> Self {
        Self {
            name: device.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown").to_string(),
            model: device.get("model").and_then(|m| m.as_str()).unwrap_or("").to_string(),
            anc_modes: device.get("anc_modes")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            supports_transparency: device.get("supports_transparency").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_adaptive: device.get("supports_adaptive").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_wind_noise: device.get("supports_wind_noise").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_game_mode: device.get("supports_game_mode").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_ldac: device.get("supports_ldac").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_multipoint: device.get("supports_multipoint").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_bass_enhance: device.get("supports_bass_enhance").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_wearing_detection: device.get("supports_wearing_detection").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_easy_chat: device.get("supports_easy_chat").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_auto_power_off: device.get("supports_auto_power_off").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_find_buds: device.get("supports_find_buds").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_ear_tip_test: device.get("supports_ear_tip_test").and_then(|v| v.as_bool()).unwrap_or(false),
            supports_custom_gestures: device.get("supports_custom_gestures").and_then(|v| v.as_bool()).unwrap_or(false),
            battery_count: device.get("battery_count").and_then(|v| v.as_integer()).unwrap_or(3) as u8,
            eq_bands: device.get("eq_bands").and_then(|v| v.as_integer()).unwrap_or(8) as u8,
            rfcomm_channel: device.get("rfcomm_channel").and_then(|v| v.as_integer()).unwrap_or(15) as u8,
        }
    }

    pub fn has_feature(&self, feature: DeviceFeature) -> bool {
        match feature {
            DeviceFeature::ANC => !self.anc_modes.is_empty(),
            DeviceFeature::Transparency => self.supports_transparency,
            DeviceFeature::Adaptive => self.supports_adaptive,
            DeviceFeature::WindNoise => self.supports_wind_noise,
            DeviceFeature::GameMode => self.supports_game_mode,
            DeviceFeature::LDAC => self.supports_ldac,
            DeviceFeature::Multipoint => self.supports_multipoint,
            DeviceFeature::BassEnhance => self.supports_bass_enhance,
            DeviceFeature::WearingDetection => self.supports_wearing_detection,
            DeviceFeature::EasyChat => self.supports_easy_chat,
            DeviceFeature::AutoPowerOff => self.supports_auto_power_off,
            DeviceFeature::FindBuds => self.supports_find_buds,
            DeviceFeature::EarTipTest => self.supports_ear_tip_test,
            DeviceFeature::CustomGestures => self.supports_custom_gestures,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeviceFeature {
    ANC,
    Transparency,
    Adaptive,
    WindNoise,
    GameMode,
    LDAC,
    Multipoint,
    BassEnhance,
    WearingDetection,
    EasyChat,
    AutoPowerOff,
    FindBuds,
    EarTipTest,
    CustomGestures,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryLevel {
    pub left: Option<u8>,
    pub right: Option<u8>,
    pub case: Option<u8>,
    pub left_charging: bool,
    pub right_charging: bool,
    pub case_charging: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub name: String,
    pub address: String,
    pub model: String,
    pub connected: bool,
    pub profile: Option<DeviceProfile>,
    pub battery: Option<BatteryLevel>,
    pub anc_mode: Option<String>,
    pub eq_preset: Option<String>,
    pub game_mode: bool,
    pub ldac: bool,
    pub multipoint: bool,
}
