# Architecture: SoundControl Rust/Tauri Rewrite

**Date:** 2026-11-12  
**Goal:** Replace Electron + Python bridge with Tauri v2 (Rust backend + WebView frontend) for lower RAM, smaller binary, native Bluetooth.

---

## Stack Decision

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | React 18 + TypeScript + Vite (existing) | Keep working UI, zero rewrite; Tauri uses system WebView |
| **Backend** | **Rust 2021** + **Tauri v2** | Single binary, ~5-15 MB, ~30-50 MB RAM, native system APIs |
| **Bluetooth (Linux)** | `bluer` (BlueZ D-Bus) | Async, well-maintained, RFCOMM + GATT support |
| **Bluetooth (Windows)** | `bluetooth` crate (WinRT) + `serialport` for RFCOMM | Windows.Devices.Bluetooth + RFCOMM via serial port |
| **Database** | **SQLite** via `rusqlite` / `sqlx` | Embedded, zero-config, < 1 MB, ACID, perfect for settings/presets |
| **Config/State** | `tauri-plugin-store` + SQLite | Persistent settings, preset library, device cache |
| **Logging** | `tracing` + `tracing-subscriber` | Structured, leveled, file + console |
| **Updates** | `tauri-plugin-updater` | GitHub Releases, delta updates, signature verification |
| **System Tray** | `tauri-plugin-shell` + native tray | Native tray, no Electron overhead |
| **Global Hotkeys** | `tauri-plugin-global-shortcut` | Native registration, low latency |
| **Notifications** | `tauri-plugin-notification` | Native Windows/Linux notifications |
| **Build** | `cargo-tauri` + GitHub Actions | Cross-compile Windows/Linux, NSIS + AppImage/.deb |

**One binary, one database, no microservices.** Tauri v2 uses the OS WebView (WebView2 on Windows, WebKitGTK on Linux) — already installed, ~0 MB extra.

---

## Database Schema (SQLite)

