//! Protocol module - Soundcore RFCOMM frame encoding/decoding

use crate::bluetooth::models::*;
use anyhow::{Result, anyhow};
use serde_json::json;
use tracing::{debug, trace};

/// Frame direction
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Tx, // Host to device
    Rx, // Device to host
}

/// Anker/Soundcore frame structure
/// [Header: 2] [Prefix: 3] [Category: 1] [Command: 1] [Length: 2] [Payload: N] [Checksum: 1]
/// TX Header: 0x08 0xEE
/// RX Header: 0x09 0xFF

const TX_HEADER: [u8; 2] = [0x08, 0xEE];
const RX_HEADER: [u8; 2] = [0x09, 0xFF];
const PREFIX: [u8; 3] = [0x00, 0x00, 0x00]; // Usually zeros

/// Calculate additive checksum (sum of all bytes mod 256)
pub fn calculate_checksum(data: &[u8]) -> u8 {
    let sum: u32 = data.iter().map(|&b| b as u32).sum();
    (sum & 0xFF) as u8
}

/// Verify frame checksum
pub fn verify_checksum(frame: &[u8]) -> bool {
    if frame.len() < 2 {
        return false;
    }
    let expected = frame[frame.len() - 1];
    let calculated = calculate_checksum(&frame[..frame.len() - 1]);
    expected == calculated
}

/// Build a complete frame
pub fn build_frame(category: u8, command: u8, payload: &[u8]) -> Vec<u8> {
    let length = payload.len() as u16;
    let mut frame = Vec::with_capacity(2 + 3 + 1 + 1 + 2 + payload.len() + 1);
    
    // Header (TX)
    frame.extend_from_slice(&TX_HEADER);
    // Prefix
    frame.extend_from_slice(&PREFIX);
    // Category
    frame.push(category);
    // Command
    frame.push(command);
    // Length (big endian)
    frame.extend_from_slice(&length.to_be_bytes());
    // Payload
    frame.extend_from_slice(payload);
    // Checksum
    let checksum = calculate_checksum(&frame);
    frame.push(checksum);
    
    frame
}

/// Parse a received frame
pub fn parse_frame(data: &[u8]) -> Result<ParsedFrame> {
    if data.len() < 10 {
        return Err(anyhow!("Frame too short: {} bytes", data.len()));
    }
    
    // Verify header
    if data[0] != RX_HEADER[0] || data[1] != RX_HEADER[1] {
        return Err(anyhow!("Invalid RX header: {:02X} {:02X}", data[0], data[1]));
    }
    
    // Verify checksum
    if !verify_checksum(data) {
        return Err(anyhow!("Checksum mismatch"));
    }
    
    let category = data[5];
    let command = data[6];
    let length = u16::from_be_bytes([data[7], data[8]]) as usize;
    
    if data.len() < 9 + length + 1 {
        return Err(anyhow!("Frame length mismatch: expected {}, got {}", 9 + length + 1, data.len()));
    }
    
    let payload = data[9..9 + length].to_vec();
    
    Ok(ParsedFrame {
        category,
        command,
        payload,
        raw: data.to_vec(),
    })
}

/// Parsed frame structure
#[derive(Debug, Clone)]
pub struct ParsedFrame {
    pub category: u8,
    pub command: u8,
    pub payload: Vec<u8>,
    pub raw: Vec<u8>,
}

impl ParsedFrame {
    /// Get command as hex string (e.g., "01:01")
    pub fn command_hex(&self) -> String {
        format!("{:02X}:{:02X}", self.category, self.command)
    }
    
