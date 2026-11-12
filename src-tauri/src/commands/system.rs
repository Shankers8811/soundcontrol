//! System commands (hotkeys, notifications, tray)

use crate::bluetooth::models::{CommandResponse, HotkeyBinding};
use tauri::{State, Manager, AppHandle};
use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Deserialize)]
pub struct RegisterHotkeyRequest {
    pub action: String, // "anc_cycle" | "game_mode" | "show_window"
    pub chord: String,  // "Ctrl+Alt+A" etc.
}

#[tauri::command]
pub async fn register_hotkeys(
    app: AppHandle,
) -> Result<CommandResponse, String> {
    let shortcuts = [
        ("anc_cycle", "Ctrl+Alt+A"),
        ("game_mode", "Ctrl+Alt+G"),
        ("show_window", "Ctrl+Alt+S"),
    ];
    
    for (action, chord) in shortcuts {
        let shortcut = Shortcut::new(chord.parse().map_err(|e| e.to_string())?);
        
        let app_clone = app.clone();
        let action_str = action.to_string();
        
        app.global_shortcut()
            .register(shortcut)
            .map_err(|e| format!("Failed to register {}: {}", action, e))?;
        
        // Handle shortcut activation
        app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
            // Emit event to frontend
            let _ = app_clone.emit("global-shortcut", serde_json::json!({
                "action": action_str,
            }));
        }).map_err(|e| e.to_string())?;
    }
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn unregister_hotkeys(
    app: AppHandle,
) -> Result<CommandResponse, String> {
    let shortcuts = ["Ctrl+Alt+A", "Ctrl+Alt+G", "Ctrl+Alt+S"];
    
    for chord in shortcuts {
        let shortcut = Shortcut::new(chord.parse().map_err(|e| e.to_string())?);
        let _ = app.global_shortcut().unregister(shortcut);
    }
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<CommandResponse, String> {
    use tauri_plugin_notification::NotificationExt;
    
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn check_updates(
    app: AppHandle,
) -> Result<CommandResponse, String> {
    use tauri_plugin_updater::UpdaterExt;
    
    let update = app.updater().check().await.map_err(|e| e.to_string())?;
    
    if let Some(update) = update {
        // Notify frontend of available update
        let _ = app.emit("update-available", serde_json::json!({
            "version": update.version,
            "notes": update.body,
        }));
        
        Ok(CommandResponse::ok_with_data(serde_json::json!({
            "available": true,
            "version": update.version,
        })))
    } else {
        Ok(CommandResponse::ok_with_data(serde_json::json!({
            "available": false,
        })))
    }
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
) -> Result<CommandResponse, String> {
    use tauri_plugin_updater::UpdaterExt;
    
    let update = app.updater().check().await.map_err(|e| e.to_string())?;
    
    if let Some(update) = update {
        let mut downloaded = 0;
        update.download_and_install(|chunk_length, content_length| {
            downloaded += chunk_length;
            let progress = if let Some(total) = content_length {
                (downloaded as f64 / total as f64 * 100.0) as u32
            } else {
                0
            };
            let _ = app.emit("update-progress", serde_json::json!({ "progress": progress }));
        }).await.map_err(|e| e.to_string())?;
        
        Ok(CommandResponse::ok())
    } else {
        Err("No update available".to_string())
    }
}