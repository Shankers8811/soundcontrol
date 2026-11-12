//! SoundControl - Native Rust Bluetooth backend for Soundcore devices

use std::sync::Arc;
use tauri::{Manager, Runtime, State};
use tracing::{info, error};

mod commands;
mod bluetooth;
mod db;
mod tasks;
mod utils;

use commands::{
    settings::*,
    bluetooth::*,
    device::*,
    eq::*,
    diagnostics::*,
    system::*,
};
use db::Database;
use tasks::{battery_poll, device_watch, firmware_check, maintenance};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub bluetooth: Arc<bluetooth::BluetoothManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    utils::logging::init();

    info!("Starting SoundControl v2.0.0");

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize database
            let db = Arc::new(Database::new(&handle).expect("Failed to initialize database"));
            info!("Database initialized");

            // Initialize Bluetooth manager
            let bluetooth = Arc::new(bluetooth::BluetoothManager::new(db.clone()));
            info!("Bluetooth manager initialized");

            // Create app state
            let state = AppState { db: db.clone(), bluetooth: bluetooth.clone() };
            app.manage(state);

            // Start background tasks
            let db_clone = db.clone();
            let bluetooth_clone = bluetooth.clone();
            let handle_clone = handle.clone();

            tauri::async_runtime::spawn(async move {
                // Battery polling task
                battery_poll::run(db_clone.clone(), bluetooth_clone.clone()).await;
            });

            let db_clone = db.clone();
            let bluetooth_clone = bluetooth.clone();
            tauri::async_runtime::spawn(async move {
                // Device watch task
                device_watch::run(db_clone, bluetooth_clone).await;
            });

            let db_clone = db.clone();
            tauri::async_runtime::spawn(async move {
                // Firmware check task (daily)
                firmware_check::run(db_clone).await;
            });

            let db_clone = db.clone();
            tauri::async_runtime::spawn(async move {
                // Database maintenance task (daily)
                maintenance::run(db_clone).await;
            });

            // Register global shortcuts
            let _ = register_hotkeys(handle_clone).await;

            // Show main window after setup
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            get_settings,
            update_settings,
            // Bluetooth
            scan_devices,
            connect_device,
            disconnect_device,
            get_device_state,
            // Audio controls
            set_anc_mode,
            set_transparency_mode,
            set_eq_preset,
            set_custom_eq,
            save_eq_preset,
            delete_eq_preset,
            list_eq_presets,
            // Connectivity features
            toggle_game_mode,
            toggle_ldac,
            toggle_dual_connection,
            // Diagnostics
            get_battery_history,
            get_frame_log,
            export_diagnostics,
            // Firmware
            check_firmware,
            // System
            register_hotkeys,
            unregister_hotkeys,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of close if tray is enabled
                let state: State<AppState> = window.state();
                let settings = state.db.get_settings().unwrap_or_default();
                if settings.show_tray {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}