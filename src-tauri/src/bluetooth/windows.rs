//! Windows Bluetooth implementation using WinRT APIs

#[cfg(target_os = "windows")]
use windows::Devices::Bluetooth::*;
#[cfg(target_os = "windows")]
use windows::Devices::Bluetooth::Rfcomm::*;
#[cfg(target_os = "windows")]
use windows::Devices::Enumeration::*;
#[cfg(target_os = "windows")]
use windows::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Storage::Streams::*;
#[cfg(target_os = "windows")]
use tokio::sync::mpsc;
#[cfg(target_os = "windows")]
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::sync::Arc;
#[cfg(target_os = "windows")]
use tokio::sync::Mutex;
#[cfg(target_os = "windows")]
use crate::bluetooth::protocol::*;
#[cfg(target_os = "windows")]
use crate::bluetooth::models::*;
#[cfg(target_os = "windows")]
use anyhow::{Result, anyhow};
#[cfg(target_os = "windows")]
use tracing::{debug, info, warn, error};

#[cfg(target_os = "windows")]
struct RfcommConnection {
    socket: RfcommSocket,
    writer: DataWriter,
    reader: DataReader,
    rx_sender: mpsc::UnboundedSender<Vec<u8>>,
}

#[cfg(target_os = "windows")]
pub struct WindowsBluetooth {
    connections: Arc<Mutex<HashMap<String, RfcommConnection>>>,
}

