CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT datetime('now')
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
    created_at TEXT DEFAULT datetime('now')
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
    recorded_at TEXT DEFAULT datetime('now')
);

CREATE TABLE IF NOT EXISTS frame_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL,
    frame_data TEXT NOT NULL,
    logged_at TEXT DEFAULT datetime('now')
);

CREATE TABLE IF NOT EXISTS device_states (
    address TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at TEXT DEFAULT datetime('now')
);

CREATE TABLE IF NOT EXISTS firmware_cache (
    model TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    download_url TEXT,
    checksum TEXT,
    cached_at TEXT DEFAULT datetime('now')
);

CREATE INDEX IF NOT EXISTS idx_battery_history_device ON battery_history(device_address);
CREATE INDEX IF NOT EXISTS idx_battery_history_recorded ON battery_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_frame_log_logged ON frame_log(logged_at);
