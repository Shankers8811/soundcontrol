use crate::protocol::{DeviceProfile, BatteryLevel};
use rusqlite::{Connection, params};
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
        conn.execute_batch(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../migrations.sql")))?;
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