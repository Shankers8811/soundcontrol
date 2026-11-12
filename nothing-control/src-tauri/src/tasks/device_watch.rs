//! Device watch task - monitors for disconnections

use crate::db::Database;
use crate::bluetooth::BluetoothManager;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{info, warn, debug};

pub async fn run(db: Arc<Database>, bluetooth: Arc<BluetoothManager>) {
    let mut interval = interval(Duration::from_secs(5));
    
    info!("Device watch task started");
    
    loop {
        interval.tick().await;
        
        let sessions = bluetooth.get_active_sessions().await;
        
        for session in sessions {
            let mac = session.mac.clone();
            
            // Check if device is still connected at OS level
            // This is platform-specific - in real implementation,
            // we'd check BlueZ/WinRT for connection status
            
            // For now, just update last activity
            if let Err(e) = db.update_device_last_connected(&mac) {
                warn!("Failed to update last connected for {}: {}", mac, e);
            }
            
            debug!("Device watch check for {}", mac);
        }
    }
}