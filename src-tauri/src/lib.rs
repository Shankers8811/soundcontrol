pub mod bluetooth;
pub mod commands;
pub mod db;
pub mod protocol;
pub mod tasks;
pub mod utils;

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

pub struct AppState {
    pub db: Arc<db::Database>,
    pub bluetooth: Arc<RwLock<bluetooth::BluetoothManager>>,
    pub protocol: Arc<protocol::ProtocolHandler>,
}

impl AppState {
    pub fn new(db: db::Database, bluetooth: bluetooth::BluetoothManager, protocol: protocol::ProtocolHandler) -> Self {
        Self {
            db: Arc::new(db),
            bluetooth: Arc::new(RwLock::new(bluetooth)),
            protocol: Arc::new(protocol),
        }
    }
}

pub fn run_app() {
    tauri::Builder::default()
        .manage(AppState::new(
            db::Database::new().expect("Failed to init database"),
            bluetooth::BluetoothManager::new(),
            protocol::ProtocolHandler::new(),
        ))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
