use tauri::{State, command};
use crate::AppState;
use crate::db::Database;

#[command]
pub fn get_settings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = &state.db;
    let theme = db.get_setting("theme").unwrap_or_default().unwrap_or_else(|| "dark".to_string());
    let language = db.get_setting("language").unwrap_or_default().unwrap_or_else(|| "en".to_string());
    let auto_connect = db.get_setting("auto_connect").unwrap_or_default().unwrap_or_else(|| "true".to_string());
    let auto_update = db.get_setting("auto_update").unwrap_or_default().unwrap_or_else(|| "true".to_string());
    let notifications = db.get_setting("notifications").unwrap_or_default().unwrap_or_else(|| "true".to_string());
    let hotkey_anc = db.get_setting("hotkey_anc").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+N".to_string());
    let hotkey_game = db.get_setting("hotkey_game").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+G".to_string());
    let hotkey_eq = db.get_setting("hotkey_eq").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+E".to_string());

    Ok(serde_json::json!({
        "theme": theme,
        "language": language,
        "auto_connect": auto_connect,
        "auto_update": auto_update,
        "notifications": notifications,
        "hotkey_anc": hotkey_anc,
        "hotkey_game": hotkey_game,
        "hotkey_eq": hotkey_eq,
    }))
}

#[command]
pub fn update_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let db = &state.db;
    db.save_setting(&key, &value).map_err(|e| e.to_string())
}
