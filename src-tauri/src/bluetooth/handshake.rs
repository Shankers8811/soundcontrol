//! Handshake module - Channel probing and device identification

use crate::bluetooth::protocol::*;
use crate::bluetooth::models::*;
use anyhow::{Result, anyhow};
use tokio::time::{timeout, Duration};
use tracing::{debug, info, warn};

/// Handshake result
#[derive(Debug, Clone)]
pub struct HandshakeResult {
    pub sku: String,
    pub rfcomm_channel: u8,
    pub firmware_version: Option<String>,
    pub battery: Option<BatteryTelemetry>,
}

/// Probe RFCOMM channels to find the correct one
/// Soundcore devices typically use channels: 4 (most earbuds), 10 (P20i family), 12/15 (over-ears), 30 (Space 2)
pub async fn probe_channels<F, Fut>(mac: &str, mut sender: F) -> Result<HandshakeResult>
where
    F: FnMut(u8, &[u8]) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<u8>>>,
{
    // Channel candidates in order of likelihood
    let channels = [4, 10, 12, 15, 30, 1, 2, 3, 5, 6, 7, 8, 9, 11, 13, 14, 16, 17, 18, 19, 20];
    
    for channel in channels {
        debug!("Probing channel {} for {}", channel, mac);
        
        match try_handshake_on_channel(channel, &sender).await {
            Ok(result) => {
                info!("Handshake successful on channel {} for {}: SKU={}", channel, mac, result.sku);
                return Ok(HandshakeResult {
                    sku: result.sku,
                    rfcomm_channel: channel,
                    firmware_version: result.firmware_version,
                    battery: result.battery,
                });
            }
            Err(e) => {
                debug!("Handshake failed on channel {}: {}", channel, e);
                continue;
            }
        }
    }
    
    Err(anyhow!("No valid RFCOMM channel found for {}", mac))
}

