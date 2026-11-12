//! Linux Bluetooth implementation using BlueZ D-Bus (bluer)

use bluer::{Adapter, AdapterEvent, Address, Session};
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::bluetooth::models::{BluetoothDevice, DeviceSession};
use crate::protocol::DeviceProfile;
use anyhow::{Result, anyhow};
use tracing::{debug, info, warn, error};

pub struct LinuxBluetooth {
    session: Session,
    adapter: Adapter,
    connections: Arc<Mutex<HashMap<String, RfcommConnection>>>,
}

struct RfcommConnection {
    socket: bluer::rfcomm::Socket,
    rx_buffer: Vec<u8>,
}

impl LinuxBluetooth {
    pub async fn new() -> Result<Self> {
        let session = Session::new().await?;
        let adapter = session.default_adapter().await?;
        
        // Power on adapter
        adapter.set_powered(true).await?;
        
        info!("Linux Bluetooth initialized with adapter: {}", adapter.name());
        
        Ok(Self {
            session,
            adapter,
            connections: Arc::new(Mutex::new(HashMap::new())),
        })
    }
    
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>> {
        let mut devices = Vec::new();
        
        // Get paired devices
        let paired_devices = adapter.device_ids().await?;
        
        for device_id in paired_devices {
            let device = adapter.device(device_id).await?;
            
            let props = device.properties().await?;
            let address = props.address.unwrap_or_default();
            let name = props.name;
            let paired = props.paired.unwrap_or(false);
            let connected = props.connected.unwrap_or(false);
            let rssi = props.rssi;
            
            // Filter for Soundcore devices (check name)
            let is_soundcore = name.as_ref()
                .map(|n| n.to_lowercase().contains("soundcore"))
                .unwrap_or(false);
            
            if is_soundcore || paired {
                devices.push(BluetoothDevice {
                    mac: address.to_string(),
                    name,
                    paired,
                    connected,
                    rssi,
                    device_class: props.class,
                });
            }
        }
        
        Ok(devices)
    }
    
    pub async fn connect(&self, mac: &str) -> Result<(u8, Option<String>), String> {
        let address: Address = mac.parse()
            .map_err(|_| format!("Invalid MAC address: {}", mac))?;
        let device = self.adapter.device(address).await?;
        
        // Ensure paired
        let props = device.properties().await?;
        if !props.paired.unwrap_or(false) {
            return Err("Device not paired. Pair in system Bluetooth settings first.".to_string());
        }
        
        // Connect if not connected
        if !props.connected.unwrap_or(false) {
            device.connect().await?;
            
            // Wait for connection
            let mut events = device.events().await?;
            while let Some(event) = events.next().await {
                if let bluer::DeviceEvent::PropertyChanged(prop) = event {
                    if prop == "Connected" {
                        let props = device.properties().await?;
                        if props.connected.unwrap_or(false) {
                            break;
                        }
                    }
                }
            }
        }
        
        // Probe RFCOMM channels
        let (channel, model_name) = self.probe_rfcomm_channels(&device).await?;
        
        // Create RFCOMM socket
        let socket = bluer::rfcomm::Socket::new().await?;
        socket.connect(&address, channel).await?;
        socket.set_nonblocking(true)?;
        
        let connection = RfcommConnection {
            socket,
            rx_buffer: Vec::new(),
        };
        
        // Store connection
        {
            let mut conns = self.connections.lock().await;
            conns.insert(mac.to_uppercase(), connection);
        }
        
        Ok((channel, Some(model_name)))
    }
    
    async fn probe_rfcomm_channels(&self, device: &bluer::Device) -> Result<(u8, String), String> {
        let channels = [4, 10, 12, 15, 30, 1, 2, 3, 5, 6, 7, 8, 9, 11, 13, 14, 16, 17, 18, 19, 20];
        let address = device.address();
        
        for channel in channels {
            debug!("Probing channel {} for {}", channel, address);
            
            match self.try_handshake_on_channel(device, channel).await {
                Ok(model) => {
                    info!("Handshake successful on channel {} for {}: {}", channel, address, model);
                    return Ok((channel, model));
                }
                Err(e) => {
                    debug!("Handshake failed on channel {}: {}", channel, e);
                    continue;
                }
            }
        }
        
        Err("No valid RFCOMM channel found".to_string())
    }
    
    async fn try_handshake_on_channel(&self, device: &bluer::Device, channel: u8) -> Result<String, String> {
        let address = device.address();
        
        // Connect RFCOMM socket
        let socket = bluer::rfcomm::Socket::new().await?;
        socket.connect(&address, channel).await?;
        socket.set_nonblocking(true)?;
        
        // Send handshake using openscq30-lib format
        let handshake_frame = self.build_handshake_frame()?;
        socket.send(&handshake_frame).await?;
        
        // Wait for response with timeout
        let mut buffer = vec![0u8; 512];
        let result = tokio::time::timeout(std::time::Duration::from_millis(2000), async {
            loop {
                match socket.recv(&mut buffer).await {
                    Ok(n) if n > 0 => {
                        let response = &buffer[..n];
                        if let Ok(frame) = self.parse_frame(response) {
                            if frame.command == 0x401E || frame.command == 0x4007 { // Device info or battery response
                                return self.parse_device_model(&frame.payload);
                            }
                        }
                    }
                    Ok(_) => continue,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        continue;
                    }
                    Err(e) => return Err(anyhow!("Socket error: {}", e)),
                }
            }
        }).await;
        
