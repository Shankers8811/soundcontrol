//! Bluetooth module - Core Bluetooth management

pub mod models;
pub mod protocol;
pub mod handshake;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "windows")]
pub mod windows;

pub use models::*;
pub use protocol::*;
pub use handshake::*;

use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use std::collections::HashMap;
use crate::db::Database;
use anyhow::Result;
use tracing::{info, error, debug, warn};

/// Bluetooth device info from system scan
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BluetoothDevice {
    pub mac: String,
    pub name: Option<String>,
    pub paired: bool,
    pub connected: bool,
    pub rssi: Option<i16>,
    pub device_class: Option<u32>,
}

/// Active device session
#[derive(Debug, Clone)]
pub struct DeviceSession {
    pub mac: String,
    pub sku: Option<String>,
    pub profile: Option<crate::bluetooth::models::DeviceProfile>,
    pub rfcomm_channel: u8,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

/// Bluetooth manager - platform agnostic interface
pub struct BluetoothManager {
    db: Arc<Database>,
    sessions: Arc<RwLock<HashMap<String, DeviceSession>>>,
    #[cfg(target_os = "linux")]
    linux_bt: Option<linux::LinuxBluetooth>,
    #[cfg(target_os = "windows")]
    windows_bt: Option<windows::WindowsBluetooth>,
}

impl BluetoothManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            #[cfg(target_os = "linux")]
            linux_bt: None,
            #[cfg(target_os = "windows")]
            windows_bt: None,
        }
    }
    
    /// Initialize platform-specific Bluetooth backend
    pub async fn initialize(&mut self) -> Result<()> {
        #[cfg(target_os = "linux")]
        {
            let linux_bt = linux::LinuxBluetooth::new().await?;
            self.linux_bt = Some(linux_bt);
            info!("Linux Bluetooth backend initialized");
        }
        
        #[cfg(target_os = "windows")]
        {
            let windows_bt = windows::WindowsBluetooth::new().await?;
            self.windows_bt = Some(windows_bt);
            info!("Windows Bluetooth backend initialized");
        }
        
        Ok(())
    }
    
    /// Scan for paired Bluetooth devices
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>> {
        #[cfg(target_os = "linux")]
        {
            if let Some(bt) = &self.linux_bt {
                return bt.scan_devices().await;
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            if let Some(bt) = &self.windows_bt {
                return bt.scan_devices().await;
            }
        }
        
        Ok(vec![])
    }
    
    /// Connect to a device by MAC address
    pub async fn connect(&self, mac: &str) -> Result<DeviceSession> {
        let mac = mac.to_uppercase();
        
        // Check if already connected
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(&mac) {
                return Ok(session.clone());
            }
        }
        
        // Platform-specific connection
        let (rfcomm_channel, sku) = {
            #[cfg(target_os = "linux")]
            {
                if let Some(bt) = &self.linux_bt {
                    bt.connect(&mac).await?
                } else {
                    return Err(anyhow::anyhow!("Bluetooth not initialized"));
                }
            }
            
            #[cfg(target_os = "windows")]
            {
                if let Some(bt) = &self.windows_bt {
                    bt.connect(&mac).await?
                } else {
                    return Err(anyhow::anyhow!("Bluetooth not initialized"));
                }
            }
            
            #[cfg(not(any(target_os = "linux", target_os = "windows")))]
            {
                return Err(anyhow::anyhow!("Unsupported platform"));
            }
        };
        
        // Load device profile
        let profile = if let Some(sku) = &sku {
            self.db.get_device_profile(sku)?.or_else(|| {
                // Try to infer from known devices
                self.db.get_known_device(&mac).ok().flatten().and_then(|d| d.sku).and_then(|s| {
                    // This would need the profile loaded from DB
                    None
                })
            })
        } else {
            None
        };
        
        let session = DeviceSession {
            mac: mac.clone(),
            sku: sku.clone(),
            profile,
            rfcomm_channel,
            connected_at: chrono::Utc::now(),
            last_activity: chrono::Utc::now(),
        };
        
        // Store session
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(mac.clone(), session.clone());
        }
        
        // Update known device
        if let Ok(Some(mut known)) = self.db.get_known_device(&mac) {
            known.last_connected = Some(chrono::Utc::now());
            if let Some(sku) = sku {
                known.sku = Some(sku);
            }
            let _ = self.db.upsert_known_device(&known);
        }
        
        info!("Connected to device: {} on channel {}", mac, rfcomm_channel);
        Ok(session)
    }
    
    /// Disconnect from a device
    pub async fn disconnect(&self, mac: &str) -> Result<()> {
        let mac = mac.to_uppercase();
        
        // Platform-specific disconnect
        #[cfg(target_os = "linux")]
        {
            if let Some(bt) = &self.linux_bt {
                bt.disconnect(&mac).await?;
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            if let Some(bt) = &self.windows_bt {
                bt.disconnect(&mac).await?;
            }
        }
        
        // Remove session
        {
            let mut sessions = self.sessions.write().await;
            sessions.remove(&mac);
        }
        
        info!("Disconnected from device: {}", mac);
        Ok(())
    }
    
    /// Get active session
    pub async fn get_session(&self, mac: &str) -> Option<DeviceSession> {
        let sessions = self.sessions.read().await;
        sessions.get(&mac.to_uppercase()).cloned()
    }
    
    /// Send raw frame to device
    pub async fn send_frame(&self, mac: &str, frame: &[u8]) -> Result<()> {
        let mac = mac.to_uppercase();
        
        #[cfg(target_os = "linux")]
        {
            if let Some(bt) = &self.linux_bt {
                return bt.send_frame(&mac, frame).await;
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            if let Some(bt) = &self.windows_bt {
                return bt.send_frame(&mac, frame).await;
            }
        }
        
        Err(anyhow::anyhow!("Bluetooth not initialized"))
    }
    
    /// Receive frame from device (blocking with timeout)
    pub async fn receive_frame(&self, mac: &str, timeout_ms: u64) -> Result<Vec<u8>> {
        let mac = mac.to_uppercase();
        
        #[cfg(target_os = "linux")]
        {
            if let Some(bt) = &self.linux_bt {
                return bt.receive_frame(&mac, timeout_ms).await;
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            if let Some(bt) = &self.windows_bt {
                return bt.receive_frame(&mac, timeout_ms).await;
            }
        }
        
        Err(anyhow::anyhow!("Bluetooth not initialized"))
    }
    
    /// Get all active sessions
    pub async fn get_active_sessions(&self) -> Vec<DeviceSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }
}