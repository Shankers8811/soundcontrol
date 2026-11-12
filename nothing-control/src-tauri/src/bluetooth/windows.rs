//! Windows Bluetooth implementation using WinRT APIs

use windows::Devices::Bluetooth::*;
use windows::Devices::Bluetooth::Rfcomm::*;
use windows::Devices::Enumeration::*;
use windows::Foundation::*;
use windows::Storage::Streams::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::bluetooth::models::{BluetoothDevice, DeviceSession};
use anyhow::{Result, anyhow};
use tracing::{debug, info, warn, error};

struct RfcommConnection {
    socket: RfcommSocket,
    writer: DataWriter,
    reader: DataReader,
}

pub struct WindowsBluetooth {
    connections: Arc<Mutex<HashMap<String, RfcommConnection>>>,
}

impl WindowsBluetooth {
    pub async fn new() -> Result<Self> {
        // Initialize WinRT
        windows::Core::Initialize()?;
        
        info!("Windows Bluetooth initialized");
        
        Ok(Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        })
    }
    
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>> {
        let mut devices = Vec::new();
        
        // Find all paired Bluetooth devices
        let selector = BluetoothDevice::GetDeviceSelectorFromPairingState(false)?;
        let device_info_collection = DeviceInformation::FindAllAsyncAqsFilter(&selector)?.await?;
        
        for i in 0..device_info_collection.Size()? {
            let device_info = device_info_collection.GetAt(i)?;
            let id = device_info.Id()?.to_string();
            
            // Get Bluetooth device from ID
            if let Ok(bt_device) = BluetoothDevice::FromIdAsync(&id)?.await {
                let address = bt_device.BluetoothAddress()?;
                let mac = format!("{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                    (address >> 40) as u8,
                    (address >> 32) as u8,
                    (address >> 24) as u8,
                    (address >> 16) as u8,
                    (address >> 8) as u8,
                    address as u8,
                );
                
                let name = bt_device.Name()?.to_string();
                let paired = true; // From selector
                let connected = bt_device.ConnectionStatus()? == BluetoothConnectionStatus::Connected;
                
                // Filter for Soundcore devices
                let is_soundcore = name.to_lowercase().contains("soundcore") 
                    || name.to_lowercase().contains("anker");
                
                if is_soundcore || paired {
                    devices.push(BluetoothDevice {
                        mac,
                        name: Some(name),
                        paired,
                        connected,
                        rssi: None,
                        device_class: None,
                    });
                }
            }
        }
        
        Ok(devices)
    }
    
    pub async fn connect(&self, mac: &str) -> Result<(u8, Option<String>), String> {
        // Parse MAC address
        let address = self.parse_mac_address(mac)?;
        
        // Get Bluetooth device
        let selector = BluetoothDevice::GetDeviceSelectorFromPairingState(false)?;
        let device_info_collection = DeviceInformation::FindAllAsyncAqsFilter(&selector)?.await?;
        
        let mut bt_device: Option<BluetoothDevice> = None;
        
        for i in 0..device_info_collection.Size()? {
            let device_info = device_info_collection.GetAt(i)?;
            let id = device_info.Id()?.to_string();
            
            if let Ok(device) = BluetoothDevice::FromIdAsync(&id)?.await {
                if device.BluetoothAddress()? == address {
                    bt_device = Some(device);
                    break;
                }
            }
        }
        
        let bt_device = bt_device.ok_or_else(|| format!("Device not found: {}", mac))?;
        
        // Ensure paired
        if !bt_device.DeviceInformation()?.Pairing()?.IsPaired()? {
            return Err("Device not paired. Pair in Windows Bluetooth settings first.".to_string());
        }
        
        // Get RFCOMM service
        let rfcomm_services = bt_device.GetRfcommServicesAsync()?.await?;
        
        if rfcomm_services.Services()?.Size()? == 0 {
            return Err("No RFCOMM services found on device".to_string());
        }
        
        // Probe channels by trying each service
        let services = rfcomm_services.Services()?;
        let mut found_channel = None;
        let mut found_model = None;
        
        for i in 0..services.Size()? {
            let service = services.GetAt(i)?;
            let channel = service.ConnectionHostName()?.RawName()?.to_string();
            let channel_num = channel.parse::<u8>().unwrap_or(0);
            
            debug!("Trying RFCOMM channel {} for {}", channel_num, mac);
            
            match self.try_handshake_on_service(&service).await {
                Ok(model) => {
                    info!("Handshake successful on channel {} for {}: {}", channel_num, mac, model);
                    found_channel = Some(channel_num);
                    found_model = Some(model);
                    break;
                }
                Err(e) => {
                    debug!("Handshake failed on channel {}: {}", channel_num, e);
                    continue;
                }
            }
        }
        
        let channel = found_channel.ok_or_else(|| "No valid RFCOMM channel found".to_string())?;
        let model = found_model;
        
        // Connect to the service
        let service = services.GetAt(0)?; // Use first service
        let socket = RfcommSocket::new()?;
        socket.ConnectAsync(&service.ConnectionHostName()?, &service.ConnectionServiceName()?)?.await?;
        
        // Create data writer/reader
        let writer = DataWriter::new(&socket.OutputStream()?)?;
        let reader = DataReader::new(&socket.InputStream()?)?;
        reader.InputStreamOptions(InputStreamOptions::Partial)?;
        
        let connection = RfcommConnection {
            socket,
            writer,
            reader,
        };
        
        // Store connection
        {
            let mut conns = self.connections.lock().await;
            conns.insert(mac.to_uppercase(), connection);
        }
        
        Ok((channel, model))
    }
    
    async fn try_handshake_on_service(&self, service: &RfcommDeviceService) -> Result<String> {
        let socket = RfcommSocket::new()?;
        socket.ConnectAsync(&service.ConnectionHostName()?, &service.ConnectionServiceName()?)?.await?;
        
        let writer = DataWriter::new(&socket.OutputStream()?)?;
        let reader = DataReader::new(&socket.InputStream()?)?;
        reader.InputStreamOptions(InputStreamOptions::Partial)?;
        
        // Send handshake (device info request)
        let handshake_frame = self.build_handshake_frame()?;
        writer.WriteBytes(&handshake_frame)?;
        writer.StoreAsync()?.await?;
        
        // Wait for response with timeout
        let mut buffer = vec![0u8; 512];
        let result = tokio::time::timeout(std::time::Duration::from_millis(2000), async {
            loop {
                reader.LoadAsync(512)?.await?;
                let count = reader.UnconsumedBufferLength()?;
                if count > 0 {
                    reader.ReadBytes(&mut buffer[..count as usize])?;
                    let response = &buffer[..count as usize];
                    if let Ok(frame) = self.parse_frame(response) {
                        if frame.command == 0x401E || frame.command == 0x4007 {
                            return self.parse_device_model(&frame.payload);
                        }
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }).await;
        
        let _ = socket.close().await;
        
        match result {
            Ok(Ok(model)) => Ok(model),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow::anyhow!("Handshake timeout")),
        }
    }
    
    fn build_handshake_frame(&self) -> Result<Vec<u8>> {
        // Build openscq30 handshake frame: 55 60 01 | cmd_lo cmd_hi | len_lo len_hi | op_id | payload | crc_lo crc_hi
        // Device info request: 0xC01E (GetDeviceInfo)
        let cmd = 0xC01E_u16;
        let payload = vec![];
        
        let mut frame = vec![
            0x55, 0x60, 0x01,
            (cmd & 0xFF) as u8, (cmd >> 8) as u8,
            0x00, 0x00, // payload length = 0
            0x01, // op_id
        ];
        
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
    
    fn parse_frame(&self, data: &[u8]) -> Result<ParsedFrame> {
        if data.len() < 10 {
            return Err(anyhow::anyhow!("Frame too short"));
        }
        
        if data[0] != 0x55 || data[1] != 0x60 || data[2] != 0x01 {
            return Err(anyhow::anyhow!("Invalid frame header"));
        }
        
        let command = u16::from_le_bytes([data[3], data[4]]);
        let payload_len = u16::from_le_bytes([data[5], data[6]]) as usize;
        
        if data.len() < 8 + payload_len + 2 {
            return Err(anyhow::anyhow!("Frame length mismatch"));
        }
        
        let payload = data[8..8 + payload_len].to_vec();
        
        Ok(ParsedFrame {
            command,
            payload,
            raw: data.to_vec(),
        })
    }
    
    fn parse_device_model(&self, payload: &[u8]) -> Result<String> {
        if payload.is_empty() {
            return Err(anyhow::anyhow!("Empty payload"));
        }
        
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
        
        Err(anyhow::anyhow!("Could not parse model"))
    }
    
    pub async fn disconnect(&self, mac: &str) -> Result<()> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(conn) = conns.remove(&mac) {
            let _ = conn.socket.close().await;
        }
        
        Ok(())
    }
    
    pub async fn send_frame(&self, mac: &str, frame: &[u8]) -> Result<()> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(conn) = conns.get_mut(&mac) {
            conn.writer.WriteBytes(frame)?;
            conn.writer.StoreAsync()?.await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("No active connection for {}", mac))
        }
    }
    
    pub async fn receive_frame(&self, mac: &str, timeout_ms: u64) -> Result<Vec<u8>> {
        let mac = mac.to_uppercase();
        
        let conns = self.connections.lock().await;
        let conn = conns.get(&mac).ok_or_else(|| anyhow::anyhow!("No active connection for {}", mac))?;
        
        let mut buffer = vec![0u8; 512];
        
        let result = tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), async {
            loop {
                conn.reader.LoadAsync(512)?.await?;
                let count = conn.reader.UnconsumedBufferLength()?;
                if count > 0 {
                    let mut frame_data = vec![0u8; count as usize];
                    conn.reader.ReadBytes(&mut frame_data)?;
                    return Ok(frame_data);
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }).await;
        
        match result {
            Ok(Ok(frame)) => Ok(frame),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow::anyhow!("Receive timeout")),
        }
    }
    
    fn parse_mac_address(&self, mac: &str) -> Result<u64> {
        let parts: Vec<&str> = mac.split(':').collect();
        if parts.len() != 6 {
            return Err(anyhow::anyhow!("Invalid MAC address format"));
        }
        
        let mut address: u64 = 0;
        for (i, part) in parts.iter().enumerate() {
            let byte = u64::from_str_radix(part, 16)?;
            address |= byte << (40 - i * 8);
        }
        
        Ok(address)
    }
}

struct ParsedFrame {
    command: u16,
    payload: Vec<u8>,
    raw: Vec<u8>,
}

// Stubs for non-Windows targets
#[cfg(not(target_os = "windows"))]
pub struct WindowsBluetooth;

#[cfg(not(target_os = "windows"))]
impl WindowsBluetooth {
    pub async fn new() -> Result<Self> {
        Err(anyhow::anyhow!("WindowsBluetooth only available on Windows"))
    }
    
    pub async fn scan_devices(&self) -> Result<Vec<BluetoothDevice>> {
        Ok(vec![])
    }
    
    pub async fn connect(&self, _mac: &str) -> Result<(u8, Option<String>)> {
        Err(anyhow::anyhow!("Not on Windows"))
    }
    
    pub async fn disconnect(&self, _mac: &str) -> Result<()> {
        Err(anyhow::anyhow!("Not on Windows"))
    }
    
    pub async fn send_frame(&self, _mac: &str, _frame: &[u8]) -> Result<()> {
        Err(anyhow::anyhow!("Not on Windows"))
    }
    
    pub async fn receive_frame(&self, _mac: &str, _timeout_ms: u64) -> Result<Vec<u8>> {
        Err(anyhow::anyhow!("Not on Windows"))
    }
}