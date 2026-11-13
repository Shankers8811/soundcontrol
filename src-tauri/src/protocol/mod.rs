mod models;
mod handshake;
mod crc;

pub use models::*;
pub use handshake::*;
pub use crc::*;

use crate::AppState;

#[derive(Debug, Clone)]
pub struct ProtocolHandler {
    pub device_profiles: std::collections::HashMap<String, DeviceProfile>,
}

impl ProtocolHandler {
    pub fn new() -> Self {
        let mut profiles = std::collections::HashMap::new();
        // Load device profiles from embedded TOML
        let toml_str = include_str!("../../../devices.toml");
        if let Ok(value) = toml::from_str::<toml::Value>(toml_str) {
            if let Some(devices) = value.get("devices").and_then(|d| d.as_array()) {
                for device in devices {
                    if let Some(name) = device.get("name").and_then(|n| n.as_str()) {
                        profiles.insert(name.to_lowercase(), DeviceProfile::from_toml(device));
                    }
                }
            }
        }
        Self { device_profiles: profiles }
    }

    pub fn get_profile(&self, device_name: &str) -> Option<&DeviceProfile> {
        self.device_profiles.get(&device_name.to_lowercase())
    }

    pub fn encode_frame(&self, cmd: u16, op: u8, payload: &[u8]) -> Vec<u8> {
        let mut frame = Vec::new();
        // Header: 55 60 01
        frame.push(0x55);
        frame.push(0x60);
        frame.push(0x01);
        // Command
        frame.extend_from_slice(&cmd.to_le_bytes());
        // Length
        frame.extend_from_slice(&(payload.len() as u16 + 1).to_le_bytes()); // +1 for op byte
        // Op
        frame.push(op);
        // Payload
        frame.extend_from_slice(payload);
        // CRC16
        let crc = crc16::compute(&frame[3..]);
        frame.extend_from_slice(&crc.to_le_bytes());
        frame
    }

    pub fn decode_frame(&self, data: &[u8]) -> Option<DecodedFrame> {
        if data.len() < 11 {
            return None;
        }
        if data[0] != 0x55 || data[1] != 0x60 || data[2] != 0x01 {
            return None;
        }
        let cmd = u16::from_le_bytes([data[3], data[4]]);
        let len = u16::from_le_bytes([data[5], data[6]]) as usize;
        let op = data[7];
        if data.len() < 9 + len + 2 {
            return None;
        }
        let payload = data[8..8 + len].to_vec();
        let crc = u16::from_le_bytes([data[8 + len], data[8 + len + 1]]);
        let expected_crc = crc16::compute(&data[3..8 + len]);
        if crc != expected_crc {
            return None;
        }
        Some(DecodedFrame {
            cmd,
            op,
            payload,
        })
    }
}

#[derive(Debug, Clone)]
pub struct DecodedFrame {
    pub cmd: u16,
    pub op: u8,
    pub payload: Vec<u8>,
}
