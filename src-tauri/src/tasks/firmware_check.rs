//! Firmware check task

use crate::db::Database;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{info, warn};

pub async fn run(db: Arc<Database>) {
    // Run once at startup, then every 24 hours
    let mut interval = interval(Duration::from_secs(24 * 60 * 60));
    
    info!("Firmware check task started");
    
    // Initial check
    if let Err(e) = check_all_firmware(&db).await {
        warn!("Initial firmware check failed: {}", e);
    }
    
    loop {
        interval.tick().await;
        
        if let Err(e) = check_all_firmware(&db).await {
            warn!("Scheduled firmware check failed: {}", e);
        }
    }
}

async fn check_all_firmware(db: &Database) -> anyhow::Result<()> {
    let profiles = db.load_device_profiles()?;
    
    for profile in profiles {
        if profile.status == "verified" {
            // Check firmware for this SKU
            // This would call the check_firmware command logic
            debug!("Would check firmware for {}", profile.sku);
        }
    }
    
    Ok(())
}