```sql
-- schema.sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- App settings (single row, upsert on change)
CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'system', -- 'system' | 'light' | 'dark'
    language TEXT NOT NULL DEFAULT 'en',
    auto_check_updates INTEGER NOT NULL DEFAULT 1,
    start_minimized INTEGER NOT NULL DEFAULT 0,
    show_tray INTEGER NOT NULL DEFAULT 1,
    log_level TEXT NOT NULL DEFAULT 'info',
    bluetooth_adapter TEXT, -- specific adapter name or null for default
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Known device profiles (from PROTOCOL.md SKU table)
CREATE TABLE device_profiles (
    sku TEXT PRIMARY KEY, -- e.g., 'A3944', 'A3959'
    marketing_names TEXT NOT NULL, -- JSON array: ["Life P2 Mini"]
    category TEXT NOT NULL, -- 'earbuds' | 'headphones' | 'speaker'
    anc_levels INTEGER, -- null = not supported
    transparency_modes TEXT, -- JSON array of mode names
    eq_type TEXT NOT NULL, -- 'none' | 'factory' | 'custom_8band' | 'custom_10band' | 'hearid'
    has_game_mode INTEGER NOT NULL DEFAULT 0,
    has_ldac INTEGER NOT NULL DEFAULT 0,
    has_dual_connection INTEGER NOT NULL DEFAULT 0,
    has_spatial_audio INTEGER NOT NULL DEFAULT 0,
    has_wind_noise INTEGER NOT NULL DEFAULT 0,
    has_touch_remap INTEGER NOT NULL DEFAULT 0,
    has_safe_volume INTEGER NOT NULL DEFAULT 0,
    has_hearid INTEGER NOT NULL DEFAULT 0,
    firmware_byte_offset INTEGER, -- for 01:05 parsing
    status TEXT NOT NULL DEFAULT 'verified', -- 'verified' | 'read_only' | 'catalog_only'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected device cache (per Bluetooth MAC)
CREATE TABLE known_devices (
    mac TEXT PRIMARY KEY, -- AA:BB:CC:DD:EE:FF uppercase
    sku TEXT REFERENCES device_profiles(sku) ON DELETE SET NULL,
    name TEXT, -- user-visible name
    last_connected TEXT, -- ISO8601
    last_firmware TEXT, -- from 01:05
    settings_json TEXT, -- per-device overrides (JSON)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Named custom EQ presets (per model SKU)
CREATE TABLE eq_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL REFERENCES device_profiles(sku) ON DELETE CASCADE,
    name TEXT NOT NULL,
    bands_json TEXT NOT NULL, -- JSON array of 8 or 10 floats (-6.0..+6.0)
    is_factory INTEGER NOT NULL DEFAULT 0, -- 1 = built-in, not editable
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (sku, name)
);

-- Battery history (telemetry, bounded)
CREATE TABLE battery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT NOT NULL REFERENCES known_devices(mac) ON DELETE CASCADE,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    left_pct INTEGER, -- 0-100 or null
    right_pct INTEGER,
    case_pct INTEGER,
    charging INTEGER NOT NULL DEFAULT 0, -- 0/1
    INDEX idx_battery_mac_time (mac, timestamp DESC)
);

-- Frame log (diagnostics, bounded, max 1000 rows)
CREATE TABLE frame_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'tx' | 'rx'
    frame_hex TEXT NOT NULL,
    parsed_json TEXT, -- JSON of decoded fields or null
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    INDEX idx_frame_mac_time (mac, timestamp DESC)
);

-- Firmware check cache
CREATE TABLE firmware_cache (
    sku TEXT PRIMARY KEY REFERENCES device_profiles(sku) ON DELETE CASCADE,
    latest_version TEXT,
    release_notes TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_settings_updated
AFTER UPDATE ON settings
BEGIN
    UPDATE settings SET updated_at = datetime('now') WHERE id = 1;
END;

CREATE TRIGGER trg_device_profiles_updated
AFTER UPDATE ON device_profiles
BEGIN
    UPDATE device_profiles SET updated_at = datetime('now') WHERE sku = NEW.sku;
END;

CREATE TRIGGER trg_known_devices_updated
AFTER UPDATE ON known_devices
BEGIN
    UPDATE known_devices SET updated_at = datetime('now') WHERE mac = NEW.mac;
END;

CREATE TRIGGER trg_eq_presets_updated
AFTER UPDATE ON eq_presets
BEGIN
    UPDATE eq_presets SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- View: device with profile joined
CREATE VIEW device_with_profile AS
SELECT kd.*, dp.category, dp.anc_levels, dp.eq_type, dp.has_game_mode,
       dp.has_ldac, dp.has_dual_connection, dp.has_spatial_audio,
       dp.has_wind_noise, dp.has_touch_remap, dp.has_safe_volume,
       dp.has_hearid, dp.status
FROM known_devices kd
LEFT JOIN device_profiles dp ON kd.sku = dp.sku;
```

---

