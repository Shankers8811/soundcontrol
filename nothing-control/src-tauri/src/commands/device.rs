//! Device control commands (ANC, EQ, Game Mode, LDAC, Multipoint, etc.)

use crate::db::Database;
use crate::bluetooth::BluetoothManager;
use crate::bluetooth::models::{AncMode, TransparencyMode, GameModeVariant, SpatialMode, CommandResponse};
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AncModeRequest {
    pub mac: String,
    pub mode: AncMode,
    pub sub_mode: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct TransparencyModeRequest {
    pub mac: String,
    pub mode: TransparencyMode,
}

#[derive(Debug, Deserialize)]
pub struct EqPresetRequest {
    pub mac: String,
    pub preset_id: u8,
}

#[derive(Debug, Deserialize)]
pub struct CustomEqRequest {
    pub mac: String,
    pub bands: Vec<f32>,
}

#[derive(Debug, Deserialize)]
pub struct GameModeRequest {
    pub mac: String,
    pub enabled: bool,
    pub variant: Option<GameModeVariant>,
}

#[derive(Debug, Deserialize)]
pub struct LdacRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct DualConnectionRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct SpatialAudioRequest {
    pub mac: String,
    pub mode: SpatialMode,
}

#[derive(Debug, Deserialize)]
pub struct BassEnhanceRequest {
    pub mac: String,
    pub enabled: bool,
    pub level: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct WindNoiseRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct WearingDetectionRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct EasyChatRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct AutoPowerOffRequest {
    pub mac: String,
    pub minutes: u8,
}

#[derive(Debug, Deserialize)]
pub struct LdacCodecRequest {
    pub mac: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct FindBudsRequest {
    pub mac: String,
}

#[derive(Debug, Deserialize)]
pub struct EarTipTestRequest {
    pub mac: String,
}

#[derive(Debug, Deserialize)]
pub struct GetGestureRequest {
    pub mac: String,
    pub gesture: String,
}

#[derive(Debug, Deserialize)]
pub struct SetGestureRequest {
    pub mac: String,
    pub gesture: String,
    pub action: String,
}

#[derive(Debug, Deserialize)]
pub struct GetAllGesturesRequest {
    pub mac: String,
}

#[tauri::command]
pub async fn set_anc_mode(
    bluetooth: State<'_, crate::AppState>,
    request: AncModeRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetAnc(request.mode);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_transparency_mode(
    bluetooth: State<'_, crate::AppState>,
    request: TransparencyModeRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    // Transparency is a sub-mode of ANC
    let command = crate::bluetooth::protocol::Command::SetTransparency;
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_eq_preset(
    bluetooth: State<'_, crate::AppState>,
    db: State<'_, crate::AppState>,
    request: EqPresetRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    // Get device profile to determine EQ type
    let session = bluetooth.bluetooth.get_session(&mac).await
        .ok_or_else(|| "Device not connected".to_string())?;
    
    let eq_type = session.profile.as_ref()
        .map(|p| p.eq_type.clone())
        .unwrap_or_else(|| "custom_8band".to_string());
    
    // For now, just send the preset command
    let command = crate::bluetooth::protocol::Command::SetEqPreset(request.preset_id);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_custom_eq(
    bluetooth: State<'_, crate::AppState>,
    request: CustomEqRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    if request.bands.len() != 8 {
        return Err("Custom EQ requires exactly 8 bands".to_string());
    }
    
    let command = crate::bluetooth::protocol::Command::SetCustomEq(request.bands);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn toggle_game_mode(
    bluetooth: State<'_, crate::AppState>,
    db: State<'_, crate::AppState>,
    request: GameModeRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let variant = request.variant.unwrap_or(GameModeVariant::Standard);
    let command = crate::bluetooth::protocol::Command::SetLatency(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn toggle_ldac(
    bluetooth: State<'_, crate::AppState>,
    request: LdacRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetLdac(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn toggle_dual_connection(
    bluetooth: State<'_, crate::AppState>,
    request: DualConnectionRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetMultipoint(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_spatial_audio(
    bluetooth: State<'_, crate::AppState>,
    request: SpatialAudioRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    // Spatial audio not directly supported in openscq30 yet
    // Would need to add to openscq30-lib
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_bass_enhance(
    bluetooth: State<'_, crate::AppState>,
    request: BassEnhanceRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    if let Some(level) = request.level {
        let command = crate::bluetooth::protocol::Command::SetBassEnhanceLevel(level);
        bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    } else {
        let command = crate::bluetooth::protocol::Command::SetBassEnhance(request.enabled);
        bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    }
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_wind_noise(
    bluetooth: State<'_, crate::AppState>,
    request: WindNoiseRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetWindNoise(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_wearing_detection(
    bluetooth: State<'_, crate::AppState>,
    request: WearingDetectionRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetWearingDetection(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_easy_chat(
    bluetooth: State<'_, crate::AppState>,
    request: EasyChatRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetEasyChat(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_auto_power_off(
    bluetooth: State<'_, crate::AppState>,
    request: AutoPowerOffRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetAutoPowerOff(request.minutes);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_ldac_codec(
    bluetooth: State<'_, crate::AppState>,
    request: LdacCodecRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::SetLdacCodec(request.enabled);
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn find_buds(
    bluetooth: State<'_, crate::AppState>,
    request: FindBudsRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::FindBuds;
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn ear_tip_test(
    bluetooth: State<'_, crate::AppState>,
    request: EarTipTestRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let command = crate::bluetooth::protocol::Command::EarTipTest;
    bluetooth.bluetooth.send_command(&mac, command).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn get_gesture(
    bluetooth: State<'_, crate::AppState>,
    request: GetGestureRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let device = bluetooth.bluetooth.get_openscq_device(&mac).await
        .ok_or_else(|| "Device not connected".to_string())?;
    
    let action = device.get_gesture(&request.gesture).await
        .map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok_with_data(serde_json::json!({
        "gesture": request.gesture,
        "action": action
    })))
}

#[tauri::command]
pub async fn set_gesture(
    bluetooth: State<'_, crate::AppState>,
    request: SetGestureRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    // Parse action string to GestureAction
    // This would need proper parsing from openscq30-lib
    let action = openscq30_lib::GestureAction::None; // Placeholder
    
    let device = bluetooth.bluetooth.get_openscq_device(&mac).await
        .ok_or_else(|| "Device not connected".to_string())?;
    
    device.set_gesture(&request.gesture, action).await
        .map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn get_all_gestures(
    bluetooth: State<'_, crate::AppState>,
    request: GetAllGesturesRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let device = bluetooth.bluetooth.get_openscq_device(&mac).await
        .ok_or_else(|| "Device not connected".to_string())?;
    
    let gestures = device.get_all_gestures().await
        .map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok_with_data(serde_json::json!(gestures)))
}