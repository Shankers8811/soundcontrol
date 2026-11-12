//! Database module - SQLite operations

use std::path::PathBuf;
use std::sync::Arc;
use rusqlite::{Connection, params, OptionalExtension, Row};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use tracing::{info, error, debug};
use anyhow::{Result, Context};

use crate::bluetooth::models::{DeviceProfile, KnownDevice, EqPreset, BatteryRecord, FrameLogEntry, FirmwareInfo, Settings};

/// Database connection wrapper
pub struct Database {
    conn: Arc<tokio::sync::Mutex<Connection>>,
}

impl Database {
    /// Create new database connection and run migrations
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let app_dir = tauri::api::path::app_data_dir(&app_handle.config())
            .context("Failed to get app data directory")?;
        
        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("soundcontrol.db");
        
        info!("Database path: {}", db_path.display());
        
        let conn = Connection::open(&db_path)
            .context("Failed to open database")?;
        
        // Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode = WAL", [])?;
        conn.execute("PRAGMA synchronous = NORMAL", [])?;
        conn.execute("PRAGMA busy_timeout = 5000", [])?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        
        let db = Self { conn: Arc::new(tokio::sync::Mutex::new(conn)) };
        db.run_migrations()?;
        
        Ok(db)
    }
    
    /// Run database migrations
    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.blocking_lock();
        
        // Create tables
        conn.execute_batch(include_str!("migrations.sql"))?;
        
        info!("Database migrations completed");
        Ok(())
    }
    
    // ===== Settings =====
    
    pub fn get_settings(&self) -> Result<Settings> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM settings WHERE id = 1")?;
        let settings = stmt.query_row([], |row| Settings::from_row(row))
            .optional()?
            .unwrap_or_default();
        Ok(settings)
    }
    
    pub fn update_settings(&self, settings: &Settings) -> Result<Settings> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO settings (id, theme, language, auto_check_updates, start_minimized, show_tray, log_level, bluetooth_adapter, updated_at)
            VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                theme = ?1, language = ?2, auto_check_updates = ?3,
                start_minimized = ?4, show_tray = ?5, log_level = ?6,
                bluetooth_adapter = ?7, updated_at = datetime('now')
            "#,
            params![
                settings.theme,
                settings.language,
                settings.auto_check_updates as i32,
                settings.start_minimized as i32,
                settings.show_tray as i32,
                settings.log_level,
                settings.bluetooth_adapter,
            ],
        )?;
        
        self.get_settings()
    }
    
    // ===== Device Profiles =====
    
    pub fn load_device_profiles(&self) -> Result<Vec<DeviceProfile>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM device_profiles ORDER BY sku")?;
        let profiles = stmt.query_map([], |row| DeviceProfile::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(profiles)
    }
    
    pub fn get_device_profile(&self, sku: &str) -> Result<Option<DeviceProfile>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM device_profiles WHERE sku = ?1")?;
        let profile = stmt.query_row([sku], |row| DeviceProfile::from_row(row))
            .optional()?;
        Ok(profile)
    }
    
    pub fn upsert_device_profile(&self, profile: &DeviceProfile) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO device_profiles (sku, marketing_names, category, anc_levels, transparency_modes, eq_type,
                has_game_mode, has_ldac, has_dual_connection, has_spatial_audio, has_wind_noise,
                has_touch_remap, has_safe_volume, has_hearid, firmware_byte_offset, status, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'))
            ON CONFLICT(sku) DO UPDATE SET
                marketing_names = ?2, category = ?3, anc_levels = ?4, transparency_modes = ?5,
                eq_type = ?6, has_game_mode = ?7, has_ldac = ?8, has_dual_connection = ?9,
                has_spatial_audio = ?10, has_wind_noise = ?11, has_touch_remap = ?12,
                has_safe_volume = ?13, has_hearid = ?14, firmware_byte_offset = ?15,
                status = ?16, updated_at = datetime('now')
            "#,
            params![
                profile.sku,
                serde_json::to_string(&profile.marketing_names)?,
                profile.category,
                profile.anc_levels,
                serde_json::to_string(&profile.transparency_modes)?,
                profile.eq_type,
                profile.has_game_mode as i32,
                profile.has_ldac as i32,
                profile.has_dual_connection as i32,
                profile.has_spatial_audio as i32,
                profile.has_wind_noise as i32,
                profile.has_touch_remap as i32,
                profile.has_safe_volume as i32,
                profile.has_hearid as i32,
                profile.firmware_byte_offset,
                profile.status,
            ],
        )?;
        Ok(())
    }
    
    // ===== Known Devices =====
    
    pub fn get_known_devices(&self) -> Result<Vec<KnownDevice>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM known_devices ORDER BY last_connected DESC")?;
        let devices = stmt.query_map([], |row| KnownDevice::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(devices)
    }
    
    pub fn get_known_device(&self, mac: &str) -> Result<Option<KnownDevice>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM known_devices WHERE mac = ?1")?;
        let device = stmt.query_row([mac.to_uppercase()], |row| KnownDevice::from_row(row))
            .optional()?;
        Ok(device)
    }
    
    pub fn upsert_known_device(&self, device: &KnownDevice) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO known_devices (mac, sku, name, last_connected, last_firmware, settings_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
            ON CONFLICT(mac) DO UPDATE SET
                sku = ?2, name = ?3, last_connected = ?4, last_firmware = ?5,
                settings_json = ?6, updated_at = datetime('now')
            "#,
            params![
                device.mac.to_uppercase(),
                device.sku,
                device.name,
                device.last_connected.map(|dt| dt.to_rfc3339()),
                device.last_firmware,
                device.settings_json,
            ],
        )?;
        Ok(())
    }
    
    pub fn update_device_last_connected(&self, mac: &str) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            "UPDATE known_devices SET last_connected = datetime('now'), updated_at = datetime('now') WHERE mac = ?1",
            [mac.to_uppercase()],
        )?;
        Ok(())
    }
    
    // ===== EQ Presets =====
    
    pub fn list_eq_presets(&self, sku: &str) -> Result<Vec<EqPreset>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM eq_presets WHERE sku = ?1 ORDER BY is_factory DESC, name")?;
        let presets = stmt.query_map([sku], |row| EqPreset::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(presets)
    }
    
    pub fn save_eq_preset(&self, preset: &EqPreset) -> Result<EqPreset> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO eq_presets (sku, name, bands_json, is_factory, updated_at)
            VALUES (?1, ?2, ?3, ?4, datetime('now'))
            ON CONFLICT(sku, name) DO UPDATE SET
                bands_json = ?3, is_factory = ?4, updated_at = datetime('now')
            "#,
            params![
                preset.sku,
                preset.name,
                serde_json::to_string(&preset.bands)?,
                preset.is_factory as i32,
            ],
        )?;
        
        // Return the saved preset with ID
        let mut stmt = conn.prepare("SELECT * FROM eq_presets WHERE sku = ?1 AND name = ?2")?;
        let saved = stmt.query_row([preset.sku, &preset.name], |row| EqPreset::from_row(row))?;
        Ok(saved)
    }
    
    pub fn delete_eq_preset(&self, id: i64) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute("DELETE FROM eq_presets WHERE id = ?1", [id])?;
        Ok(())
    }
    
    // ===== Battery History =====
    
    pub fn add_battery_record(&self, record: &BatteryRecord) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO battery_history (mac, timestamp, left_pct, right_pct, case_pct, charging)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                record.mac.to_uppercase(),
                record.timestamp.to_rfc3339(),
                record.left_pct,
                record.right_pct,
                record.case_pct,
                record.charging as i32,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_battery_history(&self, mac: &str, hours: i64) -> Result<Vec<BatteryRecord>> {
        let conn = self.conn.blocking_lock();
        let since = Utc::now() - chrono::Duration::hours(hours);
        let mut stmt = conn.prepare(
            "SELECT * FROM battery_history WHERE mac = ?1 AND timestamp >= ?2 ORDER BY timestamp DESC"
        )?;
        let records = stmt.query_map([mac.to_uppercase(), since.to_rfc3339()], |row| BatteryRecord::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records)
    }
    
    // ===== Frame Log =====
    
    pub fn add_frame_log(&self, entry: &FrameLogEntry) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO frame_log (mac, direction, frame_hex, parsed_json, timestamp)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                entry.mac.to_uppercase(),
                entry.direction,
                entry.frame_hex,
                entry.parsed_json,
                entry.timestamp.to_rfc3339(),
            ],
        )?;
        Ok(())
    }
    
    pub fn get_frame_log(&self, mac: &str, limit: usize) -> Result<Vec<FrameLogEntry>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare(
            "SELECT * FROM frame_log WHERE mac = ?1 ORDER BY timestamp DESC LIMIT ?2"
        )?;
        let entries = stmt.query_map([mac.to_uppercase(), limit as i64], |row| FrameLogEntry::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(entries)
    }
    
    // ===== Firmware Cache =====
    
    pub fn get_firmware_cache(&self, sku: &str) -> Result<Option<FirmwareInfo>> {
        let conn = self.conn.blocking_lock();
        let mut stmt = conn.prepare("SELECT * FROM firmware_cache WHERE sku = ?1")?;
        let info = stmt.query_row([sku], |row| FirmwareInfo::from_row(row))
            .optional()?;
        Ok(info)
    }
    
    pub fn upsert_firmware_cache(&self, info: &FirmwareInfo) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute(
            r#"
            INSERT INTO firmware_cache (sku, latest_version, release_notes, checked_at)
            VALUES (?1, ?2, ?3, datetime('now'))
            ON CONFLICT(sku) DO UPDATE SET
                latest_version = ?2, release_notes = ?3, checked_at = datetime('now')
            "#,
            params![info.sku, info.latest_version, info.release_notes],
        )?;
        Ok(())
    }
    
    // ===== Maintenance =====
    
    pub fn vacuum(&self) -> Result<()> {
        let conn = self.conn.blocking_lock();
        conn.execute("VACUUM", [])?;
        Ok(())
    }
    
    pub fn trim_old_data(&self) -> Result<()> {
        let conn = self.conn.blocking_lock();
        let thirty_days_ago = (Utc::now() - chrono::Duration::days(30)).to_rfc3339();
        
        // Trim battery history older than 30 days
        conn.execute(
            "DELETE FROM battery_history WHERE timestamp < ?1",
            [thirty_days_ago.clone()],
        )?;
        
        // Trim frame log to last 1000 entries per device
        conn.execute(
            r#"
            DELETE FROM frame_log WHERE id NOT IN (
                SELECT id FROM frame_log ORDER BY timestamp DESC LIMIT 1000
            )
            "#,
            [],
        )?;
        
        Ok(())
    }
}