    /// Decode payload based on command
    pub fn decode(&self) -> serde_json::Value {
        match (self.category, self.command) {
            (0x01, 0x01) => self.decode_handshake(),
            (0x01, 0x03) => self.decode_battery(),
            (0x01, 0x05) => self.decode_firmware(),
            (0x06, 0x01) => self.decode_anc_state(),
            (0x06, 0x81) => self.decode_anc_control(),
            (0x02, 0x81) => self.decode_eq_8band(),
            (0x02, 0x83) => self.decode_eq_10band(),
            (0xFE, 0xFE) => self.decode_custom_eq(),
            (0x01, 0x87) => self.decode_game_mode(),
            (0x10, 0x85) => self.decode_game_mode_variant(),
            (0x01, 0x7F) => self.decode_ldac_query(),
            (0x01, 0xFF) => self.decode_ldac_state(),
            (0x0B, 0x84) => self.decode_dual_connection(),
            (0x02, 0x86) => self.decode_spatial_audio(),
            _ => json!({
                "category": format!("0x{:02X}", self.category),
                "command": format!("0x{:02X}", self.command),
                "payload_hex": hex::encode(&self.payload),
            }),
        }
    }
    
    fn decode_handshake(&self) -> serde_json::Value {
        if self.payload.len() < 20 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        // Parse SKU (usually at offset 2-8)
        let sku_bytes = &self.payload[2..10];
        let sku = String::from_utf8_lossy(sku_bytes).trim_end_matches('\0').to_string();
        
        json!({
            "type": "handshake",
            "sku": sku,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_battery(&self) -> serde_json::Value {
        if self.payload.len() < 4 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        json!({
            "type": "battery",
            "left_pct": self.payload.get(0).copied(),
            "right_pct": self.payload.get(1).copied(),
            "case_pct": self.payload.get(2).copied(),
            "charging_flags": self.payload.get(3).copied(),
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_firmware(&self) -> serde_json::Value {
        if self.payload.len() < 20 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let version = String::from_utf8_lossy(&self.payload[..20]).trim_end_matches('\0').to_string();
        
        json!({
            "type": "firmware",
            "version": version,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_anc_state(&self) -> serde_json::Value {
        json!({
            "type": "anc_state",
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_anc_control(&self) -> serde_json::Value {
        if self.payload.is_empty() {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let mode = self.payload[0];
        let mode_name = match mode {
            0 => "off",
            1 => "anc",
            2 => "transparency",
            3 => "adaptive",
            4 => "wind",
            5 => "scene",
            _ => "unknown",
        };
        
        json!({
            "type": "anc_control",
            "mode": mode,
            "mode_name": mode_name,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_eq_8band(&self) -> serde_json::Value {
        if self.payload.len() < 8 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let bands: Vec<i8> = self.payload[..8].iter().map(|&b| b as i8).collect();
        
        json!({
            "type": "eq_8band",
            "bands": bands,
            "frequencies_hz": [100, 200, 400, 800, 1600, 3200, 6400, 12800],
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_eq_10band(&self) -> serde_json::Value {
        if self.payload.len() < 10 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let bands: Vec<i8> = self.payload[..10].iter().map(|&b| b as i8).collect();
        
        json!({
            "type": "eq_10band",
            "bands": bands,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_custom_eq(&self) -> serde_json::Value {
        if self.payload.len() < 8 {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let bands: Vec<i8> = self.payload[..8].iter().map(|&b| b as i8).collect();
        
        json!({
            "type": "custom_eq",
            "bands": bands,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_game_mode(&self) -> serde_json::Value {
        let enabled = self.payload.get(0).copied().unwrap_or(0) != 0;
        
        json!({
            "type": "game_mode",
            "enabled": enabled,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_game_mode_variant(&self) -> serde_json::Value {
        let enabled = self.payload.get(0).copied().unwrap_or(0) != 0;
        
        json!({
            "type": "game_mode_variant",
            "enabled": enabled,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_ldac_query(&self) -> serde_json::Value {
        let supported = self.payload.get(0).copied().unwrap_or(0) != 0;
        
        json!({
            "type": "ldac_query",
            "supported": supported,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_ldac_state(&self) -> serde_json::Value {
        let enabled = self.payload.get(0).copied().unwrap_or(0) != 0;
        
        json!({
            "type": "ldac_state",
            "enabled": enabled,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_dual_connection(&self) -> serde_json::Value {
        let enabled = self.payload.get(0).copied().unwrap_or(0) != 0;
        
        json!({
            "type": "dual_connection",
            "enabled": enabled,
            "payload_hex": hex::encode(&self.payload),
        })
    }
    
    fn decode_spatial_audio(&self) -> serde_json::Value {
        if self.payload.is_empty() {
            return json!({"raw": hex::encode(&self.payload)});
        }
        
        let mode = self.payload[0];
        let mode_name = match mode {
            0 => "off",
            1 => "music",
            2 => "podcast",
            3 => "movie",
            4 => "gaming",
            5 => "fixed",
            6 => "head_tracking",
            _ => "unknown",
        };
        
        json!({
            "type": "spatial_audio",
            "mode": mode,
            "mode_name": mode_name,
            "payload_hex": hex::encode(&self.payload),
        })
    }
}

/// Command builders for sending frames

/// Build handshake frame (01:01)
pub fn build_handshake() -> Vec<u8> {
    build_frame(0x01, 0x01, &[])
}

/// Build battery query (01:03)
pub fn build_battery_query() -> Vec<u8> {
    build_frame(0x01, 0x03, &[])
}

/// Build firmware query (01:05)
pub fn build_firmware_query() -> Vec<u8> {
    build_frame(0x01, 0x05, &[])
}

/// Build ANC mode frame (06:81)
pub fn build_anc_mode(mode: AncMode, sub_mode: Option<u8>) -> Vec<u8> {
    let mut payload = vec![mode.to_byte()];
    if let Some(sub) = sub_mode {
        payload.push(sub);
    }
    build_frame(0x06, 0x81, &payload)
}

/// Build EQ preset frame (02:81 for 8-band, 02:83 for 10-band)
pub fn build_eq_preset(preset_id: u8, eq_type: &str) -> Vec<u8> {
    let (category, command) = match eq_type {
        "custom_10band" | "factory" => (0x02, 0x83),
        _ => (0x02, 0x81),
    };
    build_frame(category, command, &[preset_id])
}

/// Build custom EQ frame (FE:FE)
pub fn build_custom_eq(bands: &[f32]) -> Vec<u8> {
    let payload: Vec<u8> = bands.iter()
        .take(8)
        .map(|&v| ((v.clamp(-6.0, 6.0) * 10.0).round() as i8) as u8)
        .collect();
    build_frame(0xFE, 0xFE, &payload)
}

/// Build Game Mode frame (01:87 or 10:85)
pub fn build_game_mode(enabled: bool, variant: GameModeVariant) -> Vec<u8> {
    let (category, command) = match variant {
        GameModeVariant::Standard => (0x01, 0x87),
        GameModeVariant::LibertyNC => (0x10, 0x85),
    };
    build_frame(category, command, &[enabled as u8])
}

/// Build LDAC frame (01:FF)
pub fn build_ldac(enabled: bool) -> Vec<u8> {
    build_frame(0x01, 0xFF, &[enabled as u8])
}

/// Build Dual Connection frame (0B:84)
pub fn build_dual_connection(enabled: bool) -> Vec<u8> {
    build_frame(0x0B, 0x84, &[enabled as u8])
}

/// Build Spatial Audio frame (02:86)
pub fn build_spatial_audio(mode: SpatialMode) -> Vec<u8> {
    build_frame(0x02, 0x86, &[mode as u8])
}

/// Decode frame for logging
pub fn decode_for_log(direction: Direction, raw: &[u8]) -> serde_json::Value {
    let parsed = if direction == Direction::Rx {
        parse_frame(raw).ok()
    } else {
        None
    };
    
    let mut result = json!({
        "direction": if direction == Direction::Tx { "tx" } else { "rx" },
        "raw_hex": hex::encode(raw),
    });
    
    if let Some(frame) = parsed {
        result["decoded"] = json!({
            "command": frame.command_hex(),
            "payload": frame.decode(),
        });
    }
    
    result
}