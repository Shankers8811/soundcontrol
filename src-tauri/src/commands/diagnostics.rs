use tauri::{State, command};
use crate::AppState;
use crate::protocol::BatteryLevel;
use std::fs;
use std::path::PathBuf;
use chrono::Utc;

#[command]
pub fn get_battery_history(state: State<'_, AppState>, address: String, limit: u32) -> Result<Vec<serde_json::Value>, String> {
    let db = &state.db;
    let history = db.get_battery_history(&address, limit).map_err(|e| e.to_string())?;
    Ok(history.into_iter().map(|(timestamp, left, right, case, lc, rc, cc)| {
        serde_json::json!({
            "timestamp": timestamp,
            "left": left,
            "right": right,
            "case": case,
            "left_charging": lc,
            "right_charging": rc,
            "case_charging": cc,
        })
    }).collect())
}

#[command]
pub fn get_frame_log(state: State<'_, AppState>, limit: u32) -> Result<Vec<serde_json::Value>, String> {
    let db = &state.db;
    let log = db.get_frame_log(limit).map_err(|e| e.to_string())?;
    Ok(log.into_iter().map(|(direction, frame_data, logged_at)| {
        serde_json::json!({
            "direction": direction,
            "frame_data": frame_data,
            "logged_at": logged_at,
        })
    }).collect())
}

#[command]
pub fn export_diagnostics(state: State<'_, AppState>) -> Result<String, String> {
    let db = &state.db;
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("soundcontrol_diagnostics_{}.json", timestamp);

    // Collect all diagnostic data
    let frame_log = db.get_frame_log(1000).unwrap_or_default();
    let settings = serde_json::json!({});

    let diagnostic_data = serde_json::json!({
        "exported_at": timestamp,
        "app_version": "0.1.0",
        "frame_log": frame_log,
        "settings": settings,
    });

    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let file_path = dir.join(&filename);

    fs::write(&file_path, serde_json::to_string_pretty(&diagnostic_data).unwrap())
        .map_err(|e| format!("Failed to export diagnostics: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[command]
pub fn check_firmware_update(state: State<'_, AppState>, model: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "model": model,
        "update_available": false,
        "cached": null,
    }))
}