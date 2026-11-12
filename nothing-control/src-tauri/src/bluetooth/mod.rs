//! Bluetooth Manager for Soundcore devices
//! 
//! Handles device discovery, connection, and communication
//! using platform-specific Bluetooth APIs and openscq30-lib.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock, mpsc};
use tokio::time::interval;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

use crate::protocol::{
    DeviceProfile, SoundcoreDevice, BatteryInfo, AncState, AncMode,
    TransparencyState, GameModeState, MultipointState, LdacState,
    EqState, BassEnhanceState, WindNoiseState, WearingDetectionState,
    EasyChatState, AutoPowerOffState, LdacCodecState, DeviceInfo,
    MultipointState, LdacState, Command, ProtocolError,
    openscq30_lib, SoundcoreDevice,
};
use crate::db::Database;

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
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceSession {
    pub mac: String,
    pub model: Option<String>,
    pub profile: Option<crate::protocol::DeviceProfile>,
    pub rfcomm_channel: u8,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

/// Bluetooth manager - platform agnostic interface
pub struct BluetoothManager {
    db: Arc<Database>,
    sessions: Arc<RwLock<HashMap<String, DeviceSession>>>,
    openscq_devices: Arc<Mutex<HashMap<String, crate::protocol::SoundcoreDevice>>>,
    
    #[cfg(target_os = "linux")]
    linux_bt: Option<crate::bluetooth::linux::LinuxBluetooth>,
    
    #[cfg(target_os = "windows")]
    windows_bt: Option<crate::bluetooth::windows::WindowsBluetooth>,
    
    // Notification sender for UI updates
    event_sender: Option<mpsc::UnboundedSender<BluetoothEvent>>,
}

/// Bluetooth events for UI updates
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum BluetoothEvent {
    DeviceDiscovered(BluetoothDevice),
    DeviceConnected(String), // MAC
    DeviceDisconnected(String), // MAC
    BatteryUpdate(String, crate::protocol::BatteryInfo), // MAC, BatteryInfo
    AncModeChanged(String, crate::protocol::AncMode), // MAC, AncMode
    ConnectionFailed(String, String), // MAC, error
    ScanStarted,
    ScanCompleted,
}

impl BluetoothManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            openscq_devices: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(target_os = "linux")]
            linux_bt: None,
            #[cfg(target_os = "windows")]
            windows_bt: None,
            event_sender: None,
        }
    }
    
    /// Set event sender for UI updates
    pub fn set_event_sender(&mut self, sender: mpsc::UnboundedSender<BluetoothEvent>) {
        self.event_sender = Some(sender);
    }
    
    /// Emit event to UI
    fn emit_event(&self, event: BluetoothEvent) {
        if let Some(sender) = &self.event_sender {
            let _ = sender.send(event);
        }
    }
    
    /// Initialize platform-specific Bluetooth backend
    pub async fn initialize(&mut self) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            let linux_bt = crate::bluetooth::linux::LinuxBluetooth::new().await?;
            self.linux_bt = Some(linux_bt);
            info!("Linux Bluetooth backend initialized");
        }
        
        #[cfg(target_os = "windows")]
        {
            let windows_bt = crate::bluetooth::windows::WindowsBluetooth::new().await?;
            self.windows_bt = Some(windows_bt);
            info!("Windows Bluetooth backend initialized");
        }
        
        Ok(())
    }
    
    /// Scan for paired Bluetooth devices
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>, String> {
        self.emit_event(BluetoothEvent::ScanStarted);
        
        #[cfg(target_os = "linux")]
        {
            if let Some(bt) = &self.linux_bt {
                let devices = bt.scan_devices().await?;
                self.emit_event(BluetoothEvent::ScanCompleted);
                return Ok(devices);
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            if let Some(bt) = &self.windows_bt {
                let devices = bt.scan_devices().await?;
                self.emit_event(BluetoothEvent::ScanCompleted);
                return Ok(devices);
            }
        }
        
        Ok(vec![])
    }
    
    /// Connect to a device by MAC address
    pub async fn connect(&self, mac: &str) -> Result<DeviceSession, String> {
        let mac = mac.to_uppercase();
        
        // Check if already connected
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(&mac) {
                return Ok(session.clone());
            }
        }
        
        // Platform-specific connection
        let (rfcomm_channel, model_name) = {
            #[cfg(target_os = "linux")]
            {
                if let Some(bt) = &self.linux_bt {
                    bt.connect(&mac).await?
                } else {
                    return Err("Bluetooth not initialized".to_string());
                }
            }
            
            #[cfg(target_os = "windows")]
            {
                if let Some(bt) = &self.windows_bt {
                    bt.connect(&mac).await?
                } else {
                    return Err("Bluetooth not initialized".to_string());
                }
            }
            
            #[cfg(not(any(target_os = "linux", target_os = "windows")))]
            {
                return Err("Unsupported platform".to_string());
            }
        };
        
        // Load device profile from TOML
        let profile = crate::protocol::DeviceProfile::find_by_bluetooth_name(&model_name);
        
        // Create SoundcoreDevice using openscq30-lib
        let openscq_device = self.create_openscq_device(&mac, &model_name, profile.as_ref()).await?;
        
        // Store openscq device
        {
            let mut devices = self.openscq_devices.lock().await;
            devices.insert(mac.clone(), openscq_device);
        }
        
        let session = DeviceSession {
            mac: mac.clone(),
            model: Some(model_name.clone()),
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
        
        // Update known device in database
        if let Ok(Some(mut known)) = self.db.get_known_device(&mac) {
            known.last_connected = Some(chrono::Utc::now());
            known.name = Some(model_name);
            let _ = self.db.upsert_known_device(&known);
        }
        
        self.emit_event(BluetoothEvent::DeviceConnected(mac.clone()));
        
        info!("Connected to device: {} on channel {}", mac, rfcomm_channel);
        Ok(session)
    }
    
    /// Create SoundcoreDevice using openscq30-lib
    async fn create_openscq_device(
        &self, 
        mac: &str, 
        model_name: &str,
        profile: Option<&crate::protocol::DeviceProfile>
    ) -> Result<crate::protocol::SoundcoreDevice, String> {
        // Get DeviceModel from openscq30-lib
        let model = self.get_device_model(&model_name)?;
        
        // Create SoundcoreDevice using openscq30-lib
        let device = openscq30_lib::SoundcoreDevice::new(model, mac)
            .map_err(|e| format!("Failed to create SoundcoreDevice: {}", e))?;
        
        Ok(crate::protocol::SoundcoreDevice {
            inner: device,
            model: model_name.to_string(),
            address: mac.to_string(),
        })
    }
    
    /// Get DeviceModel from model name
    fn get_device_model(&self, model_name: &str) -> Result<openscq30_lib::DeviceModel, String> {
        // Map model name to openscq30 DeviceModel
        // This uses the model name from the Bluetooth device
        let model_str = model_name.to_lowercase();
        
        // Try to match known models
        let device_model = if model_str.contains("liberty 4 pro") {
            openscq30_lib::DeviceModel::Liberty4Pro
        } else if model_str.contains("liberty 4") {
            openscq30_lib::DeviceModel::Liberty4
        } else if model_str.contains("liberty 3 pro") {
            openscq30_lib::DeviceModel::Liberty3Pro
        } else if model_str.contains("liberty 5") {
            openscq30_lib::DeviceModel::Liberty5
        } else if model_str.contains("liberty 4 nc") {
            openscq30_lib::DeviceModel::Liberty4Nc
        } else if model_str.contains("liberty air 2 pro") {
            openscq30_lib::DeviceModel::LibertyAir2Pro
        } else if model_str.contains("p30i") || model_str.contains("r50i") {
            openscq30_lib::DeviceModel::P30i
        } else if model_str.contains("p20i") || model_str.contains("p25i") || model_str.contains("r50i") {
            openscq30_lib::DeviceModel::P20i
        } else if model_str.contains("space one pro") {
            openscq30_lib::DeviceModel::SpaceOnePro
        } else if model_str.contains("space one") {
            openscq30_lib::DeviceModel::SpaceOne
        } else if model_str.contains("space q45") {
            openscq30_lib::DeviceModel::SpaceQ45
        } else if model_str.contains("space a40") {
            openscq30_lib::DeviceModel::SpaceA40
        } else if model_str.contains("space 2") {
            openscq30_lib::DeviceModel::Space2
        } else if model_str.contains("life q35") {
            openscq30_lib::DeviceModel::LifeQ35
        } else if model_str.contains("life q30") || model_str.contains("q30") {
            openscq30_lib::DeviceModel::LifeQ30
        } else if model_str.contains("life q20") || model_str.contains("q20") {
            openscq30_lib::DeviceModel::LifeQ20
        } else if model_str.contains("life p3") {
            openscq30_lib::DeviceModel::LifeP3
        } else if model_str.contains("life p2 mini") || model_str.contains("p2 mini") {
            openscq30_lib::DeviceModel::LifeP2Mini
        } else if model_str.contains("life a2 nc") {
            openscq30_lib::DeviceModel::LifeA2Nc
        } else if model_str.contains("p31i") || model_str.contains("r60i") {
            openscq30_lib::DeviceModel::P31i
        } else if model_str.contains("p40i") {
            openscq30_lib::DeviceModel::P40i
        } else if model_str.contains("liberty 3 pro") {
            openscq30_lib::DeviceModel::Liberty3Pro
        } else if model_str.contains("liberty 4 nc") {
            openscq30_lib::DeviceModel::Liberty4Nc
        } else if model_str.contains("cmf buds pro 2") {
            openscq30_lib::DeviceModel::CmfBudsPro2
        } else if model_str.contains("cmf buds pro") {
            openscq30_lib::DeviceModel::CmfBudsPro
        } else if model_str.contains("cmf buds") {
            openscq30_lib::DeviceModel::CmfBuds
        } else if model_str.contains("cmf neckband pro") {
            openscq30_lib::DeviceModel::CmfNeckbandPro
        } else if model_str.contains("cmf headphone pro") {
            openscq30_lib::DeviceModel::CmfHeadphonePro
        } else if model_str.contains("liberty 5") {
            openscq30_lib::DeviceModel::Liberty5
        } else if model_str.contains("life q35") {
            openscq30_lib::DeviceModel::LifeQ35
        } else if model_str.contains("life q30") {
            openscq30_lib::DeviceModel::LifeQ30
        } else if model_str.contains("space q45") {
            openscq30_lib::DeviceModel::SpaceQ45
        } else if model_str.contains("space one pro") {
            openscq30_lib::DeviceModel::SpaceOnePro
        } else if model_str.contains("space one") {
            openscq30_lib::DeviceModel::SpaceOne
        } else if model_str.contains("space a40") {
            openscq30_lib::DeviceModel::SpaceA40
        } else if model_str.contains("space 2") {
            openscq30_lib::DeviceModel::Space2
        } else {
            // Default to a generic model - will use basic features
            openscq30_lib::DeviceModel::Generic
        };
        
        Ok(device_model)
    }
    
    /// Disconnect from a device
    pub async fn disconnect(&self, mac: &str) -> Result<(), String> {
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
        
        // Remove openscq device
        {
            let mut devices = self.openscq_devices.lock().await;
            devices.remove(&mac);
        }
        
        self.emit_event(BluetoothEvent::DeviceDisconnected(mac.clone()));
        
        info!("Disconnected from device: {}", mac);
        Ok(())
    }
    
    /// Get active session
    pub async fn get_session(&self, mac: &str) -> Option<DeviceSession> {
        let sessions = self.sessions.read().await;
        sessions.get(&mac.to_uppercase()).cloned()
    }
    
    /// Get openscq device
    pub async fn get_openscq_device(&self, mac: &str) -> Option<crate::protocol::SoundcoreDevice> {
        let devices = self.openscq_devices.lock().await;
        devices.get(&mac.to_uppercase()).cloned()
    }
    
    /// Get all active sessions
    pub async fn get_active_sessions(&self) -> Vec<DeviceSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }
    
    /// Send command to device
    pub async fn send_command(&self, mac: &str, command: Command) -> Result<(), String> {
        let device = self.get_openscq_device(mac).await
            .ok_or_else(|| "Device not connected".to_string())?;
        
        self.execute_command(&device, command).await
    }
    
    /// Execute command using openscq30-lib
    async fn execute_command(&self, device: &crate::protocol::SoundcoreDevice, command: Command) -> Result<(), String> {
        match command {
            Command::GetBattery => {
                let _ = device.get_battery().await?;
            }
            Command::GetAnc => {
                let _ = device.get_anc().await?;
            }
            Command::SetAnc(mode) => {
                device.set_anc(mode).await?;
            }
            Command::SetTransparency => {
                device.set_transparency(true).await?;
            }
            Command::GetInEar => {
                // Not directly supported, would need to add to openscq30
            }
            Command::SetInEar(enabled) => {
                device.set_wearing_detection(enabled).await?;
            }
            Command::GetLatency => {
                // Get game mode as latency
                let _ = device.get_game_mode().await?;
            }
            Command::SetLatency(enabled) => {
                device.set_game_mode(enabled).await?;
            }
            Command::GetEqPreset => {
                let _ = device.get_eq().await?;
            }
            Command::SetEqPreset(preset) => {
                device.set_eq_preset(preset).await?;
            }
            Command::SetCustomEq(bands) => {
                device.set_custom_eq(bands).await?;
            }
            Command::GetBassEnhance => {
                let _ = device.get_bass_enhance().await?;
            }
            Command::SetBassEnhance(enabled) => {
                device.set_bass_enhance(enabled).await?;
            }
            Command::GetGameMode => {
                let _ = device.get_game_mode().await?;
            }
            Command::SetGameMode(enabled) => {
                device.set_game_mode(enabled).await?;
            }
            Command::GetMultipoint => {
                let _ = device.get_multipoint_state().await?;
            }
            Command::SetMultipoint(enabled) => {
                device.set_multipoint_state(enabled).await?;
            }
            Command::GetLdac => {
                let _ = device.get_ldac_state().await?;
            }
            Command::SetLdac(enabled) => {
                device.set_ldac_state(enabled).await?;
            }
            Command::GetGesture(name) => {
                let _ = device.get_gesture(&name).await?;
            }
            Command::SetGesture(name, action) => {
                device.set_gesture(&name, action).await?;
            }
            Command::GetBassEnhanceLevel => {
                let _ = device.get_bass_enhance().await?;
            }
            Command::SetBassEnhanceLevel(level) => {
                device.set_bass_enhance_level(level).await?;
            }
            Command::GetWindNoise => {
                let _ = device.get_wind_noise().await?;
            }
            Command::SetWindNoise(enabled) => {
                device.set_wind_noise(enabled).await?;
            }
            Command::GetWearingDetection => {
                let _ = device.get_wearing_detection().await?;
            }
            Command::SetWearingDetection(enabled) => {
                device.set_wearing_detection(enabled).await?;
            }
            Command::GetEasyChat => {
                let _ = device.get_easy_chat().await?;
            }
            Command::SetEasyChat(enabled) => {
                device.set_easy_chat(enabled).await?;
            }
            Command::GetAutoPowerOff => {
                let _ = device.get_auto_power_off().await?;
            }
            Command::SetAutoPowerOff(minutes) => {
                device.set_auto_power_off(minutes).await?;
            }
            Command::GetLdacCodec => {
                let _ = device.get_ldac_codec().await?;
            }
            Command::SetLdacCodec(enabled) => {
                device.set_ldac_codec(enabled).await?;
            }
            Command::FindBuds => {
                device.find_buds().await?;
            }
            Command::EarTipTest => {
                device.ear_tip_test().await?;
            }
            Command::GetFirmware => {
                let _ = device.get_firmware().await?;
            }
            Command::GetDeviceInfo => {
                let _ = device.get_device_info().await?;
            }
            Command::GetBatteryInfo => {
                let _ = device.get_battery().await?;
            }
        }
        
        Ok(())
    }
    
    /// Start background battery polling
    pub async fn start_battery_polling(&self, db: Arc<Database>) {
        let mut interval = interval(Duration::from_secs(30));
        
        loop {
            interval.tick().await;
            
            let sessions = self.get_active_sessions().await;
            for session in sessions {
                if let Some(device) = self.get_openscq_device(&session.mac).await {
                    if let Ok(battery) = device.get_battery().await {
                        // Store in database
                        let record = crate::bluetooth::models::BatteryRecord {
                            mac: session.mac.clone(),
                            timestamp: chrono::Utc::now(),
                            left_pct: battery.left,
                            right_pct: battery.right,
                            case_pct: battery.case,
                            charging: battery.left_charging || battery.right_charging || battery.case_charging,
                        };
                        let _ = db.add_battery_record(&record);
                        
                        // Emit event for UI
                        self.emit_event(BluetoothEvent::BatteryUpdate(
                            session.mac.clone(),
                            battery,
                        ));
                    }
                }
            }
        }
    }
    
    /// Start device watch for disconnections
    pub async fn start_device_watch(&self, db: Arc<Database>) {
        let mut interval = interval(Duration::from_secs(5));
        
        loop {
            interval.tick().await;
            
            let sessions = self.get_active_sessions().await;
            for session in sessions {
                // Check if device is still connected at OS level
                // This is platform-specific
                
                // Update last activity
                if let Err(e) = db.update_device_last_connected(&session.mac) {
                    warn!("Failed to update last connected for {}: {}", session.mac, e);
                }
            }
        }
    }
}

impl Default for BluetoothManager {
    fn default() -> Self {
        // This shouldn't be called directly - use new()
        panic!("BluetoothManager::default() not supported - use BluetoothManager::new()")
    }
}