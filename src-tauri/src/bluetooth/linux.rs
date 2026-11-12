//! Linux Bluetooth implementation using BlueZ D-Bus (bluer)

#[cfg(target_os = "linux")]
use bluer::{Adapter, AdapterEvent, Address, Session};
#[cfg(target_os = "linux")]
use futures::StreamExt;
#[cfg(target_os = "linux")]
use tokio::sync::mpsc;
#[cfg(target_os = "linux")]
use std::collections::HashMap;
#[cfg(target_os = "linux")]
use std::sync::Arc;
#[cfg(target_os = "linux")]
use tokio::sync::Mutex;
#[cfg(target_os = "linux")]
use crate::bluetooth::protocol::*;
#[cfg(target_os = "linux")]
use crate::bluetooth::models::*;
#[cfg(target_os = "linux")]
use anyhow::{Result, anyhow};
#[cfg(target_os = "linux")]
use tracing::{debug, info, warn, error};

#[cfg(target_os = "linux")]
#[derive(Debug)]
struct RfcommConnection {
    socket: bluer::rfcomm::Socket,
    rx_buffer: Vec<u8>,
}

#[cfg(target_os = "linux")]
pub struct LinuxBluetooth {
    session: Session,
    adapter: Adapter,
    connections: Arc<Mutex<HashMap<String, RfcommConnection>>>,
    rx_channels: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Vec<u8>>>>>,
}

#[cfg(target_os = "linux")]
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
            rx_channels: Arc::new(Mutex::new(HashMap::new())),
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
            let uuids = props.uuids.unwrap_or_default();
            
            // Filter for Soundcore devices (check name or UUIDs)
            let is_soundcore = name.as_ref()
                .map(|n| n.to_lowercase().contains("soundcore") || n.to_lowercase().contains("anker"))
                .unwrap_or(false)
                || uuids.iter().any(|u| u.to_string().contains("00001101")); // SPP UUID
            
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
    
    pub async fn connect(&self, mac: &str) -> Result<(u8, Option<String>)> {
        let address: Address = mac.parse()?;
        let device = self.adapter.device(address).await?;
        
        // Ensure paired
        let props = device.properties().await?;
        if !props.paired.unwrap_or(false) {
            return Err(anyhow!("Device not paired. Pair in system Bluetooth settings first."));
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
        let (channel, sku) = self.probe_rfcomm_channels(&device).await?;
        
        // Create RFCOMM socket
        let socket = bluer::rfcomm::Socket::new().await?;
        socket.connect(&address, channel).await?;
        
        // Set non-blocking
        socket.set_nonblocking(true)?;
        
        let connection = RfcommConnection {
            socket,
            rx_buffer: Vec::new(),
        };
        
        // Create RX channel for this device
        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
        
        // Store connection and RX channel
        {
            let mut conns = self.connections.lock().await;
            conns.insert(mac.to_uppercase(), connection);
        }
        {
            let mut channels = self.rx_channels.lock().await;
            channels.insert(mac.to_uppercase(), tx);
        }
        
        // Start receive task
        self.start_receive_task(mac.to_uppercase(), rx).await?;
        
        Ok((channel, sku))
    }
    
    async fn probe_rfcomm_channels(&self, device: &bluer::Device) -> Result<(u8, Option<String>)> {
        let channels = [4, 10, 12, 15, 30, 1, 2, 3, 5, 6, 7, 8, 9, 11, 13, 14, 16, 17, 18, 19, 20];
        let address = device.address();
        
        for channel in channels {
            debug!("Probing channel {} for {}", channel, address);
            
            match self.try_handshake_on_channel(device, channel).await {
                Ok(sku) => {
                    info!("Handshake successful on channel {} for {}: SKU={}", channel, address, sku);
                    return Ok((channel, Some(sku)));
                }
                Err(e) => {
                    debug!("Handshake failed on channel {}: {}", channel, e);
                    continue;
                }
            }
        }
        
        Err(anyhow!("No valid RFCOMM channel found"))
    }
    
    async fn try_handshake_on_channel(&self, device: &bluer::Device, channel: u8) -> Result<String> {
        let address = device.address();
        
        // Connect RFCOMM socket
        let socket = bluer::rfcomm::Socket::new().await?;
        socket.connect(&address, channel).await?;
        socket.set_nonblocking(true)?;
        
        // Send handshake
        let handshake_frame = build_handshake();
        socket.send(&handshake_frame).await?;
        
        // Wait for response with timeout
        let mut buffer = vec![0u8; 512];
        let result = tokio::time::timeout(std::time::Duration::from_millis(2000), async {
            loop {
                match socket.recv(&mut buffer).await {
                    Ok(n) if n > 0 => {
                        let response = &buffer[..n];
                        if let Ok(frame) = parse_frame(response) {
                            if frame.category == 0x01 && frame.command == 0x01 {
                                return parse_sku_from_handshake(&frame.payload);
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
            Ok(Ok(sku)) => Ok(sku),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow!("Handshake timeout")),
        }
    }
    
    async fn start_receive_task(&self, mac: String, mut rx: mpsc::UnboundedReceiver<Vec<u8>>) -> Result<()> {
        let connections = self.connections.clone();
        let mac_clone = mac.clone();
        
        tokio::spawn(async move {
            while let Some(_data) = rx.recv().await {
                // This task handles incoming frames from the platform layer
                // The actual receive loop is in the connection management
            }
        });
        
        Ok(())
    }
    
    pub async fn disconnect(&self, mac: &str) -> Result<()> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(mut conn) = conns.remove(&mac) {
            // Close socket
            let _ = conn.socket.close().await;
        }
        
        let mut channels = self.rx_channels.lock().await;
        channels.remove(&mac);
        
        Ok(())
    }
    
    pub async fn send_frame(&self, mac: &str, frame: &[u8]) -> Result<()> {
        let mac = mac.to_uppercase();
        
        let mut conns = self.connections.lock().await;
        if let Some(conn) = conns.get_mut(&mac) {
            conn.socket.send(frame).await?;
            Ok(())
        } else {
            Err(anyhow!("No active connection for {}", mac))
        }
    }
    
    pub async fn receive_frame(&self, mac: &str, timeout_ms: u64) -> Result<Vec<u8>> {
        let mac = mac.to_uppercase();
        
        // Get or create RX channel
        let rx = {
            let mut channels = self.rx_channels.lock().await;
            if let Some(tx) = channels.get(&mac) {
                let (new_tx, new_rx) = mpsc::unbounded_channel();
                channels.insert(mac.clone(), new_tx);
                new_rx
            } else {
                return Err(anyhow!("No active connection for {}", mac));
            }
        };
        
        // Wait for frame with timeout
        match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), rx.recv()).await {
            Ok(Some(frame)) => Ok(frame),
            Ok(None) => Err(anyhow!("Channel closed")),
            Err(_) => Err(anyhow!("Receive timeout")),
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
    
    pub async fn connect(&self, _mac: &str) -> Result<(u8, Option<String>)> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn disconnect(&self, _mac: &str) -> Result<()> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn send_frame(&self, _mac: &str, _frame: &[u8]) -> Result<()> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
    
    pub async fn receive_frame(&self, _mac: &str, _timeout_ms: u64) -> Result<Vec<u8>> {
        Err(anyhow::anyhow!("Not on Linux"))
    }
}