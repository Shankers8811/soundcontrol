//! Settings commands

use crate::db::Database;
use crate::bluetooth::models::Settings;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub theme: Option<String>,
    pub language: Option<String>,
    pub auto_check_updates: Option<bool>,
    pub start_minimized: Option<bool>,
    pub show_tray: Option<bool>,
    pub log_level: Option<String>,
    pub bluetooth_adapter: Option<String>,
}

#[tauri::command]
pub async fn get_settings(db: State<'_, crate::AppState>) -> Result<Settings, String> {
    db.db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    db: State<'_, crate::AppState>,
    request: UpdateSettingsRequest,
) -> Result<Settings, String> {
    let mut current = db.db.get_settings().map_err(|e| e.to_string())?;
    
    if let Some(theme) = request.theme {
        current.theme = theme;
    }
    if let Some(language) = request.language {
        current.language = language;
    }
    if let Some(auto_check_updates) = request.auto_check_updates {
        current.auto_check_updates = auto_check_updates;
    }
    if let Some(start_minimized) = request.start_minimized {
        current.start_minimized = start_minimized;
    }
    if let Some(show_tray) = request.show_tray {
        current.show_tray = show_tray;
    }
    if let Some(log_level) = request.log_level {
        current.log_level = log_level;
    }
    if let Some(bluetooth_adapter) = request.bluetooth_adapter {
        current.bluetooth_adapter = Some(bluetooth_adapter);
    }
    
    db.db.update_settings(&current).map_err(|e| e.to_string())
}