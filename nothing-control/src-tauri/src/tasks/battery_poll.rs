//! Battery polling task

use crate::db::Database;
use crate::bluetooth::BluetoothManager;
use crate::protocol::SoundcoreDevice;
use crate::bluetooth::models::BatteryTelemetry;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{debug, info, warn};

pub async fn run(db: Arc<Database>, bluetooth: Arc<BluetoothManager>) {
    let mut interval = interval(Duration::from_secs(30));
    
    info!("Battery polling task started");
    
    loop {
        interval.tick().await;
        
        // Get active sessions
        let sessions = bluetooth.get_active_sessions().await;
        
        for session in sessions {
            let mac = session.mac.clone();
            
            // Get openscq device
            if let Some(device) = bluetooth.get_openscq_device(&mac).await {
                // Query battery
                match device.get_battery().await {
                    Ok(battery) => {
                        // Convert to BatteryTelemetry
                        let record = crate::bluetooth::models::BatteryRecord {
                            mac: mac.clone(),
                            timestamp: chrono::Utc::now(),
                            left_pct: battery.left,
                            right_pct: battery.right,
                            case_pct: battery.case,
                            charging: battery.left_charging || battery.right_charging || battery.case_charging,
                        };
                        
                        // Store in database
                        if let Err(e) = db.add_battery_record(&record) {
                            warn!("Failed to store battery record for {}: {}", mac, e);
                        }
                        
                        debug!("Polled battery for {}", mac);
                    }
                    Err(e) => {
                        warn!("Failed to query battery for {}: {}", mac, e);
                    }
                }
            } else {
                warn!("No openscq device for {}", mac);
            }
        }
    }
}