/// Try handshake on a specific channel
async fn try_handshake_on_channel<F, Fut>(channel: u8, sender: &mut F) -> Result<HandshakeResult>
where
    F: FnMut(u8, &[u8]) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<u8>>>,
{
    // Send handshake frame
    let handshake_frame = build_handshake();
    sender(channel, &handshake_frame).await?;
    
    // Wait for response with timeout
    let response = timeout(Duration::from_millis(2000), async {
        loop {
            // This would need a receiver - in practice, the platform implementation
            // handles the receive loop. This is a simplified version.
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }).await;
    
    // In real implementation, the platform-specific code handles the receive
    // This is a placeholder - actual implementation is in linux.rs/windows.rs
    Err(anyhow!("Channel probe not fully implemented in core"))
}

/// Full handshake sequence after channel is established
pub async fn perform_handshake<F, Fut>(channel: u8, mut sender: F, mut receiver: Fut) -> Result<HandshakeResult>
where
    F: FnMut(&[u8]) -> Result<()>,
    Fut: FnMut() -> Result<Vec<u8>>,
{
    // 1. Send handshake (01:01)
    sender(&build_handshake()).await?;
    
    // 2. Wait for handshake response
    let response = timeout(Duration::from_millis(3000), async {
        loop {
            let data = receiver().await?;
            if let Ok(frame) = parse_frame(&data) {
                if frame.category == 0x01 && frame.command == 0x01 {
                    return Ok(frame);
                }
            }
        }
    }).await??;
    
    // 3. Parse SKU from handshake response
    let sku = parse_sku_from_handshake(&response.payload)?;
    
    // 4. Query firmware (01:05)
    sender(&build_firmware_query()).await?;
    let fw_response = timeout(Duration::from_millis(2000), async {
        loop {
            let data = receiver().await?;
            if let Ok(frame) = parse_frame(&data) {
                if frame.category == 0x01 && frame.command == 0x05 {
                    return Ok(frame);
                }
            }
        }
    }).await;
    
    let firmware_version = fw_response.ok()
        .and_then(|r| r.ok())
        .and_then(|frame| parse_firmware_version(&frame.payload));
    
    // 5. Query battery (01:03)
    sender(&build_battery_query()).await?;
    let bat_response = timeout(Duration::from_millis(2000), async {
        loop {
            let data = receiver().await?;
            if let Ok(frame) = parse_frame(&data) {
                if frame.category == 0x01 && frame.command == 0x03 {
                    return Ok(frame);
                }
            }
        }
    }).await;
    
    let battery = bat_response.ok()
        .and_then(|r| r.ok())
        .and_then(|frame| parse_battery(&frame.payload));
    
    Ok(HandshakeResult {
        sku,
        rfcomm_channel: channel,
        firmware_version,
        battery,
    })
}

/// Parse SKU from handshake response payload
fn parse_sku_from_handshake(payload: &[u8]) -> Result<String> {
    if payload.len() < 10 {
        return Err(anyhow!("Handshake payload too short"));
    }
    
    // SKU is typically at offset 2-8 (6-8 bytes)
    let sku_bytes = &payload[2..std::cmp::min(10, payload.len())];
    let sku = String::from_utf8_lossy(sku_bytes)
        .trim_end_matches('\0')
        .trim_end_matches(' ')
        .to_uppercase();
    
    if sku.is_empty() {
        return Err(anyhow!("Empty SKU in handshake"));
    }
    
    Ok(sku)
}

/// Parse firmware version from 01:05 response
fn parse_firmware_version(payload: &[u8]) -> Option<String> {
    if payload.len() < 20 {
        return None;
    }
    
    let version = String::from_utf8_lossy(&payload[..20])
        .trim_end_matches('\0')
        .trim()
        .to_string();
    
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

/// Parse battery from 01:03 response
fn parse_battery(payload: &[u8]) -> Option<BatteryTelemetry> {
    if payload.len() < 4 {
        return None;
    }
    
    let left = payload[0];
    let right = payload[1];
    let case = payload[2];
    let charging = payload[3];
    
    // Validate values (0-100 or 0xFF for unknown)
    let parse_pct = |v: u8| -> Option<u8> {
        if v == 0xFF || v > 100 { None } else { Some(v) }
    };
    
    Some(BatteryTelemetry {
        left_pct: parse_pct(left),
        right_pct: parse_pct(right),
        case_pct: parse_pct(case),
        left_charging: (charging & 0x01) != 0,
        right_charging: (charging & 0x02) != 0,
        case_charging: (charging & 0x04) != 0,
        timestamp: chrono::Utc::now(),
    })
}

/// Identify device capabilities from SKU
pub fn get_capabilities_from_sku(sku: &str, profile: &DeviceProfile) -> DeviceCapabilities {
    DeviceCapabilities {
        anc: profile.anc_levels.map(|levels| AncCapabilities {
            levels,
            has_adaptive: profile.has_wind_noise, // Adaptive often paired with wind
            has_wind: profile.has_wind_noise,
            has_scenes: profile.transparency_modes.len() > 1,
            transparency_modes: profile.transparency_modes.clone(),
        }),
        eq: match profile.eq_type.as_str() {
            "custom_8band" => Some(EqCapabilities::Custom8Band),
            "custom_10band" => Some(EqCapabilities::Custom10Band),
            "factory" => Some(EqCapabilities::FactoryOnly),
            "hearid" => Some(EqCapabilities::HearID),
            _ => None,
        },
        game_mode: profile.has_game_mode.then(|| GameModeCapabilities {
            variant: if sku == "A3947" || sku == "A3957" { GameModeVariant::LibertyNC } else { GameModeVariant::Standard },
        }),
        ldac: profile.has_ldac.then(|| LdacCapabilities {}),
        dual_connection: profile.has_dual_connection.then(|| DualConnectionCapabilities {}),
        spatial_audio: profile.has_spatial_audio.then(|| SpatialCapabilities {
            modes: vec![
                SpatialMode::Off,
                SpatialMode::Music,
                SpatialMode::Movie,
                SpatialMode::Gaming,
            ],
        }),
        touch_remap: profile.has_touch_remap.then(|| TouchRemapCapabilities {}),
        safe_volume: profile.has_safe_volume.then(|| SafeVolumeCapabilities {}),
        hearid: profile.has_hearid.then(|| HearIDCapabilities {}),
    }
}

/// Device capabilities derived from profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCapabilities {
    pub anc: Option<AncCapabilities>,
    pub eq: Option<EqCapabilities>,
    pub game_mode: Option<GameModeCapabilities>,
    pub ldac: Option<LdacCapabilities>,
    pub dual_connection: Option<DualConnectionCapabilities>,
    pub spatial_audio: Option<SpatialCapabilities>,
    pub touch_remap: Option<TouchRemapCapabilities>,
    pub safe_volume: Option<SafeVolumeCapabilities>,
    pub hearid: Option<HearIDCapabilities>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AncCapabilities {
    pub levels: u8,
    pub has_adaptive: bool,
    pub has_wind: bool,
    pub has_scenes: bool,
    pub transparency_modes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EqCapabilities {
    FactoryOnly,
    Custom8Band,
    Custom10Band,
    HearID,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameModeCapabilities {
    pub variant: GameModeCapabilitiesVariant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameModeCapabilitiesVariant {
    Standard,
    LibertyNC,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdacCapabilities {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DualConnectionCapabilities {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialCapabilities {
    pub modes: Vec<SpatialMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TouchRemapCapabilities {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafeVolumeCapabilities {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HearIDCapabilities {}