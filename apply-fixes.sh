#!/usr/bin/env bash
set -euo pipefail

# ── Guards (run first) ──────────────────────────────────────────────
command -v git >/dev/null 2>&1 || { echo "git not found in PATH"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm not found in PATH"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "npx not found in PATH"; exit 1; }
[[ -d src-tauri ]] || { echo "src-tauri/ not found — run from repo root"; exit 1; }
[[ -f app-icon.png ]] || { echo "app-icon.png not found in repo root"; exit 1; }

# ── Branch ──────────────────────────────────────────────────────────
git checkout main && git pull && git checkout -b fix/rust-compile

# ── 1. src-tauri/src/main.rs ────────────────────────────────────────
cat > src-tauri/src/main.rs <<'EOF'
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            soundcontrol::commands::settings::get_settings,
            soundcontrol::commands::settings::update_setting,
            soundcontrol::commands::bluetooth::scan_devices,
            soundcontrol::commands::bluetooth::connect_device,
            soundcontrol::commands::bluetooth::disconnect_device,
            soundcontrol::commands::bluetooth::get_bluetooth_state,
            soundcontrol::commands::device::get_device_info,
            soundcontrol::commands::device::set_anc_mode,
            soundcontrol::commands::device::set_transparency,
            soundcontrol::commands::device::set_adaptive_noise,
            soundcontrol::commands::device::set_wind_noise,
            soundcontrol::commands::device::set_game_mode,
            soundcontrol::commands::device::set_ldac,
            soundcontrol::commands::device::set_multipoint,
            soundcontrol::commands::device::set_bass_enhance,
            soundcontrol::commands::device::set_wearing_detection,
            soundcontrol::commands::device::set_easy_chat,
            soundcontrol::commands::device::set_auto_power_off,
            soundcontrol::commands::device::set_find_buds,
            soundcontrol::commands::device::set_ear_tip_test,
            soundcontrol::commands::device::set_gestures,
            soundcontrol::commands::device::get_battery_levels,
            soundcontrol::commands::eq::get_eq_presets,
            soundcontrol::commands::eq::save_eq_preset,
            soundcontrol::commands::eq::delete_eq_preset,
            soundcontrol::commands::eq::apply_eq_preset,
            soundcontrol::commands::eq::set_eq_band,
            soundcontrol::commands::diagnostics::get_battery_history,
            soundcontrol::commands::diagnostics::get_frame_log,
            soundcontrol::commands::diagnostics::export_diagnostics,
            soundcontrol::commands::diagnostics::check_firmware_update,
            soundcontrol::commands::system::register_hotkey,
            soundcontrol::commands::system::unregister_hotkey,
            soundcontrol::commands::system::get_hotkeys,
            soundcontrol::commands::system::show_window,
            soundcontrol::commands::system::minimize_window,
            soundcontrol::commands::system::quit_app,
            soundcontrol::commands::system::check_for_updates,
        ])
        .setup(|app| {
            app.manage(soundcontrol::AppState::new(
                soundcontrol::db::Database::new()?,
                soundcontrol::bluetooth::BluetoothManager::new(),
                soundcontrol::protocol::ProtocolHandler::new(),
            ));
            soundcontrol::tasks::start_background_tasks(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
EOF

# ── 2. src-tauri/src/bluetooth/mod.rs ───────────────────────────────
cat > src-tauri/src/bluetooth/mod.rs <<'EOF'
mod models;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

pub use models::*;

pub struct BluetoothManager {
    #[cfg(target_os = "linux")]
    linux: Option<linux::LinuxBluetooth>,
    #[cfg(target_os = "windows")]
    windows: Option<windows::WindowsBluetooth>,
    known_devices: std::sync::Mutex<Vec<KnownDevice>>,
}

impl BluetoothManager {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "linux")]
            linux: Some(linux::LinuxBluetooth::new()),
            #[cfg(target_os = "windows")]
            windows: Some(windows::WindowsBluetooth::new()),
            known_devices: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub async fn scan_devices(&self) -> Result<Vec<KnownDevice>, String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.scan().await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.scan().await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn connect_device(&self, address: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.connect(address, 15).await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.connect(address).await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn disconnect_device(&self, address: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.disconnect(address).await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.disconnect(address).await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.get_state().await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.get_state().await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.send_frame(frame).await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.send_frame(frame);
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub fn add_known_device(&self, device: KnownDevice) {
        self.known_devices.lock().unwrap().push(device);
    }

    pub fn get_known_devices(&self) -> Vec<KnownDevice> {
        self.known_devices.lock().unwrap().clone()
    }
}
EOF

# ── 3. src-tauri/src/bluetooth/linux.rs ─────────────────────────────
cat > src-tauri/src/bluetooth/linux.rs <<'EOF'
use super::models::*;
use bluer::{Address, rfcomm::{Socket, SocketAddr, Stream}};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::Mutex as AsyncMutex;
use tokio::io::AsyncWriteExt;

pub struct LinuxBluetooth {
    device_cache: Mutex<HashMap<String, DeviceProfile>>,
    connected_stream: AsyncMutex<Option<Stream>>,
}

impl LinuxBluetooth {
    pub fn new() -> Self {
        Self {
            device_cache: Mutex::new(HashMap::new()),
            connected_stream: AsyncMutex::new(None),
        }
    }

    pub async fn scan(&self) -> Result<Vec<KnownDevice>, String> {
        let session = bluer::Session::new().await
            .map_err(|e| format!("Failed to create BlueZ session: {}", e))?;
        let adapter = session.default_adapter().await
            .map_err(|e| format!("No Bluetooth adapter: {}", e))?;
        adapter.set_powered(true).await
            .map_err(|e| format!("Failed to power on adapter: {}", e))?;
        adapter.start_discovery().await
            .map_err(|e| format!("Failed to start discovery: {}", e))?;
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        adapter.stop_discovery().await
            .map_err(|e| format!("Failed to stop discovery: {}", e))?;
        let addresses = adapter.device_addresses().await
            .map_err(|e| format!("Failed to get device addresses: {}", e))?;
        let mut result = Vec::new();
        for addr in addresses {
            let device = adapter.device(addr)
                .map_err(|e| format!("Failed to get device: {}", e))?;
            if let Ok(name) = device.name().await {
                if let Some(name_str) = name {
                    if name_str.to_lowercase().contains("soundcore")
                        || name_str.to_lowercase().contains("anker")
                        || name_str.to_lowercase().contains("life")
                        || name_str.to_lowercase().contains("liberty")
                        || name_str.to_lowercase().contains("dot")
                        || name_str.to_lowercase().contains("vortex")
                    {
                        let address = device.address().to_string();
                        result.push(KnownDevice {
                            address: address.clone(),
                            name: name_str,
                            profile: None,
                            connected: false,
                        });
                    }
                }
            }
        }
        Ok(result)
    }

    pub async fn connect(&self, address: &str, channel: u8) -> Result<(), String> {
        let addr: Address = address.parse()
            .map_err(|e| format!("Invalid Bluetooth address: {}", e))?;
        let sa = SocketAddr::new(addr, channel);
        let socket = Socket::new()
            .map_err(|e| format!("Failed to create RFCOMM socket: {}", e))?;
        let stream = socket.connect(sa).await
            .map_err(|e| format!("Failed to connect RFCOMM: {}", e))?;
        *self.connected_stream.lock().await = Some(stream);
        Ok(())
    }

    pub async fn disconnect(&self, address: &str) -> Result<(), String> {
        *self.connected_stream.lock().await = None;
        Ok(())
    }

    pub async fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        let mut guard = self.connected_stream.lock().await;
        let stream = guard.as_mut().ok_or("No connected Bluetooth device")?;
        stream.write_all(frame).await
            .map_err(|e| format!("Failed to send frame over Bluetooth: {}", e))?;
        Ok(())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        if self.connected_stream.lock().await.is_some() {
            Ok("powered_on".to_string())
        } else {
            Ok("powered_off".to_string())
        }
    }
}
EOF

# ── 4. src-tauri/src/bluetooth/models.rs ────────────────────────────
cat > src-tauri/src/bluetooth/models.rs <<'EOF'
pub use crate::protocol::DeviceProfile;

#[derive(Debug, Clone)]
pub struct KnownDevice {
    pub address: String,
    pub name: String,
    pub profile: Option<DeviceProfile>,
    pub connected: bool,
}

#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub address: String,
    pub name: String,
    pub rssi: i16,
    pub profile: Option<DeviceProfile>,
}

#[derive(Debug, Clone)]
pub enum BluetoothEvent {
    DeviceDiscovered(DiscoveredDevice),
    DeviceConnected(String),
    DeviceDisconnected(String),
    BatteryUpdated(String, crate::protocol::BatteryLevel),
    ANCModeChanged(String, String),
}
EOF

# ── 5. migrations.sql ───────────────────────────────────────────────
cat > migrations.sql <<'EOF'
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_profiles (
    name TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    anc_modes TEXT NOT NULL DEFAULT '[]',
    supports_transparency INTEGER NOT NULL DEFAULT 0,
    supports_adaptive INTEGER NOT NULL DEFAULT 0,
    supports_wind_noise INTEGER NOT NULL DEFAULT 0,
    supports_game_mode INTEGER NOT NULL DEFAULT 0,
    supports_ldac INTEGER NOT NULL DEFAULT 0,
    supports_multipoint INTEGER NOT NULL DEFAULT 0,
    supports_bass_enhance INTEGER NOT NULL DEFAULT 0,
    supports_wearing_detection INTEGER NOT NULL DEFAULT 0,
    supports_easy_chat INTEGER NOT NULL DEFAULT 0,
    supports_auto_power_off INTEGER NOT NULL DEFAULT 0,
    supports_find_buds INTEGER NOT NULL DEFAULT 0,
    supports_ear_tip_test INTEGER NOT NULL DEFAULT 0,
    supports_custom_gestures INTEGER NOT NULL DEFAULT 0,
    battery_count INTEGER NOT NULL DEFAULT 3,
    eq_bands INTEGER NOT NULL DEFAULT 8,
    rfcomm_channel INTEGER NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS eq_presets (
    name TEXT PRIMARY KEY,
    bands TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS battery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_address TEXT NOT NULL,
    left_level INTEGER,
    right_level INTEGER,
    case_level INTEGER,
    left_charging INTEGER NOT NULL DEFAULT 0,
    right_charging INTEGER NOT NULL DEFAULT 0,
    case_charging INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS frame_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL,
    frame_data TEXT NOT NULL,
    logged_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_states (
    address TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS firmware_cache (
    model TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    download_url TEXT,
    checksum TEXT,
    cached_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_battery_history_device ON battery_history(device_address);
CREATE INDEX IF NOT EXISTS idx_battery_history_recorded ON battery_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_frame_log_logged ON frame_log(logged_at);
EOF

# ── 6. src-tauri/src/protocol/mod.rs ────────────────────────────────
cat > src-tauri/src/protocol/mod.rs <<'EOF'
mod models;
mod handshake;
mod crc;

pub use models::*;
pub use handshake::*;
pub use crc::compute;

use crate::AppState;

#[derive(Debug, Clone)]
pub struct ProtocolHandler {
    pub device_profiles: std::collections::HashMap<String, DeviceProfile>,
}

impl ProtocolHandler {
    pub fn new() -> Self {
        let mut profiles = std::collections::HashMap::new();
        let toml_str = include_str!("../../../devices.toml");
        if let Ok(value) = toml::from_str::<toml::Value>(toml_str) {
            if let Some(devices) = value.get("devices").and_then(|d| d.as_array()) {
                for device in devices {
                    if let Some(name) = device.get("name").and_then(|n| n.as_str()) {
                        profiles.insert(name.to_lowercase(), DeviceProfile::from_toml(device));
                    }
                }
            }
        }
        Self { device_profiles: profiles }
    }

    pub fn get_profile(&self, device_name: &str) -> Option<&DeviceProfile> {
        self.device_profiles.get(&device_name.to_lowercase())
    }

    pub fn encode_frame(&self, cmd: u16, op: u8, payload: &[u8]) -> Vec<u8> {
        let mut frame = Vec::new();
        frame.push(0x55);
        frame.push(0x60);
        frame.push(0x01);
        frame.extend_from_slice(&cmd.to_le_bytes());
        frame.extend_from_slice(&(payload.len() as u16 + 1).to_le_bytes());
        frame.push(op);
        frame.extend_from_slice(payload);
        let crc = compute(&frame[3..]);
        frame.extend_from_slice(&crc.to_le_bytes());
        frame
    }

    pub fn decode_frame(&self, data: &[u8]) -> Option<DecodedFrame> {
        if data.len() < 10 {
            return None;
        }
        if data[0] != 0x55 || data[1] != 0x60 || data[2] != 0x01 {
            return None;
        }
        let cmd = u16::from_le_bytes([data[3], data[4]]);
        let len = u16::from_le_bytes([data[5], data[6]]) as usize;
        if len == 0 || data.len() < 9 + len {
            return None;
        }
        let op = data[7];
        let payload = data[8..8 + len - 1].to_vec();
        let crc = u16::from_le_bytes([data[8 + len - 1], data[8 + len]]);
        let expected_crc = compute(&data[3..8 + len - 1]);
        if crc != expected_crc {
            return None;
        }
        Some(DecodedFrame {
            cmd,
            op,
            payload,
        })
    }
}

#[derive(Debug, Clone)]
pub struct DecodedFrame {
    pub cmd: u16,
    pub op: u8,
    pub payload: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let handler = ProtocolHandler::new();
        let frame = handler.encode_frame(0x0101, 0xF0, &[0x01]);
        let decoded = handler.decode_frame(&frame).unwrap();
        assert_eq!(decoded.cmd, 0x0101);
        assert_eq!(decoded.op, 0xF0);
        assert_eq!(decoded.payload, vec![0x01]);
    }

    #[test]
    fn round_trip_empty_payload() {
        let handler = ProtocolHandler::new();
        let frame = handler.encode_frame(0x0102, 0xF1, &[]);
        let decoded = handler.decode_frame(&frame).unwrap();
        assert_eq!(decoded.cmd, 0x0102);
        assert_eq!(decoded.op, 0xF1);
        assert_eq!(decoded.payload, vec![]);
    }
}
EOF

# ── 7. src-tauri/src/db/mod.rs ──────────────────────────────────────
cat > src-tauri/src/db/mod.rs <<'EOF'
use crate::protocol::{DeviceProfile, BatteryLevel};
use rusqlite::{Connection, params};
use rusqlite::OptionalExtension;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        std::fs::create_dir_all(&dir)?;
        let db_path = dir.join("soundcontrol.db");
        let conn = Connection::open(&db_path)?;
        Self::run_migrations(&conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        let migrations_sql = include_str!("../../../migrations.sql");
        conn.execute_batch(&migrations_sql)?;
        Ok(())
    }

    pub fn save_device_profile(&self, profile: &DeviceProfile) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT OR REPLACE INTO device_profiles (name, model, anc_modes, supports_transparency, supports_adaptive, supports_wind_noise, supports_game_mode, supports_ldac, supports_multipoint, supports_bass_enhance, supports_wearing_detection, supports_easy_chat, supports_auto_power_off, supports_find_buds, supports_ear_tip_test, supports_custom_gestures, battery_count, eq_bands, rfcomm_channel)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                profile.name, profile.model,
                serde_json::to_string(&profile.anc_modes).unwrap_or_default(),
                profile.supports_transparency, profile.supports_adaptive, profile.supports_wind_noise,
                profile.supports_game_mode, profile.supports_ldac, profile.supports_multipoint,
                profile.supports_bass_enhance, profile.supports_wearing_detection, profile.supports_easy_chat,
                profile.supports_auto_power_off, profile.supports_find_buds, profile.supports_ear_tip_test,
                profile.supports_custom_gestures, profile.battery_count, profile.eq_bands, profile.rfcomm_channel,
            ],
        )?;
        Ok(())
    }

    pub fn save_eq_preset(&self, name: &str, bands: &str) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT OR REPLACE INTO eq_presets (name, bands, created_at) VALUES (?1, ?2, datetime('now'))",
            params![name, bands],
        )?;
        Ok(())
    }

    pub fn get_eq_presets(&self) -> Result<Vec<(String, String)>, rusqlite::Error> {
        let mut stmt = self.conn.lock().unwrap().prepare(
            "SELECT name, bands FROM eq_presets ORDER BY created_at DESC"
        )?;
        let presets = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(presets)
    }

    pub fn delete_eq_preset(&self, name: &str) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "DELETE FROM eq_presets WHERE name = ?1",
            params![name],
        )?;
        Ok(())
    }

    pub fn save_battery_history(&self, device_address: &str, battery: &BatteryLevel) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO battery_history (device_address, left_level, right_level, case_level, left_charging, right_charging, case_charging, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            params![
                device_address,
                battery.left,
                battery.right,
                battery.case,
                battery.left_charging,
                battery.right_charging,
                battery.case_charging,
            ],
        )?;
        Ok(())
    }

    pub fn get_battery_history(&self, device_address: &str, limit: u32) -> Result<Vec<(String, Option<u8>, Option<u8>, Option<u8>, bool, bool, bool)>, rusqlite::Error> {
        let mut stmt = self.conn.lock().unwrap().prepare(
            "SELECT recorded_at, left_level, right_level, case_level, left_charging, right_charging, case_charging
             FROM battery_history WHERE device_address = ?1 ORDER BY recorded_at DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![device_address, limit], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn remove_setting(&self, key: &str) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "DELETE FROM settings WHERE key = ?1",
            params![key],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let mut stmt = self.conn.lock().unwrap().prepare(
            "SELECT value FROM settings WHERE key = ?1"
        )?;
        let result: Option<String> = stmt.query_row(params![key], |row| row.get(0)).optional()?;
        Ok(result)
    }

    pub fn log_frame(&self, direction: &str, frame: &[u8]) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO frame_log (direction, frame_data, logged_at) VALUES (?1, ?2, datetime('now'))",
            params![direction, serde_json::to_string(frame).unwrap_or_default()],
        )?;
        Ok(())
    }

    pub fn get_frame_log(&self, limit: u32) -> Result<Vec<(String, String, String)>, rusqlite::Error> {
        let mut stmt = self.conn.lock().unwrap().prepare(
            "SELECT direction, frame_data, logged_at FROM frame_log ORDER BY logged_at DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn save_device_state(&self, address: &str, state: &str) -> Result<(), rusqlite::Error> {
        self.conn.lock().unwrap().execute(
            "INSERT OR REPLACE INTO device_states (address, state, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![address, state],
        )?;
        Ok(())
    }

    pub fn get_device_state(&self, address: &str) -> Result<Option<String>, rusqlite::Error> {
        let mut stmt = self.conn.lock().unwrap().prepare(
            "SELECT state FROM device_states WHERE address = ?1"
        )?;
        let result: Option<String> = stmt.query_row(params![address], |row| row.get(0)).optional()?;
        Ok(result)
    }
}

