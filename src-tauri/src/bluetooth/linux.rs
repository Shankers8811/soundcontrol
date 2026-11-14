use super::models::*;
use super::BluetoothManager;
use bluer::{Address, rfcomm::{Socket, SocketAddr, Stream}};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::io::AsyncWriteExt;

pub struct LinuxBluetooth {
    device_cache: Mutex<HashMap<String, DeviceProfile>>,
    connected_stream: Mutex<Option<Stream>>,
}

impl LinuxBluetooth {
    pub fn new() -> Self {
        Self {
            device_cache: Mutex::new(HashMap::new()),
            connected_stream: Mutex::new(None),
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
                        result.push(KnownDevice {
                            address: address.clone(),
                            name: name_str,
                            profile: None,
                            connected: false,
                        });
                    }
                }
            }
        }
        Ok(result)
    }

    pub async fn connect(&self, address: &str, channel: u8) -> Result<(), String> {
        let addr: Address = address.parse()
            .map_err(|e| format!("Invalid Bluetooth address: {}", e))?;
        let sa = SocketAddr::new(addr, channel);
        let socket = Socket::new()
            .map_err(|e| format!("Failed to create RFCOMM socket: {}", e))?;
        let stream = socket.connect(sa).await
            .map_err(|e| format!("Failed to connect RFCOMM: {}", e))?;
        *self.connected_stream.lock().unwrap() = Some(stream);
        Ok(())
    }

    pub async fn disconnect(&self, address: &str) -> Result<(), String> {
        *self.connected_stream.lock().unwrap() = None;
        Ok(())
    }

    pub async fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        let mut stream_guard = self.connected_stream.lock().unwrap();
        let stream = stream_guard.as_mut().ok_or("No connected Bluetooth device")?;
        stream.write_all(frame).await
            .map_err(|e| format!("Failed to send frame over Bluetooth: {}", e))?;
        Ok(())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        if self.connected_stream.lock().unwrap().is_some() {
            Ok("powered_on".to_string())
        } else {
            Ok("powered_off".to_string())
        }
    }
}