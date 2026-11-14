mod models;
mod linux;
mod windows;

pub use models::*;
#[cfg(target_os = "linux")]
pub use linux::*;
#[cfg(target_os = "windows")]
pub use windows::*;

use crate::protocol::DeviceProfile;

#[derive(Debug)]
pub struct BluetoothManager {
    #[cfg(target_os = "linux")]
    linux: Option<linux::LinuxBluetooth>,
    #[cfg(target_os = "windows")]
    windows: Option<windows::WindowsBluetooth>,
    known_devices: std::sync::Mutex<Vec<KnownDevice>>,
}

#[derive(Debug, Clone)]
pub struct KnownDevice {
    pub address: String,
    pub name: String,
    pub profile: Option<DeviceProfile>,
    pub connected: bool,
}

impl BluetoothManager {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "linux")]
            linux: Some(linux::LinuxBluetooth::new()),
            #[cfg(target_os = "windows")]
            windows: Some(windows::WindowsBluetooth::new()),
            known_devices: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub async fn scan_devices(&self) -> Result<Vec<KnownDevice>, String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.scan().await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.scan().await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn connect_device(&self, address: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.connect(address, 15).await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.connect(address).await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn disconnect_device(&self, address: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.disconnect(address).await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.disconnect(address).await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.get_state().await;
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.get_state().await;
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            if let Some(linux) = &self.linux {
                return linux.send_frame(frame);
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(windows) = &self.windows {
                return windows.send_frame(frame);
            }
        }
        Err("Bluetooth not supported on this platform".to_string())
    }

    pub fn add_known_device(&self, device: KnownDevice) {
        self.known_devices.lock().unwrap().push(device);
    }

    pub fn get_known_devices(&self) -> Vec<KnownDevice> {
        self.known_devices.lock().unwrap().clone()
    }
}



