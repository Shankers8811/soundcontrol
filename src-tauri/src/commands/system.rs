use tauri::{State, command, Manager, AppHandle};
use crate::AppState;

#[command]
pub fn register_hotkey(state: State<'_, AppState>, key_combo: String, action: String) -> Result<(), String> {
    let db = &state.db;
    let key = format!("hotkey_{}", action);
    db.save_setting(&key, &key_combo).map_err(|e| e.to_string())
}

#[command]
pub fn unregister_hotkey(state: State<'_, AppState>, action: String) -> Result<(), String> {
    let db = &state.db;
    let key = format!("hotkey_{}", action);
    db.remove_setting(&key).map_err(|e| e.to_string())
}

#[command]
pub fn get_hotkeys(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = &state.db;
    let anc = db.get_setting("hotkey_anc").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+N".to_string());
    let game = db.get_setting("hotkey_game").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+G".to_string());
    let eq = db.get_setting("hotkey_eq").unwrap_or_default().unwrap_or_else(|| "Ctrl+Alt+E".to_string());

    Ok(serde_json::json!({
        "anc": anc,
        "game_mode": game,
        "eq": eq,
    }))
}

#[command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Window not found")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Window not found")?;
    window.minimize().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[command]
pub fn check_for_updates(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "current_version": "0.1.0",
        "update_available": false,
        "download_url": null,
    }))
}