#[cfg(target_os = "windows")]
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
        let selector = BluetoothDevice::GetDeviceSelectorFromPairingState(false);
        let device_info_collection = DeviceInformation::FindAllAsyncAqsFilter(&selector).await?;
        
        for i in 0..device_info_collection.Size()? {
            let device_info = device_info_collection.GetAt(i)?;
            let id = device_info.Id()?.to_string();
            
            // Get Bluetooth device from ID
            if let Ok(bt_device) = BluetoothDevice::FromIdAsync(&id).await {
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
                        rssi: None, // Not directly available
                        device_class: None,
                    });
                }
            }
        }
        
        Ok(devices)
    }
    
    pub async fn connect(&self, mac: &str) -> Result<(u8, Option<String>)> {
        // Parse MAC address
        let address = parse_mac_address(mac)?;
        
        // Get Bluetooth device
        let selector = BluetoothDevice::GetDeviceSelectorFromPairingState(false);
        let device_info_collection = DeviceInformation::FindAllAsyncAqsFilter(&selector).await?;
        
        let mut bt_device: Option<BluetoothDevice> = None;
        
        for i in 0..device_info_collection.Size()? {
            let device_info = device_info_collection.GetAt(i)?;
            let id = device_info.Id()?.to_string();
            
            if let Ok(device) = BluetoothDevice::FromIdAsync(&id).await {
                if device.BluetoothAddress()? == address {
                    bt_device = Some(device);
                    break;
                }
            }
        }
        
        let bt_device = bt_device.ok_or_else(|| anyhow!("Device not found: {}", mac))?;
        
        // Ensure paired
        if !bt_device.DeviceInformation()?.Pairing()?.IsPaired()? {
            return Err(anyhow!("Device not paired. Pair in Windows Bluetooth settings first."));
        }
        
        // Connect if not connected
        if bt_device.ConnectionStatus()? != BluetoothConnectionStatus::Connected {
            // Windows handles connection automatically when we open RFCOMM
        }
        
        // Get RFCOMM service
        let rfcomm_services = bt_device.GetRfcommServicesAsync().await?;
        
        if rfcomm_services.Services()?.Size()? == 0 {
            return Err(anyhow!("No RFCOMM services found on device"));
        }
        
        // Probe channels by trying each service
        let services = rfcomm_services.Services()?;
        let mut found_channel = None;
        let mut found_sku = None;
        
        for i in 0..services.Size()? {
            let service = services.GetAt(i)?;
            let channel = service.ConnectionHostName()?.RawName()?.to_string();
            let channel_num = channel.parse::<u8>().unwrap_or(0);
            
            debug!("Trying RFCOMM channel {} for {}", channel_num, mac);
            
            match self.try_handshake_on_service(&service).await {
                Ok(sku) => {
                    info!("Handshake successful on channel {} for {}: SKU={}", channel_num, mac, sku);
                    found_channel = Some(channel_num);
                    found_sku = Some(sku);
                    break;
                }
                Err(e) => {
                    debug!("Handshake failed on channel {}: {}", channel_num, e);
                    continue;
                }
            }
        }
        
        let channel = found_channel.ok_or_else(|| anyhow!("No valid RFCOMM channel found"))?;
        let sku = found_sku;
        
        // Connect to the service
        let service = services.GetAt(0)?; // Use first service, channel already probed
        let socket = RfcommSocket::new()?;
        socket.ConnectAsync(&service.ConnectionHostName()?, &service.ConnectionServiceName()?).await?;
        
        // Create data writer/reader
        let writer = DataWriter::new(&socket.OutputStream()?)?;
        let reader = DataReader::new(&socket.InputStream()?)?;
        reader.InputStreamOptions(InputStreamOptions::Partial)?;
        
        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
        
        let connection = RfcommConnection {
            socket,
            writer,
            reader,
            rx_sender: tx,
        };
        
        // Store connection
        {
            let mut conns = self.connections.lock().await;
            conns.insert(mac.to_uppercase(), connection);
        }
        
        // Start receive task
        self.start_receive_task(mac.to_uppercase(), rx).await?;
        
        Ok((channel, sku))
    }
    
    async fn try_handshake_on_service(&self, service: &RfcommDeviceService) -> Result<String> {
        let socket = RfcommSocket::new()?;
        socket.ConnectAsync(&service.ConnectionHostName()?, &service.ConnectionServiceName()?).await?;
        
        let writer = DataWriter::new(&socket.OutputStream()?)?;
        let reader = DataReader::new(&socket.InputStream()?)?;
        reader.InputStreamOptions(InputStreamOptions::Partial)?;
        
        // Send handshake
        let handshake_frame = build_handshake();
        writer.WriteBytes(&handshake_frame)?;
        writer.StoreAsync().await?;
        
        // Wait for response with timeout
        let mut buffer = vec![0u8; 512];
        let result = tokio::time::timeout(std::time::Duration::from_millis(2000), async {
            loop {
                reader.LoadAsync(512).await?;
                let count = reader.UnconsumedBufferLength()?;
                if count > 0 {
                    reader.ReadBytes(&mut buffer[..count as usize])?;
                    let response = &buffer[..count as usize];
                    if let Ok(frame) = parse_frame(response) {
                        if frame.category == 0x01 && frame.command == 0x01 {
                            return parse_sku_from_handshake(&frame.payload);
                        }
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }).await;
        
        let _ = socket.close().await;
        
        match result {
            Ok(Ok(sku)) => Ok(sku),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow!("Handshake timeout")),
        }
    }
    
    async fn start_receive_task(&self, mac: String, mut rx: mpsc::UnboundedReceiver<Vec<u8>>) -> Result<()> {
        let connections = self.connections.clone();
        let mac_clone = mac.clone();
        
        tokio::spawn(async move {
            // Receive loop would run here
            // For now, we handle reads directly in receive_frame
            while let Some(_) = rx.recv().await {
                // Process incoming frames if needed
            }
        });
        
        Ok(())
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
            conn.writer.StoreAsync().await?;
            Ok(())
        } else {
            Err(anyhow!("No active connection for {}", mac))
        }
    }
    
    pub async fn receive_frame(&self, mac: &str, timeout_ms: u64) -> Result<Vec<u8>> {
        let mac = mac.to_uppercase();
        
        // Read directly from socket
        let conns = self.connections.lock().await;
        let conn = conns.get(&mac).ok_or_else(|| anyhow!("No active connection for {}", mac))?;
        
        let mut buffer = vec![0u8; 512];
        
        let result = tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), async {
            loop {
                conn.reader.LoadAsync(512).await?;
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
            Err(_) => Err(anyhow!("Receive timeout")),
        }
    }
}

#[cfg(target_os = "windows")]
fn parse_mac_address(mac: &str) -> Result<u64> {
    let parts: Vec<&str> = mac.split(':').collect();
    if parts.len() != 6 {
        return Err(anyhow!("Invalid MAC address format"));
    }
    
    let mut address: u64 = 0;
    for (i, part) in parts.iter().enumerate() {
        let byte = u64::from_str_radix(part, 16)?;
        address |= byte << (40 - i * 8);
    }
    
    Ok(address)
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