impl Settings {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            theme: row.get("theme")?,
            language: row.get("language")?,
            auto_check_updates: row.get::<_, i32>("auto_check_updates")? != 0,
            start_minimized: row.get::<_, i32>("start_minimized")? != 0,
            show_tray: row.get::<_, i32>("show_tray")? != 0,
            log_level: row.get("log_level")?,
            bluetooth_adapter: row.get("bluetooth_adapter")?,
        })
    }
}

impl DeviceProfile {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let marketing_names: String = row.get("marketing_names")?;
        let transparency_modes: String = row.get("transparency_modes")?;
        
        Ok(Self {
            sku: row.get("sku")?,
            marketing_names: serde_json::from_str(&marketing_names).unwrap_or_default(),
            category: row.get("category")?,
            anc_levels: row.get("anc_levels")?,
            transparency_modes: serde_json::from_str(&transparency_modes).unwrap_or_default(),
            eq_type: row.get("eq_type")?,
            has_game_mode: row.get::<_, i32>("has_game_mode")? != 0,
            has_ldac: row.get::<_, i32>("has_ldac")? != 0,
            has_dual_connection: row.get::<_, i32>("has_dual_connection")? != 0,
            has_spatial_audio: row.get::<_, i32>("has_spatial_audio")? != 0,
            has_wind_noise: row.get::<_, i32>("has_wind_noise")? != 0,
            has_touch_remap: row.get::<_, i32>("has_touch_remap")? != 0,
            has_safe_volume: row.get::<_, i32>("has_safe_volume")? != 0,
            has_hearid: row.get::<_, i32>("has_hearid")? != 0,
            firmware_byte_offset: row.get("firmware_byte_offset")?,
            status: row.get("status")?,
        })
    }
}

