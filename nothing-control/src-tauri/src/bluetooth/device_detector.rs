//! Device Detector - Identifies connected Soundcore device and gates features
//!
//! This module ensures only supported features are available per device model,
//! preventing users from attempting unsupported operations.

use crate::bluetooth::models::DeviceProfile;
use crate::protocol::DeviceProfile as ProtoProfile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Device detection result with full capability info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DetectedDevice {
    pub mac: String,
    pub model_name: String,
    pub display_name: String,
    pub sku: String,
    pub category: String,
    pub capabilities: DeviceCapabilities,
    pub icon: String,
}

/// Feature capability flags per device
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceCapabilities {
    pub anc: bool,
    pub transparency: bool,
    pub adaptive_anc: bool,
    pub wind_noise: bool,
    pub in_ear_detection: bool,
    pub low_latency: bool,
    pub gestures: bool,
    pub eq_custom: bool,
    pub eq_factory: bool,
    pub bass_enhance: bool,
    pub find_buds: bool,
    pub ear_tip_test: bool,
    pub ldac: bool,
    pub multipoint: bool,
    pub wearing_detection: bool,
    pub easy_chat: bool,
    pub auto_power_off: bool,
    pub ldac_codec: bool,
    pub case_battery: bool,
    pub anc_modes: Vec<String>,
}

/// Feature gate result - tells UI whether to show/enable a feature
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeatureGate {
    /// Feature is available and enabled
    Enabled,
    /// Feature exists but is disabled (e.g., ANC off)
    Disabled,
    /// Feature is not supported by this device model
    Unsupported,
}

/// Device detector - manages device detection and capability checking
pub struct DeviceDetector {
    devices: std::collections::HashMap<String, DetectedDevice>,
    active_device: Option<String>,
}

impl DeviceDetector {
    pub fn new() -> Self {
        Self {
            devices: std::collections::HashMap::new(),
            active_device: None,
        }
    }

    /// Register a connected device with its profile
    pub fn register_device(
        &mut self,
        mac: &str,
        bluetooth_name: &str,
        profile: &crate::protocol::DeviceProfile,
    ) {
        let device = DetectedDevice {
            mac: mac.to_string(),
            model_name: bluetooth_name.to_string(),
            display_name: profile.display_name.clone(),
            sku: profile.model.clone(),
            category: profile.category.clone(),
            capabilities: DeviceCapabilities {
                anc: profile.supports_anc,
                transparency: profile.supports_transparency,
                adaptive_anc: profile.supports_adaptive_anc,
                wind_noise: profile.supports_wind_noise,
                in_ear_detection: profile.supports_in_ear_detection,
                low_latency: profile.supports_low_latency,
                gestures: profile.supports_gestures,
                eq_custom: profile.supports_advanced_eq,
                eq_factory: profile.supports_eq,
                bass_enhance: profile.supports_bass_enhance,
                find_buds: profile.supports_find_buds,
                ear_tip_test: profile.supports_ear_tip_test,
                ldac: profile.supports_ldac,
                multipoint: profile.supports_multipoint,
                wearing_detection: profile.supports_wearing_detection,
                easy_chat: profile.supports_easy_chat,
                auto_power_off: profile.supports_auto_power_off,
                ldac_codec: profile.supports_ldac_codec,
                case_battery: profile.has_case_battery,
                anc_modes: profile.anc_modes.clone(),
            },
            icon: profile.icon.clone(),
        };

        info!("Registered device: {} ({})", bluetooth_name, profile.model);
        self.devices.insert(mac.to_string(), device);
    }

    /// Set the currently active device
    pub fn set_active_device(&mut self, mac: &str) {
        self.active_device = Some(mac.to_string());
        info!("Active device set to: {}", mac);
    }

    /// Get the active device
    pub fn get_active_device(&self) -> Option<&DetectedDevice> {
        self.active_device
            .as_ref()
            .and_then(|mac| self.devices.get(mac))
    }

    /// Get all registered devices
    pub fn get_all_devices(&self) -> Vec<&DetectedDevice> {
        self.devices.values().collect()
    }

