//! Diagnostics commands

use crate::db::Database;
use crate::bluetooth::models::{BatteryRecord, FrameLogEntry, FirmwareInfo, CommandResponse, DiagnosticBundle};
use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use zip::write::FileOptions;
use std::io::Write;

#[derive(Debug, Deserialize)]
pub struct BatteryHistoryRequest {
    pub mac: String,
    pub hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct FrameLogRequest {
    pub mac: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct ExportDiagnosticsRequest {
    pub mac: String,
}

#[derive(Debug, Deserialize)]
pub struct FirmwareCheckRequest {
    pub sku: String,
}

#[tauri::command]
pub async fn get_battery_history(
    db: State<'_, crate::AppState>,
    request: BatteryHistoryRequest,
) -> Result<Vec<BatteryRecord>, String> {
    let hours = request.hours.unwrap_or(24);
    let mac = request.mac.to_uppercase();
    db.db.get_battery_history(&mac, hours).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_frame_log(
    db: State<'_, crate::AppState>,
    request: FrameLogRequest,
) -> Result<Vec<FrameLogEntry>, String> {
    let limit = request.limit.unwrap_or(100);
    let mac = request.mac.to_uppercase();
    db.db.get_frame_log(&mac, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_diagnostics(
    db: State<'_, crate::AppState>,
    bluetooth: State<'_, Arc<crate::bluetooth::BluetoothManager>>,
    request: ExportDiagnosticsRequest,
) -> Result<String, String> {
    let mac = request.mac.to_uppercase();
    
    // Collect all data
    let battery_history = db.db.get_battery_history(&mac, 168).map_err(|e| e.to_string())?; // 7 days
    let frame_log = db.db.get_frame_log(&mac, 200).map_err(|e| e.to_string())?;
    let device = db.db.get_known_device(&mac).map_err(|e| e.to_string())?;
    
    // Get system info
    let app_version = env!("CARGO_PKG_VERSION");
    let os_info = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);
    
    // Create ZIP in memory
    let mut zip_buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut zip_buffer));
        let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        
        // Main log
        zip.start_file("main.log", options).map_err(|e| e.to_string())?;
        let main_log = format!("SoundControl Diagnostics Export\nDevice: {}\nTimestamp: {}\nVersion: {}\nOS: {}\n\n",
            mac, chrono::Utc::now().to_rfc3339(), app_version, os_info);
        zip.write_all(main_log.as_bytes()).map_err(|e| e.to_string())?;
        
        // Battery history CSV
        zip.start_file("battery_history.csv", options).map_err(|e| e.to_string())?;
        let mut csv = String::from("timestamp,left_pct,right_pct,case_pct,charging\n");
        for record in &battery_history {
            csv.push_str(&format!("{},{},{},{},{}\n",
                record.timestamp.to_rfc3339(),
                record.left_pct.map_or("".to_string(), |v| v.to_string()),
                record.right_pct.map_or("".to_string(), |v| v.to_string()),
                record.case_pct.map_or("".to_string(), |v| v.to_string()),
                record.charging as i32
            ));
        }
        zip.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;
        
        // Frame log
        zip.start_file("frame_log.json", options).map_err(|e| e.to_string())?;
        let frames_json = serde_json::to_string_pretty(&frame_log).map_err(|e| e.to_string())?;
        zip.write_all(frames_json.as_bytes()).map_err(|e| e.to_string())?;
        
        // Device info
        zip.start_file("device_info.json", options).map_err(|e| e.to_string())?;
        let device_json = serde_json::to_string_pretty(&device).map_err(|e| e.to_string())?;
        zip.write_all(device_json.as_bytes()).map_err(|e| e.to_string())?;
        
        zip.finish().map_err(|e| e.to_string())?;
    }
    
    // Encode as base64
    let encoded = base64::encode(&zip_buffer);
    Ok(encoded)
}

#[tauri::command]
pub async fn check_firmware(
    db: State<'_, crate::AppState>,
    request: FirmwareCheckRequest,
) -> Result<FirmwareInfo, String> {
    let sku = request.sku.to_uppercase();
    
    // Check cache first
    if let Ok(Some(cached)) = db.db.get_firmware_cache(&sku) {
        // Return cached if less than 24h old
        let age = chrono::Utc::now() - cached.checked_at;
        if age < chrono::Duration::hours(24) {
            return Ok(cached);
        }
    }
    
    // Fetch from GitHub Releases
    let client = reqwest::Client::new();
    let url = format!("https://api.github.com/repos/Shankers8811/soundcontrol/releases/latest");
    
    match client.get(&url)
        .header("User-Agent", "SoundControl")
        .send()
        .await
    {
        Ok(response) => {
            if let Ok(release) = response.json::<serde_json::Value>().await {
                let firmware_info = FirmwareInfo {
                    sku: sku.clone(),
                    latest_version: None,
                    release_notes: release["body"].as_str().map(|s| s.to_string()),
                    checked_at: chrono::Utc::now(),
                };
                
                // Cache it
                let _ = db.db.upsert_firmware_cache(&firmware_info);
                
                Ok(firmware_info)
            } else {
                Err("Failed to parse release".to_string())
            }
        }
        Err(e) => Err(format!("Failed to check firmware: {}", e)),
    }
}