//! Device control commands (ANC, EQ, Game Mode, LDAC, Dual Connection)

use crate::db::Database;
use crate::bluetooth::{BluetoothManager, protocol::*};
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

#[tauri::command]
pub async fn set_anc_mode(
    bluetooth: State<'_, crate::AppState>,
    request: AncModeRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let frame = build_anc_mode(request.mode, request.sub_mode);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_transparency_mode(
    bluetooth: State<'_, crate::AppState>,
    request: TransparencyModeRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    // Transparency is a sub-mode of ANC
    let frame = build_anc_mode(AncMode::Transparency, Some(request.mode.to_byte()));
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
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
    
    let frame = build_eq_preset(request.preset_id, &eq_type);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
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
    
    let frame = build_custom_eq(&request.bands);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
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
    let frame = build_game_mode(request.enabled, variant);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn toggle_ldac(
    bluetooth: State<'_, crate::AppState>,
    request: LdacRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let frame = build_ldac(request.enabled);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn toggle_dual_connection(
    bluetooth: State<'_, crate::AppState>,
    request: DualConnectionRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let frame = build_dual_connection(request.enabled);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn set_spatial_audio(
    bluetooth: State<'_, crate::AppState>,
    request: SpatialAudioRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    
    let frame = build_spatial_audio(request.mode);
    bluetooth.bluetooth.send_frame(&mac, &frame).await.map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}