    /// Check if a feature is supported for the active device
    pub fn check_feature(&self, feature: DeviceFeature) -> FeatureGate {
        let device = match self.get_active_device() {
            Some(d) => d,
            None => return FeatureGate::Unsupported,
        };

        match feature {
            DeviceFeature::Anc => {
                if device.capabilities.anc {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::Transparency => {
                if device.capabilities.transparency {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::AdaptiveAnc => {
                if device.capabilities.adaptive_anc {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::WindNoise => {
                if device.capabilities.wind_noise {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::InEarDetection => {
                if device.capabilities.in_ear_detection {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::LowLatency => {
                if device.capabilities.low_latency {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::Gestures => {
                if device.capabilities.gestures {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::EqCustom => {
                if device.capabilities.eq_custom {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::EqFactory => {
                if device.capabilities.eq_factory {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::BassEnhance => {
                if device.capabilities.bass_enhance {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::FindBuds => {
                if device.capabilities.find_buds {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::EarTipTest => {
                if device.capabilities.ear_tip_test {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::Ldac => {
                if device.capabilities.ldac {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::Multipoint => {
                if device.capabilities.multipoint {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::WearingDetection => {
                if device.capabilities.wearing_detection {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::EasyChat => {
                if device.capabilities.easy_chat {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::AutoPowerOff => {
                if device.capabilities.auto_power_off {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::LdacCodec => {
                if device.capabilities.ldac_codec {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
            DeviceFeature::CaseBattery => {
                if device.capabilities.case_battery {
                    FeatureGate::Enabled
                } else {
                    FeatureGate::Unsupported
                }
            }
        }
    }

    /// Get a user-friendly message for why a feature is unavailable
    pub fn get_feature_message(&self, feature: DeviceFeature) -> String {
        let device = match self.get_active_device() {
            Some(d) => d,
            None => return "No device connected".to_string(),
        };

        match feature {
            DeviceFeature::Anc => format!(
                "{} does not support Active Noise Control",
                device.display_name
            ),
            DeviceFeature::Transparency => format!(
                "{} does not support Transparency mode",
                device.display_name
            ),
            DeviceFeature::AdaptiveAnc => format!(
                "{} does not support Adaptive ANC",
                device.display_name
            ),
            DeviceFeature::WindNoise => format!(
                "{} does not support Wind Noise Reduction",
                device.display_name
            ),
            DeviceFeature::InEarDetection => format!(
                "{} does not support In-Ear Detection",
                device.display_name
            ),
            DeviceFeature::LowLatency => format!(
                "{} does not support Game/Low Latency Mode",
                device.display_name
            ),
            DeviceFeature::Gestures => format!(
                "{} does not support Gesture customization",
                device.display_name
            ),
            DeviceFeature::EqCustom => format!(
                "{} does not support Custom EQ",
                device.display_name
            ),
            DeviceFeature::EqFactory => format!(
                "{} does not support Factory EQ presets",
                device.display_name
            ),
            DeviceFeature::BassEnhance => format!(
                "{} does not support Bass Enhance",
                device.display_name
            ),
            DeviceFeature::FindBuds => format!(
                "{} does not support Find My Earbuds",
                device.display_name
            ),
            DeviceFeature::EarTipTest => format!(
                "{} does not support Ear Tip Fit Test",
                device.display_name
            ),
            DeviceFeature::Ldac => format!(
                "{} does not support LDAC codec",
                device.display_name
            ),
            DeviceFeature::Multipoint => format!(
                "{} does not support Multipoint connection",
                device.display_name
            ),
            DeviceFeature::WearingDetection => format!(
                "{} does not support Wear Detection",
                device.display_name
            ),
            DeviceFeature::EasyChat => format!(
                "{} does not support Easy Chat",
                device.display_name
            ),
            DeviceFeature::AutoPowerOff => format!(
                "{} does not support Auto Power Off",
                device.display_name
            ),
            DeviceFeature::LdacCodec => format!(
                "{} does not support LDAC codec setting",
                device.display_name
            ),
            DeviceFeature::CaseBattery => format!(
                "{} does not report Case Battery level",
                device.display_name
            ),
        }
    }
}

/// Device feature enum for gating
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeviceFeature {
    Anc,
    Transparency,
    AdaptiveAnc,
    WindNoise,
    InEarDetection,
    LowLatency,
    Gestures,
    EqCustom,
    EqFactory,
    BassEnhance,
    FindBuds,
    EarTipTest,
    Ldac,
    Multipoint,
    WearingDetection,
    EasyChat,
    AutoPowerOff,
    LdacCodec,
    CaseBattery,
}

impl Default for DeviceDetector {
    fn default() -> Self {
        Self::new()
    }
}