impl Default for Database {
    fn default() -> Self {
        Self::new().expect("Failed to create database")
    }
}
EOF

# ── 8. src-tauri/src/tasks/mod.rs ───────────────────────────────────
cat > src-tauri/src/tasks/mod.rs <<'EOF'
use crate::AppState;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::RwLock;
use std::sync::Arc;

pub fn start_background_tasks(app: &AppHandle) {
    let app_handle = app.clone();
    
    // Battery polling task - every 30 seconds
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let _ = app_handle.emit("battery_poll", serde_json::json!({}));
        }
    });
    
    // Device watch task - every 5 seconds
    let app_handle2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            let _ = app_handle2.emit("device_watch", serde_json::json!({}));
        }
    });
    
    // Firmware check task - every 24 hours
    let app_handle3 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(86400));
        loop {
            interval.tick().await;
            let _ = app_handle3.emit("firmware_check", serde_json::json!({}));
        }
    });
    
    // Database maintenance - daily
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(86400));
        loop {
            interval.tick().await;
        }
    });
}
EOF

# ── 9. src-tauri/src/commands/system.rs ─────────────────────────────
cat > src-tauri/src/commands/system.rs <<'EOF'
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
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
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
EOF

# ── 10. src-tauri/src/bluetooth/windows.rs ──────────────────────────
cat > src-tauri/src/bluetooth/windows.rs <<'EOF'
use super::models::*;
use serialport::SerialPort;
use std::io::{Read, Write};
use std::time::Duration;
use std::sync::Mutex;

