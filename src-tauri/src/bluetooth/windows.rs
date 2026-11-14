use super::models::*;
use crate::protocol::{DeviceInfo, DeviceProfile};
use serialport::SerialPort;
use std::io::{Read, Write};
use std::time::Duration;
use std::sync::Mutex;

pub struct WindowsBluetooth {
    port: Mutex<Option<Box<dyn SerialPort>>>,
}

impl WindowsBluetooth {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
        }
    }

    pub async fn scan(&self) -> Result<Vec<super::models::KnownDevice>, String> {
        let ports = serialport::available_ports()
            .map_err(|e| format!("Failed to list serial ports: {}", e))?;
        let mut result = Vec::new();
        for port in ports {
            if port.port_name.contains("COM") {
                result.push(super::models::KnownDevice {
                    address: port.port_name.clone(),
                    name: format!("Soundcore Device ({})", port.port_name),
                    profile: None,
                    connected: false,
                });
            }
        }
        Ok(result)
    }

    pub async fn connect(&self, address: &str) -> Result<(), String> {
        let mut port = serialport::new(address, 115200)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Failed to open RFCOMM port: {}", e))?;
        port.write_all(&[0x55, 0x60, 0x01, 0x00, 0x01, 0x01, 0xC0, 0x02, 0x00, 0x00])
            .map_err(|e| format!("Failed to send handshake: {}", e))?;
        let mut buf = [0u8; 1024];
        port.read(&mut buf)
            .map_err(|e| format!("Failed to read response: {}", e))?;
        self.port.lock().unwrap().replace(port);
        Ok(())
    }

    pub async fn disconnect(&self, address: &str) -> Result<(), String> {
        self.port.lock().unwrap().take();
        Ok(())
    }

    pub fn send_frame(&self, frame: &[u8]) -> Result<(), String> {
        let mut port = self.port.lock().unwrap();
        let port = port.as_mut().ok_or("No connected Bluetooth device")?;
        port.write_all(frame)
            .map_err(|e| format!("Failed to send frame over Bluetooth: {}", e))?;
        Ok(())
    }

    pub async fn get_state(&self) -> Result<String, String> {
        if self.port.lock().unwrap().is_some() {
            Ok("powered_on".to_string())
        } else {
            Ok("powered_off".to_string())
        }
    }
}