        match result {
            Ok(Ok(model)) => Ok(model),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("Handshake timeout".to_string()),
        }
    }
    
    fn build_handshake_frame(&self) -> Result<Vec<u8>, String> {
        // Build openscq30 handshake frame: 55 60 01 | cmd_lo cmd_hi | len_lo len_hi | op_id | payload | crc_lo crc_hi
        // Device info request: 0xC01E (GetDeviceInfo)
        let cmd = 0xC01E_u16;
        let payload = vec![];
        let op_id = 0x01;
        
        let mut frame = vec![
            0x55, 0x60, 0x01,
            (cmd & 0xFF) as u8, (cmd >> 8) as u8,
            0x00, 0x00, // payload length = 0
            0x00, // op_id placeholder
        ];
        frame[7] = 0x01; // op_id
        
        // Calculate CRC-16/IBM
        let crc = self.calculate_crc16(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);
        
        Ok(frame)
    }
    
    fn calculate_crc16(&self, data: &[u8]) -> u16 {
        const POLY: u16 = 0xA001;
        let mut crc: u16 = 0xFFFF;
        for &byte in data {
            crc ^= byte as u16;
            for _ in 0..8 {
                if (crc & 1) != 0 {
                    crc = (crc >> 1) ^ 0xA001;
                } else {
                    crc >>= 1;
                }
            }
        }
        crc
    }
    
    fn parse_frame(&self, data: &[u8]) -> Result<ParsedFrame, String> {
        if data.len() < 10 {
            return Err("Frame too short".to_string());
        }
        
        if data[0] != 0x55 || data[1] != 0x60 || data[2] != 0x01 {
            return Err("Invalid frame header".to_string());
        }
        
        let command = u16::from_le_bytes([data[3], data[4]]);
        let payload_len = u16::from_le_bytes([data[5], data[6]]) as usize;
        
        if data.len() < 8 + payload_len + 2 {
            return Err("Frame length mismatch".to_string());
        }
        
        let payload = data[8..8 + payload_len].to_vec();
        
        Ok(ParsedFrame {
            command,
            payload,
            raw: data.to_vec(),
        })
    }
    
    fn parse_device_model(&self, payload: &[u8]) -> Result<String, String> {
        if payload.is_empty() {
            return Err("Empty payload".to_string());
        }
        
        // Try to extract model name from payload
        // This is a simplified parser - actual implementation depends on the response format
        if payload.len() >= 10 {
            let model_bytes = &payload[2..10];
            let model = String::from_utf8_lossy(model_bytes)
                .trim_end_matches('\0')
                .trim_end_matches(' ')
                .to_string();
            if !model.is_empty() {
                return Ok(model);
            }
        }
        
        Err("Could not parse model".to_string())
    }
    
    pub async fn disconnect(&self, mac: &str) -> Result<(), String> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(mut conn) = conns.remove(&mac) {
            let _ = conn.socket.close().await;
        }
        
        Ok(())
    }
    
    pub async fn send_frame(&self, mac: &str, frame: &[u8]) -> Result<(), String> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(conn) = conns.get_mut(&mac) {
            conn.socket.send(frame).await
                .map_err(|e| format!("Failed to send frame: {}", e))?;
            Ok(())
        } else {
            Err("No active connection".to_string())
        }
    }
    
    pub async fn receive_frame(&self, mac: &str, timeout_ms: u64) -> Result<Vec<u8>, String> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(conn) = conns.get_mut(&mac) {
            let mut buffer = vec![0u8; 512];
            
            let result = tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), async {
                loop {
                    match conn.socket.recv(&mut buffer).await {
                        Ok(n) if n > 0 => {
                            return Ok(buffer[..n].to_vec());
                        }
                        Ok(_) => continue,
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                            continue;
                        }
                        Err(e) => return Err(anyhow!("Socket error: {}", e)),
                    }
                }
            }).await;
            
            match result {
                Ok(Ok(frame)) => Ok(frame),
                Ok(Err(e)) => Err(e),
                Err(_) => Err("Receive timeout".to_string()),
            }
        } else {
            Err("No active connection".to_string())
        }
    }
}

// Stubs for non-Linux targets
#[cfg(not(target_os = "linux"))]
pub struct LinuxBluetooth;

#[cfg(not(target_os = "linux"))]
impl LinuxBluetooth {
    pub async fn new() -> Result<Self> {
        Err(anyhow::anyhow!("LinuxBluetooth only available on Linux"))
    }
    
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>> {
        Ok(vec![])
    }
    
    pub async fn connect(&self, _mac: &str) -> Result<(u8, Option<String>), String> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn disconnect(&self, _mac: &str) -> Result<(), String> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn send_frame(&self, _mac: &str, _frame: &[u8]) -> Result<(), String> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn receive_frame(&self, _mac: &str, _timeout_ms: u64) -> Result<Vec<u8>, String> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
}

struct ParsedFrame {
    command: u16,
    payload: Vec<u8>,
    raw: Vec<u8>,
}