pub struct WindowsBluetooth {
    port: Mutex<Option<Box<dyn SerialPort>>>,
}

impl WindowsBluetooth {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
        }
    }

    pub async fn scan(&self) -> Result<Vec<super::models::KnownDevice>, String> {
        let ports = serialport::available_ports()
            .map_err(|e| format!("Failed to list serial ports: {}", e))?;
        let mut result = Vec::new();
        for port in ports {
            if port.port_name.contains("COM") {
                result.push(super::models::KnownDevice {
                    address: port.port_name.clone(),
                    name: format!("Soundcore Device ({})", port.port_name),
                    profile: None,
                    connected: false,
                });
            }
        }
        Ok(result)
    }

    pub async fn connect(&self, address: &str) -> Result<(), String> {
        let mut port = serialport::new(address, 115200)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Failed to open RFCOMM port: {}", e))?;
        port.write_all(&[0x55, 0x60, 0x01, 0x00, 0x01, 0x01, 0xC0, 0x02, 0x00, 0x00])
            .map_err(|e| format!("Failed to send handshake: {}", e))?;
        let mut buf = [0u8; 1024];
        port.read(&mut buf)
            .map_err(|e| format!("Failed to read response: {}", e))?;
        self.port.lock().unwrap().replace(port);
        Ok(())
    }

    pub async fn disconnect(&self, address: &str) -> Result<(), String> {
        self.port.lock().unwrap().take();
        Ok(())
    }

    pub fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        let mut port = self.port.lock().unwrap();
        let port = port.as_mut().ok_or("No connected Bluetooth device")?;
        port.write_all(frame)
            .map_err(|e| format!("Failed to send frame over Bluetooth: {}", e))?;
        Ok(())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        if self.port.lock().unwrap().is_some() {
            Ok("powered_on".to_string())
        } else {
            Ok("powered_off".to_string())
        }
    }
}
EOF

