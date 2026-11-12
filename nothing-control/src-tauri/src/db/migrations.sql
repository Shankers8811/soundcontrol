-- SoundControl Database Migrations
-- This file is embedded and run at startup

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- App settings (single row, upsert on change)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'system',
    language TEXT NOT NULL DEFAULT 'en',
    auto_check_updates INTEGER NOT NULL DEFAULT 1,
    start_minimized INTEGER NOT NULL DEFAULT 0,
    show_tray INTEGER NOT NULL DEFAULT 1,
    log_level TEXT NOT NULL DEFAULT 'info',
    bluetooth_adapter TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Known device profiles (from devices.toml)
CREATE TABLE IF NOT EXISTS device_profiles (
    sku TEXT PRIMARY KEY,
    marketing_names TEXT NOT NULL,
    category TEXT NOT NULL,
    anc_levels INTEGER,
    transparency_modes TEXT NOT NULL,
    eq_type TEXT NOT NULL,
    has_game_mode INTEGER NOT NULL DEFAULT 0,
    has_ldac INTEGER NOT NULL DEFAULT 0,
    has_dual_connection INTEGER NOT NULL DEFAULT 0,
    has_spatial_audio INTEGER NOT NULL DEFAULT 0,
    has_wind_noise INTEGER NOT NULL DEFAULT 0,
    has_touch_remap INTEGER NOT NULL DEFAULT 0,
    has_safe_volume INTEGER NOT NULL DEFAULT 0,
    has_hearid INTEGER NOT NULL DEFAULT 0,
    firmware_byte_offset INTEGER,
    status TEXT NOT NULL DEFAULT 'verified',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected device cache (per Bluetooth MAC)
CREATE TABLE IF NOT EXISTS known_devices (
    mac TEXT PRIMARY KEY,
    sku TEXT REFERENCES device_profiles(sku) ON DELETE SET NULL,
    name TEXT,
    last_connected TEXT,
    last_firmware TEXT,
    settings_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Named custom EQ presets (per model SKU)
CREATE TABLE IF NOT EXISTS eq_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL REFERENCES device_profiles(sku) ON DELETE CASCADE,
    name TEXT NOT NULL,
    bands_json TEXT NOT NULL,
    is_factory INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (sku, name)
);

-- Battery history (telemetry, bounded)
CREATE TABLE IF NOT EXISTS battery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT NOT NULL REFERENCES known_devices(mac) ON DELETE CASCADE,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    left_pct INTEGER,
    right_pct INTEGER,
    case_pct INTEGER,
    charging INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_battery_mac_time ON battery_history (mac, timestamp DESC);

-- Frame log (diagnostics, bounded, max 1000 rows)
CREATE TABLE IF NOT EXISTS frame_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT NOT NULL,
    direction TEXT NOT NULL,
    frame_hex TEXT NOT NULL,
    parsed_json TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_frame_mac_time ON frame_log (mac, timestamp DESC);

-- Firmware check cache
CREATE TABLE IF NOT EXISTS firmware_cache (
    sku TEXT PRIMARY KEY REFERENCES device_profiles(sku) ON DELETE CASCADE,
    latest_version TEXT,
    release_notes TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Triggers to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_settings_updated
AFTER UPDATE ON settings
BEGIN
    UPDATE settings SET updated_at = datetime('now') WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_device_profiles_updated
AFTER UPDATE ON device_profiles
BEGIN
    UPDATE device_profiles SET updated_at = datetime('now') WHERE sku = NEW.sku;
END;

CREATE TRIGGER IF NOT EXISTS trg_known_devices_updated
AFTER UPDATE ON known_devices
BEGIN
    UPDATE known_devices SET updated_at = datetime('now') WHERE mac = NEW.mac;
END;

CREATE TRIGGER IF NOT EXISTS trg_eq_presets_updated
AFTER UPDATE ON eq_presets
BEGIN
    UPDATE eq_presets SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- View: device with profile joined
CREATE VIEW IF NOT EXISTS device_with_profile AS
SELECT kd.*, dp.category, dp.anc_levels, dp.eq_type, dp.has_game_mode,
       dp.has_ldac, dp.has_dual_connection, dp.has_spatial_audio,
       dp.has_wind_noise, dp.has_touch_remap, dp.has_safe_volume,
       dp.has_hearid, dp.status
FROM known_devices kd
LEFT JOIN device_profiles dp ON kd.sku = dp.sku;