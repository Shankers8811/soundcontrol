//! Database maintenance task

use crate::db::Database;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{info, warn};

pub async fn run(db: Arc<Database>) {
    // Run once at startup, then every 24 hours
    let mut interval = interval(Duration::from_secs(24 * 60 * 60));
    
    info!("Database maintenance task started");
    
    // Initial maintenance
    if let Err(e) = run_maintenance(&db).await {
        warn!("Initial database maintenance failed: {}", e);
    }
    
    loop {
        interval.tick().await;
        
        if let Err(e) = run_maintenance(&db).await {
            warn!("Scheduled database maintenance failed: {}", e);
        }
    }
}

async fn run_maintenance(db: &Database) -> anyhow::Result<()> {
    info!("Running database maintenance");
    
    // Trim old data
    db.trim_old_data()?;
    
    // Vacuum
    db.vacuum()?;
    
    info!("Database maintenance completed");
    Ok(())
}