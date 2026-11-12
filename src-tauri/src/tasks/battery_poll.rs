//! Battery polling task

use crate::db::Database;
use crate::bluetooth::BluetoothManager;
use crate::bluetooth::protocol::build_battery_query;
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
            
            // Send battery query
            let frame = build_battery_query();
            if let Err(e) = bluetooth.send_frame(&mac, &frame).await {
                warn!("Failed to send battery query to {}: {}", mac, e);
                continue;
            }
            
            // In a real implementation, we'd wait for the response
            // and parse it. For now, we'll create a mock record.
            let record = crate::bluetooth::models::BatteryRecord {
                mac: mac.clone(),
                timestamp: chrono::Utc::now(),
                left_pct: Some(85),
                right_pct: Some(82),
                case_pct: Some(90),
                charging: false,
            };
            
            if let Err(e) = db.add_battery_record(&record) {
                warn!("Failed to store battery record for {}: {}", mac, e);
            }
            
            debug!("Polled battery for {}", mac);
        }
    }
}