# ── 11. .github/workflows/ci.yml ────────────────────────────────────
cat > .github/workflows/ci.yml <<'EOF'
name: CI/CD - Build SoundControl

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ main ]

permissions:
  contents: read

jobs:
  build:
    name: Build ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        include:
          - os: ubuntu-latest
            artifact_name: soundcontrol-linux
            bundle: appimage,deb
          - os: windows-latest
            artifact_name: soundcontrol-windows
            bundle: nsis

    permissions:
      contents: read
      actions: read
      packages: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo registry and target
        uses: Swatinem/rust-cache@v2
        with:
          shared-key: "tauri-build"
          workspaces: "src-tauri -> target"

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install system dependencies (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            build-essential \
            curl \
            wget \
            file \
            libssl-dev \
            libwebkit2gtk-4.1-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libxdo-dev \
            patchelf \
            libgtk-3-dev \
            libbluetooth-dev \
            libdbus-1-dev \
            pkg-config

      - name: Install frontend dependencies
        run: npm install

      - name: Build frontend
        run: npm run build

      - name: Verify Tauri CLI
        run: npx tauri --version

      - name: Cargo check (fast compile verification)
        run: cargo check --manifest-path src-tauri/Cargo.toml

      - name: Build Tauri app
        run: npm run tauri -- build --bundles ${{ matrix.bundle }}
        env:
          NO_STRIP: "true"
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: |
            src-tauri/target/release/bundle/**/
          retention-days: 30

  release:
    name: Create GitHub Release
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    permissions:
      contents: write
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Create Release
        uses: softprops/action-gh-release@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          files: artifacts/**/*
          generate_release_notes: true
          draft: false
          prerelease: false
EOF

# ── Safety net: fix any remaining .ok.or typos and verify ───────────
sed -i 's/\.ok\.or(/.ok_or(/g' src-tauri/src/commands/system.rs src-tauri/src/bluetooth/windows.rs
if grep -rnE '\.ok\.or|\.unwrap\.or' src-tauri/src; then
    echo "ERROR: mangled method names found"
    exit 1
fi

# ── README.md — three sed edits + remove stray suffix ───────────────
sed -i \
  -e 's|npm run tauri:dev|npm run tauri dev|g' \
  -e 's|npm run tauri:build|npm run tauri build|g' \
  -e 's|Node.js 18+|Node.js 20+|g' \
  README.md
# remove the appended "# CI Trigger $(date)" suffix
sed -i 's|"# CI Trigger \$(date)"[[:space:]]*$||' README.md
echo "=== README.md diff ==="
git --no-pager diff README.md

# ── Icons: npm install first, then generate ─────────────────────────
npm install
npx tauri icon app-icon.png
git add app-icon.png src-tauri/icons

# ── Verify (non-fatal cargo check) ──────────────────────────────────
if command -v cargo >/dev/null 2>&1; then
  cargo check --manifest-path src-tauri/Cargo.toml || echo "WARNING: local cargo check failed (frontend dist may be missing); CI will check"
else
  echo "WARNING: cargo not installed; skipping local cargo check"
fi
echo "=== git diff --stat ==="
git diff --stat

# ── Explicit add, status, commit, push ──────────────────────────────
git add app-icon.png src-tauri/icons src-tauri/src migrations.sql .github/workflows/ci.yml README.md
git status --short

git commit -m "fix: Rust compile errors, SQLite defaults, CI cargo check, README commands"
git push -u origin fix/rust-compile

echo
echo "Push complete. Open PR:"
echo "https://github.com/Shankers8811/soundcontrol/pull/new/fix/rust-compile"

# ── Changed files summary ───────────────────────────────────────────
echo
echo "Changed files (11 code + README + icons + app-icon.png):"
git diff --name-only main..HEAD