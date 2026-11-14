use super::models::*;
use super::BluetoothManager;
use crate::protocol::{DeviceInfo, DeviceProfile};
use bluer::Adapter;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct LinuxBluetooth {
    device_cache: Mutex<HashMap<String, DeviceProfile>>,
    connected_device: Mutex<Option<bluer::Device>>,
}

impl LinuxBluetooth {
    pub fn new() -> Self {
        Self {
            device_cache: Mutex::new(HashMap::new()),
            connected_device: Mutex::new(None),
        }
    }

    pub async fn scan(&self) -> Result<Vec<KnownDevice>, String> {
        let session = bluer::Session::new().await
            .map_err(|e| format!("Failed to create BlueZ session: {}", e))?;
        let adapter = session.default_adapter().await
            .map_err(|e| format!("No Bluetooth adapter: {}", e))?;
        adapter.set_powered(true).await
            .map_err(|e| format!("Failed to power on adapter: {}", e))?;
        adapter.start_discovery().await
            .map_err(|e| format!("Failed to start discovery: {}", e))?;
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        adapter.stop_discovery().await
            .map_err(|e| format!("Failed to stop discovery: {}", e))?;
        let devices = adapter.devices().await
            .map_err(|e| format!("Failed to get devices: {}", e))?;
        let mut result = Vec::new();
        for device in devices {
            if let Ok(name) = device.name().await {
                if let Some(name_str) = name {
                    if name_str.to_lowercase().contains("soundcore")
                        || name_str.to_lowercase().contains("anker")
                        || name_str.to_lowercase().contains("life")
                        || name_str.to_lowercase().contains("liberty")
                        || name_str.to_lowercase().contains("dot")
                        || name_str.to_lowercase().contains("vortex")
                    {
                        let address = device.address().to_string();
                        let connected = device.connected().await.unwrap_or(false);
                        result.push(KnownDevice {
                            address: address.clone(),
                            name: name_str,
                            profile: None,
                            connected: connected,
                        });
                    }
                }
            }
        }
        Ok(result)
    }

    pub async fn connect(&self, address: &str) -> Result<(), String> {
        let session = bluer::Session::new().await
            .map_err(|e| format!("Failed to create BlueZ session: {}", e))?;
        let adapter = session.default_adapter().await
            .map_err(|e| format!("No Bluetooth adapter: {}", e))?;
        let device = adapter.device(address)
            .map_err(|e| format!("Device not found: {}", e))?;
        device.connect().await
            .map_err(|e| format!("Failed to connect: {}", e))?;
        *self.connected_device.lock().unwrap() = Some(device);
        Ok(())
    }

    pub async fn disconnect(&self, address: &str) -> Result<(), String> {
        *self.connected_device.lock().unwrap() = None;
        Ok(())
    }

    pub fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        let device = self.connected_device.lock().unwrap().clone();
        let device = device.ok_or("No connected Bluetooth device")?;
        futures::executor::block_on(device.write(frame))
            .map_err(|e| format!("Failed to send frame over Bluetooth: {}", e))?;
        Ok(())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        let session = bluer::Session::new().await
            .map_err(|e| format!("Failed to create BlueZ session: {}", e))?;
        let adapter = session.default_adapter().await
            .map_err(|e| format!("No Bluetooth adapter: {}", e))?;
        if adapter.powered().await.unwrap_or(false) {
            Ok("powered_on".to_string())
        } else {
            Ok("powered_off".to_string())
        }
    }
}