impl KnownDevice {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let last_connected: Option<String> = row.get("last_connected")?;
        
        Ok(Self {
            mac: row.get("mac")?,
            sku: row.get("sku")?,
            name: row.get("name")?,
            last_connected: last_connected.and_then(|s| DateTime::parse_from_rfc3339(&s).ok()).map(|dt| dt.with_timezone(&Utc)),
            last_firmware: row.get("last_firmware")?,
            settings_json: row.get("settings_json")?,
        })
    }
}

impl EqPreset {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let bands_json: String = row.get("bands_json")?;
        
        Ok(Self {
            id: row.get("id")?,
            sku: row.get("sku")?,
            name: row.get("name")?,
            bands: serde_json::from_str(&bands_json).unwrap_or_default(),
            is_factory: row.get::<_, i32>("is_factory")? != 0,
        })
    }
}

impl BatteryRecord {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let timestamp: String = row.get("timestamp")?;
        
        Ok(Self {
            mac: row.get("mac")?,
            timestamp: DateTime::parse_from_rfc3339(&timestamp).unwrap().with_timezone(&Utc),
            left_pct: row.get("left_pct")?,
            right_pct: row.get("right_pct")?,
            case_pct: row.get("case_pct")?,
            charging: row.get::<_, i32>("charging")? != 0,
        })
    }
}

impl FrameLogEntry {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let timestamp: String = row.get("timestamp")?;
        
        Ok(Self {
            id: row.get("id")?,
            mac: row.get("mac")?,
            direction: row.get("direction")?,
            frame_hex: row.get("frame_hex")?,
            parsed_json: row.get("parsed_json")?,
            timestamp: DateTime::parse_from_rfc3339(&timestamp).unwrap().with_timezone(&Utc),
        })
    }
}

impl FirmwareInfo {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let checked_at: String = row.get("checked_at")?;
        
        Ok(Self {
            sku: row.get("sku")?,
            latest_version: row.get("latest_version")?,
            release_notes: row.get("release_notes")?,
            checked_at: DateTime::parse_from_rfc3339(&checked_at).unwrap().with_timezone(&Utc),
        })
    }
}