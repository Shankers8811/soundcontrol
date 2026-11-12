//! EQ preset management commands

use crate::db::Database;
use crate::bluetooth::models::{EqPreset, CommandResponse};
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SaveEqPresetRequest {
    pub sku: String,
    pub name: String,
    pub bands: Vec<f32>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteEqPresetRequest {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListEqPresetsRequest {
    pub sku: String,
}

#[tauri::command]
pub async fn save_eq_preset(
    db: State<'_, crate::AppState>,
    request: SaveEqPresetRequest,
) -> Result<EqPreset, String> {
    if request.bands.len() != 8 && request.bands.len() != 10 {
        return Err("EQ preset must have 8 or 10 bands".to_string());
    }
    
    let preset = EqPreset {
        id: 0, // Will be assigned by DB
        sku: request.sku,
        name: request.name,
        bands: request.bands.iter().map(|&v| v as i8).collect(),
        is_factory: false,
    };
    
    db.db.save_eq_preset(&preset).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_eq_preset(
    db: State<'_, crate::AppState>,
    request: DeleteEqPresetRequest,
) -> Result<CommandResponse, String> {
    db.db.delete_eq_preset(request.id).map_err(|e| e.to_string())?;
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn list_eq_presets(
    db: State<'_, crate::AppState>,
    request: ListEqPresetsRequest,
) -> Result<Vec<EqPreset>, String> {
    db.db.list_eq_presets(&request.sku).map_err(|e| e.to_string())
}