## Tauri Commands (Rust ↔ Frontend API)

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `get_settings` | — | `Settings` | Read app settings |
| `update_settings` | `Partial<Settings>` | `Settings` | Update settings (merged) |
| `scan_devices` | — | `Vec<BluetoothDevice>` | Enumerate host-paired BT devices |
| `connect_device` | `{ mac: string }` | `DeviceSession` | Open RFCOMM channel, run handshake |
| `disconnect_device` | `{ mac: string }` | `void` | Close session, cleanup |
| `get_device_state` | `{ mac: string }` | `DeviceState` | Full state: battery, ANC, EQ, features |
| `set_anc_mode` | `{ mac, mode: AncMode }` | `Result<(), string>` | Send 06:81 frame |
| `set_transparency_mode` | `{ mac, mode: TransparencyMode }` | `Result<(), string>` | Send 06:81 frame |
| `set_eq_preset` | `{ mac, preset_id: number }` | `Result<(), string>` | Factory preset (02:81/83) |
| `set_custom_eq` | `{ mac, bands: number[] }` | `Result<(), string>` | Custom FE:FE frame |
| `save_eq_preset` | `{ sku, name, bands }` | `EqPreset` | Persist named preset |
| `delete_eq_preset` | `{ id }` | `void` | Delete user preset |
| `list_eq_presets` | `{ sku }` | `Vec<EqPreset>` | Factory + user presets |
| `toggle_game_mode` | `{ mac, enabled: boolean }` | `Result<(), string>` | 01:87 / 10:85 |
| `toggle_ldac` | `{ mac, enabled: boolean }` | `Result<(), string>` | 01:FF |
| `toggle_dual_connection` | `{ mac, enabled: boolean }` | `Result<(), string>` | 0B:84 |
| `get_battery_history` | `{ mac, hours?: number }` | `Vec<BatteryPoint>` | Chart data |
| `get_frame_log` | `{ mac, limit?: number }` | `Vec<FrameEntry>` | Diagnostics console |
| `export_diagnostics` | `{ mac }` | `string` (base64 zip) | Bundle logs + frames + bt info |
| `check_firmware` | `{ sku }` | `FirmwareInfo` | Cached + GitHub Releases check |
| `register_hotkeys` | — | `void` | Ctrl+Alt+A/G/S |
| `unregister_hotkeys` | — | `void` | Cleanup on exit |

---

## Background Jobs (Tokio Tasks)

| Job | Interval | Description |
|-----|----------|-------------|
| `battery_poll` | 30s while connected | Query 01:03, store in `battery_history` |
| `device_watch` | 5s | Watch host BT for disconnect, auto-cleanup session |
| `frame_logger` | Event-driven | Log all TX/RX frames to `frame_log` (ring buffer 1000) |
| `firmware_check` | 24h | Check GitHub Releases for firmware assets per SKU |
| `db_maintenance` | Daily | Vacuum, trim `battery_history` > 30d, `frame_log` > 1000 |

---

## Data Flow

```
┌─────────────┐     Tauri IPC      ┌──────────────────┐
│  React UI   │ ◄─────────────────► │  Rust Commands   │
│  (WebView)  │   serialize JSON    │  (tauri::command)│
└─────────────┘                     └────────┬─────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
            ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
            │  Bluetooth    │         │    SQLite     │         │  System APIs  │
            │  Manager      │         │  (rusqlite)   │         │  (tray,       │
            │  (bluer/      │         │  settings,    │         │   hotkeys,    │
            │   WinRT)      │         │  presets,     │         │   notify,     │
            │  RFCOMM +     │         │  history)     │         │   updater)    │
            │  Handshake    │         │               │         │               │
            └───────┬───────┘         └───────────────┘         └───────────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   ┌─────────────┐     ┌─────────────┐
   │   Linux:    │     │   Windows:  │
   │   bluer     │     │   windows-  │
   │   (BlueZ    │     │   Devices   │
   │   D-Bus)    │     │   Bluetooth │
   │   RFCOMM    │     │   + serial- │
   │             │     │   port      │
   └─────────────┘     └─────────────┘
```

---

## Project Structure (Cargo Workspace)

