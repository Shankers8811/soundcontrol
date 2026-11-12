//! Bluetooth commands

use crate::db::Database;
use crate::bluetooth::{BluetoothManager, BluetoothDevice};
use crate::bluetooth::models::{DeviceState, BatteryTelemetry, CommandResponse};
use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct ConnectRequest {
    pub mac: String,
}

#[derive(Debug, Deserialize)]
pub struct DisconnectRequest {
    pub mac: String,
}

#[derive(Debug, Deserialize)]
pub struct DeviceStateRequest {
    pub mac: String,
}

#[tauri::command]
pub async fn scan_devices(
    bluetooth: State<'_, Arc<BluetoothManager>>,
) -> Result<Vec<BluetoothDevice>, String> {
    bluetooth.scan_devices().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connect_device(
    bluetooth: State<'_, Arc<BluetoothManager>>,
    db: State<'_, crate::AppState>,
    request: ConnectRequest,
) -> Result<DeviceState, String> {
    let mac = request.mac.to_uppercase();
    
    // Connect via Bluetooth manager
    let session = bluetooth.connect(&mac).await.map_err(|e| e.to_string())?;
    
    // Build device state
    let known_device = db.db.get_known_device(&mac).map_err(|e| e.to_string())?;
    let profile = if let Some(sku) = &session.sku {
        db.db.get_device_profile(sku).map_err(|e| e.to_string())?
    } else {
        known_device.and_then(|d| d.sku).and_then(|sku| {
            db.db.get_device_profile(&sku).ok().flatten()
        })
    };
    
    // Query initial battery
    let battery = if let Ok(frame) = bluetooth.send_frame(&mac, &crate::bluetooth::protocol::build_battery_query()).await {
        // In real implementation, we'd wait for response
        // For now, return mock data
        None
    } else {
        None
    };
    
    let state = DeviceState {
        mac: mac.clone(),
        sku: session.sku.clone(),
        name: known_device.and_then(|d| d.name),
        profile: profile.clone(),
        connected: true,
        battery,
        anc_mode: None,
        transparency_mode: None,
        eq_preset: None,
        custom_eq: None,
        game_mode: false,
        ldac_enabled: false,
        dual_connection: false,
        spatial_mode: None,
        firmware_version: session.profile.as_ref().and_then(|p| p.firmware_byte_offset.map(|_| "unknown".to_string())),
    };
    
    Ok(state)
}

#[tauri::command]
pub async fn disconnect_device(
    bluetooth: State<'_, Arc<BluetoothManager>>,
    request: DisconnectRequest,
) -> Result<CommandResponse, String> {
    let mac = request.mac.to_uppercase();
    bluetooth.disconnect(&mac).await.map_err(|e| e.to_string())?;
    Ok(CommandResponse::ok())
}

#[tauri::command]
pub async fn get_device_state(
    bluetooth: State<'_, Arc<BluetoothManager>>,
    db: State<'_, crate::AppState>,
    request: DeviceStateRequest,
) -> Result<DeviceState, String> {
    let mac = request.mac.to_uppercase();
    
    let session = bluetooth.get_session(&mac).await
        .ok_or_else(|| "Device not connected".to_string())?;
    
    let known_device = db.db.get_known_device(&mac).map_err(|e| e.to_string())?;
    let profile = if let Some(sku) = &session.sku {
        db.db.get_device_profile(sku).map_err(|e| e.to_string())?
    } else {
        None
    };
    
    // Query battery
    let battery = None; // Would query in real implementation
    
    let state = DeviceState {
        mac: mac.clone(),
        sku: session.sku.clone(),
        name: known_device.and_then(|d| d.name),
        profile: profile.clone(),
        connected: true,
        battery,
        anc_mode: None,
        transparency_mode: None,
        eq_preset: None,
        custom_eq: None,
        game_mode: false,
        ldac_enabled: false,
        dual_connection: false,
        spatial_mode: None,
        firmware_version: None,
    };
    
    Ok(state)
}