```
soundcontrol/
├── src-tauri/                    # Tauri v2 Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs                  # Embed device_profiles.json, generate icons
│   ├── src/
│   │   ├── main.rs               # Entry: setup plugins, commands, tasks
│   │   ├── lib.rs                # Re-exports
│   │   ├── commands/             # One file per command group
│   │   │   ├── mod.rs
│   │   │   ├── settings.rs
│   │   │   ├── bluetooth.rs
│   │   │   ├── device.rs
│   │   │   ├── eq.rs
│   │   │   ├── diagnostics.rs
│   │   │   └── system.rs
│   │   ├── bluetooth/
│   │   │   ├── mod.rs
│   │   │   ├── linux.rs          # bluer implementation
│   │   │   ├── windows.rs        # WinRT + serialport implementation
│   │   │   ├── protocol.rs       # Frame encode/decode, checksum
│   │   │   ├── handshake.rs      # 01:01 probe, channel detection
│   │   │   └── models.rs         # DeviceState, AncMode, EqPreset, etc.
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── migrations.rs     # sqlx migrations or raw SQL
│   │   │   ├── settings.rs
│   │   │   ├── devices.rs
│   │   │   ├── eq_presets.rs
│   │   │   ├── battery.rs
│   │   │   └── frames.rs
│   │   ├── tasks/
│   │   │   ├── mod.rs
│   │   │   ├── battery_poll.rs
│   │   │   ├── device_watch.rs
│   │   │   ├── firmware_check.rs
│   │   │   └── maintenance.rs
│   │   └── utils/
│   │       ├── logging.rs
│   │       └── zip.rs
│   └── resources/
│       └── device_profiles.json  # Embedded SKU table from PROTOCOL.md
├── src/                          # React frontend (existing, minimal changes)
│   ├── ...
├── package.json                  # Frontend deps + tauri scripts
├── Cargo.toml                    # Workspace root
└── .github/workflows/
    ├── build.yml                 # Windows + Linux matrix build
    └── release.yml               # Tag → build → sign → release
```

---

## Migration from Current Architecture

| Current (Electron + Python) | New (Tauri + Rust) |
|-----------------------------|---------------------|
| `electron-main.cjs` + `preload.cjs` | `src-tauri/src/main.rs` + Tauri IPC |
| `soundcore_bridge.py` (Flask + WebSocket) | `src-tauri/src/bluetooth/` (native async) |
| `npm run electron` | `cargo tauri dev` |
| `npm run build:win` (electron-builder) | `cargo tauri build` (NSIS + updater) |
| `npm run build:linux` (AppImage/.deb) | `cargo tauri build` (AppImage/.deb + bundler) |
| `%AppData%\soundcontrol\main.log` | Tauri log dir + `tracing` file appender |
| `package-lock.json` (214 KB) | `Cargo.lock` (tiny) + `package-lock.json` (frontend only) |
| Python 3.12 bundled (~50 MB) | **No Python** — all native Rust |
| Electron (~200 MB runtime) | **System WebView** (~0 MB extra) |
| **Total installer ~200-500 MB** | **Total installer ~15-30 MB** |
| **RAM ~200-400 MB** | **RAM ~30-50 MB** |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Windows RFCOMM via serialport unstable | Medium | High | Test on multiple adapters; fallback to WinRT socket if available |
| `bluer` D-Bus async complexity | Medium | Medium | Wrap in internal sync API; exhaustive unit tests with mock BlueZ |
| WebView2 not on Windows 10 1809+ | Low | High | Tauri v2 requires WebView2 Evergreen; bootstrap installer |
| WebKitGTK version mismatch on Linux | Low | Medium | Bundle minimal WebKit or depend on `webkit2gtk-4.1` (standard) |
| Tauri v2 plugin ecosystem gaps | Low | Medium | Use core plugins only; write custom for hotkeys/tray if needed |
| Code signing (Windows) | High | High | SignPath Foundation (free for OSS) or OV cert; gate release workflow |
| Model protocol gaps (HearID, touch) | High | Medium | Keep read-only; only enable writes with verified captures |

---

## Build Order (Vertical Slices)

| Milestone | Screens | Tables | Commands | Notes |
|-----------|---------|--------|----------|-------|
| **M0: Foundation** | — | `settings`, `device_profiles` | `get_settings`, `update_settings` | Tauri init, logging, SQLite, embedded profiles |
| **M1: Bluetooth Core** | Devices | `known_devices` | `scan_devices`, `connect_device`, `disconnect_device`, `get_device_state` | Linux `bluer` + Windows WinRT, handshake, channel probe |
| **M2: Audio Controls** | Noise Control, Equalizer | `eq_presets` | `set_anc_mode`, `set_transparency_mode`, `set_eq_preset`, `set_custom_eq`, `save_eq_preset`, `list_eq_presets` | Frame encode/decode, per-model gating |
| **M3: Connectivity Features** | Device page | — | `toggle_game_mode`, `toggle_ldac`, `toggle_dual_connection` | Model-gated commands |
| **M4: Telemetry & Diagnostics** | Device page, Diagnostics | `battery_history`, `frame_log` | `get_battery_history`, `get_frame_log`, `export_diagnostics` | Background poll tasks |
| **M5: System Integration** | Settings | — | `register_hotkeys`, `check_firmware` | Tray, notifications, updater, global shortcuts |
| **M6: Polish & Ship** | All | — | — | Theme, icons, signing, CI/CD, release automation |

---

## Configuration Files

### `src-tauri/tauri.conf.json` (key parts)
```json
{
  "productName": "SoundControl",
  "version": "2.0.0",
  "identifier": "com.soundcontrol.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "SoundControl",
      "width": 1100,
      "height": 760,
      "minWidth": 900,
      "minHeight": 600,
      "visible": false
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "appimage", "deb"],
    "icon": ["icons/icon.ico", "icons/icon.png"],
    "windows": {
      "nsis": { "installerIcon": "icons/icon.ico", "licenseFile": "LICENSE" }
    },
    "linux": {
      "appimage": { "bundleMediaFramework": false },
      "deb": { "depends": ["libwebkit2gtk-4.1-0", "bluez", "dbus"] }
    }
  },
  "plugins": {
    "store": { "path": "settings.dat" },
    "updater": { "endpoints": ["https://github.com/Shankers8811/soundcontrol/releases/latest/download/{{target}}/{{current_version}}"] },
    "notification": {},
    "globalShortcut": { "shortcuts": ["Ctrl+Alt+A", "Ctrl+Alt+G", "Ctrl+Alt+S"] }
  }
}
```

### `src-tauri/Cargo.toml` (key deps)
```toml
[package]
name = "soundcontrol"
version = "2.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["macros", "tray-icon", "global-shortcut", "notification", "updater", "shell", "dialog", "fs", "process", "clipboard-manager", "store"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled", "vtab", "functions"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio-rustls", "migrate", "chrono", "uuid", "json"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
thiserror = "1"
anyhow = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
zip = "0.6"
directories = "5"

# Linux Bluetooth
[target.'cfg(target_os = "linux")'.dependencies]
bluer = "0.11"
zbus = "4"
zbus_names = "4"
async-trait = "0.1"

# Windows Bluetooth
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Devices_Bluetooth",
    "Devices_Bluetooth_GenericAttributeProfile",
    "Devices_Bluetooth_Rfcomm",
    "Devices_Enumeration",
    "Foundation",
    "Storage_Streams"
] }
serialport = "5"
```

---

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit (Rust) | `cargo test` | Protocol encode/decode, checksum, DB queries, state machines |
| Integration (Rust) | `cargo test --test integration` | Mock BlueZ/WinRT, full command flow |
| Frontend | Vitest + React Testing Library | UI logic, store, components |
| E2E | Playwright + Tauri driver | Full app: scan → connect → control → disconnect |
| Simulator | Existing `npm run test:simulator` | Protocol fixtures against Rust decoder |

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - name: Install system deps (Linux)
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - name: Install deps
        run: npm ci
      - name: Build
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Next Phase

**Phase 3: Design** — Design tokens, component specs, accessibility audit for the React UI (largely reusable) and new Tauri-specific components (system tray menu, native dialogs, hotkey indicator).

**Phase 4: Build** — Implement M0–M6 milestones in order, committing to `main` with `build: M{N} description` messages.

**Phase 5: Backend** — Already covered in M1–M4 (Bluetooth, DB, tasks).

**Phase 6: Test** — Run test suites, fix bugs, parity check.

**Phase 7: Diff** — Update `replica/parity.md` with new scores.

**Phase 8: Entrepreneur** — Collect reviews, identify positioning.

**Phase 9: Brand** — Already have brand (SoundControl), verify sweep.

**Phase 10: Launch** — Landing page, pricing (free), store listings.

**Phase 11: Deploy** — Tag `v2.0.0`, signed release, announce.