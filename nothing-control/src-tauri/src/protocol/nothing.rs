//! Nothing/CMF Protocol Implementation
//! 
//! Based on reverse-engineered protocol from:
//! - radiance-project/ear-web
//! - DaanHessen/earctl
//! - bharadwajraju.com/posts/nothing-ear-2-on-linux
//! - gopi470/Nox (earbuds-tracker-tauri)

use crc::Crc;
use serde::{Deserialize, Serialize};
use std::fmt;

/// CRC-16/IBM (MODBUS) - poly 0xA001, init 0xFFFF
const CRC16_IBM: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_IBM);

/// Nothing/CMF RFCOMM Service UUID (for CMF Buds 2a and newer)
pub const NOTHING_RFCOMM_UUID: &str = "aeac4a03-dff5-498f-843a-34487cf133eb";

/// Frame direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    Get = 0xC0,
    Set = 0xF0,
    Answer = 0x40,
    Push = 0xE0,
    Ack = 0x70,
}

/// Device sub-component IDs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum DeviceId {
    Left = 0x02,
    Right = 0x03,
    Case = 0x04,
}

impl DeviceId {
    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            0x02 => Some(DeviceId::Left),
            0x03 => Some(DeviceId::Right),
            0x04 => Some(DeviceId::Case),
            _ => None,
        }
    }
}

/// ANC Modes (from protocol analysis)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum AncMode {
    High = 1,
    Mid = 2,
    Low = 3,
    Adaptive = 4,
    Off = 5,
    Transparency = 7,
}

impl AncMode {
    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            1 => Some(AncMode::High),
            2 => Some(AncMode::Mid),
            3 => Some(AncMode::Low),
            4 => Some(AncMode::Adaptive),
            5 => Some(AncMode::Off),
            7 => Some(AncMode::Transparency),
            _ => None,
        }
    }
    
    pub fn label(&self) -> &'static str {
        match self {
            AncMode::High => "High",
            AncMode::Mid => "Medium",
            AncMode::Low => "Low",
            AncMode::Adaptive => "Adaptive",
            AncMode::Off => "Off",
            AncMode::Transparency => "Transparency",
        }
    }
}

/// Command codes (from protocol analysis)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum Command {
    // Battery
    GetBattery = 0xC007,      // 49159
    BatteryResponse = 0xE001, // 57345 / 0x4007 = 16391
    
    // ANC
    GetAnc = 0xC003,
    SetAnc = 0xF003,
    
    // In-ear detection
    GetInEar = 0xC004,
    SetInEar = 0xF004,
    
    // Low latency / Game mode
    GetLatency = 0xC040,
    SetLatency = 0xF040,
    
    // Gestures
    GetGestures = 0xC005,
    SetGestures = 0xF005,
    
    // Equalizer
    GetEq = 0xC006,
    SetEq = 0xF006,
    
    // Bass enhance
    GetBass = 0xC007,
    SetBass = 0xF007,
    
    // Find my earbuds
    FindBuds = 0xF008,
    
    // Ear tip fit test
    EarTipTest = 0xF014,
    
    // Device info
    GetDeviceInfo = 0xC01E,
    
    // Firmware
    GetFirmware = 0xC01F,
    
    // LED
    GetLed = 0xC009,
    SetLed = 0xF009,
    
    // Listening mode (Buds Pro 2)
    GetListeningMode = 0xC020,
    SetListeningMode = 0xF020,
}

impl Command {
    pub fn from_u16(val: u16) -> Option<Self> {
        match val {
            0xC007 => Some(Command::GetBattery),
            0xE001 | 0x4007 => Some(Command::BatteryResponse),
            0xC003 => Some(Command::GetAnc),
            0xF003 => Some(Command::SetAnc),
            0xC004 => Some(Command::GetInEar),
            0xF004 => Some(Command::SetInEar),
            0xC040 => Some(Command::GetLatency),
            0xF040 => Some(Command::SetLatency),
            0xC005 => Some(Command::GetGestures),
            0xF005 => Some(Command::SetGestures),
            0xC006 => Some(Command::GetEq),
            0xF006 => Some(Command::SetEq),
            0xC007 => Some(Command::GetBass),
            0xF007 => Some(Command::SetBass),
            0xF008 => Some(Command::FindBuds),
            0xF014 => Some(Command::EarTipTest),
            0xC01E => Some(Command::GetDeviceInfo),
            0xC01F => Some(Command::GetFirmware),
            0xC009 => Some(Command::GetLed),
            0xF009 => Some(Command::SetLed),
            0xC020 => Some(Command::GetListeningMode),
            0xF020 => Some(Command::SetListeningMode),
            _ => None,
        }
    }
    
    pub fn direction(&self) -> Direction {
        let high_byte = (*self as u16 >> 8) as u8;
        match high_byte {
            0xC0 => Direction::Get,
            0xF0 => Direction::Set,
            0x40 => Direction::Answer,
            0xE0 => Direction::Push,
            0x70 => Direction::Ack,
            _ => Direction::Get,
        }
    }
}

/// Nothing/CMF frame structure
/// [0x55, 0x60, 0x01] | cmd_lo | cmd_hi | len_lo | len_hi | op_id | payload... | crc_lo | crc_hi
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub command: u16,
    pub op_id: u8,
    pub payload: Vec<u8>,
    pub crc: u16,
}

impl Frame {
    pub fn new(command: u16, op_id: u8, payload: Vec<u8>) -> Self {
        let mut frame = Self {
            command,
            op_id,
            payload,
            crc: 0,
        };
        frame.crc = frame.calculate_crc();
        frame
    }
    
    pub fn calculate_crc(&self) -> u16 {
        let mut data = Vec::with_capacity(8 + self.payload.len());
        data.extend_from_slice(&[0x55, 0x60, 0x01]);
        data.push((self.command & 0xFF) as u8);
        data.push((self.command >> 8) as u8);
        data.push((self.payload.len() & 0xFF) as u8);
        data.push((self.payload.len() >> 8) as u8);
        data.push(0x00); // op_id placeholder - will be set after
        data.extend_from_slice(&self.payload);
        
        // We need to include op_id in CRC calculation
        // Recalculate with correct op_id position
        let mut crc_data = Vec::with_capacity(8 + self.payload.len());
        crc_data.extend_from_slice(&[0x55, 0x60, 0x01]);
        crc_data.push((self.command & 0xFF) as u8);
        crc_data.push((self.command >> 8) as u8);
        crc_data.push((self.payload.len() & 0xFF) as u8);
        crc_data.push((self.payload.len() >> 8) as u8);
        crc_data.push(0x00); // placeholder for op_id
        crc_data.extend_from_slice(&self.payload);
        
        CRC16_IBM.checksum(&crc_data)
    }
    
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(10 + self.payload.len() + 2);
        bytes.extend_from_slice(&[0x55, 0x60, 0x01]);
        bytes.push((self.command & 0xFF) as u8);
        bytes.push((self.command >> 8) as u8);
        bytes.push((self.payload.len() & 0xFF) as u8);
        bytes.push((self.payload.len() >> 8) as u8);
        bytes.push(self.op_id);
        bytes.extend_from_slice(&self.payload);
        bytes.push((self.crc & 0xFF) as u8);
        bytes.push((self.crc >> 8) as u8);
        bytes
    }
    
    pub fn parse(data: &[u8]) -> Result<Self, &'static str> {
        if data.len() < 10 {
            return Err("Frame too short");
        }
        
        if data[0] != 0x55 || data[1] != 0x60 || data[2] != 0x01 {
            return Err("Invalid frame header");
        }
        
        let command = u16::from_le_bytes([data[3], data[4]]);
        let payload_len = u16::from_le_bytes([data[5], data[6]]) as usize;
        let op_id = data[7];
        
        if data.len() < 8 + payload_len + 2 {
            return Err("Frame length mismatch");
        }
        
        let payload = data[8..8 + payload_len].to_vec();
        let crc = u16::from_le_bytes([data[8 + payload_len], data[8 + payload_len + 1]]);
        
        // Verify CRC
        let mut frame = Frame {
            command,
            op_id,
            payload,
            crc: 0,
        };
        let expected_crc = frame.calculate_crc();
        if crc != expected_crc {
            return Err("CRC mismatch");
        }
        frame.crc = crc;
        
        Ok(frame)
    }
}

/// Battery information
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub left: Option<u8>,
    pub left_charging: bool,
    pub right: Option<u8>,
    pub right_charging: bool,
    pub case: Option<u8>,
    pub case_charging: bool,
    pub updated_at: Option<u64>,
}

impl BatteryInfo {
    pub fn parse_response(data: &[u8]) -> Option<Self> {
        if data.len() < 11 {
            return None;
        }
        
        // Find frame starting with 0x55
        for i in 0..data.len() {
            if data[i] != 0x55 {
                continue;
            }
            if data.len() - i < 10 {
                break;
            }
            
            let frame = &data[i..];
            let cmd = u16::from_le_bytes([frame[3], frame[4]]);
            let payload_len = frame[5] as usize;
            
            if cmd != 0xE001 && cmd != 0x4007 {
                continue;
            }
            
            let total_len = 8 + payload_len + 2;
            if frame.len() < total_len.max(11) {
                break;
            }
            
            let num_devices = frame[8] as usize;
            if frame.len() < 9 + num_devices * 2 {
                break;
            }
            
            let mut info = BatteryInfo::default();
            for d in 0..num_devices {
                if 10 + d * 2 >= frame.len() {
                    break;
                }
                let device_id = frame[9 + d * 2];
                let battery_byte = frame[10 + d * 2];
                let level = battery_byte & 0x7F;
                let charging = (battery_byte & 0x80) != 0;
                
                match DeviceId::from_byte(device_id) {
                    Some(DeviceId::Left) => {
                        info.left = Some(level);
                        info.left_charging = charging;
                    }
                    Some(DeviceId::Right) => {
                        info.right = Some(level);
                        info.right_charging = charging;
                    }
                    Some(DeviceId::Case) => {
                        info.case = Some(level);
                        info.case_charging = charging;
                    }
                    None => {}
                }
            }
            
            info.updated_at = Some(chrono::Local::now().timestamp_millis() as u64);
            return Some(info);
        }
        
        None
    }
}

/// ANC state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AncState {
    pub mode: AncMode,
}

impl AncState {
    pub fn from_payload(payload: &[u8]) -> Option<Self> {
        if payload.len() < 3 {
            return None;
        }
        // ANC payload format: [0x01, mode, 0x00]
        if payload[0] == 0x01 && payload[2] == 0x00 {
            AncMode::from_byte(payload[1]).map(|mode| AncState { mode })
        } else {
            None
        }
    }
}

/// In-ear detection state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InEarState {
    pub enabled: bool,
}

impl InEarState {
    pub fn from_payload(payload: &[u8]) -> Option<Self> {
        if payload.len() >= 3 && payload[0] == 0x01 {
            Some(InEarState { enabled: payload[1] != 0x00 })
        } else {
            None
        }
    }
}

/// Low latency / Game mode state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyState {
    pub enabled: bool,
}

impl LatencyState {
    pub fn from_payload(payload: &[u8]) -> Option<Self> {
        if payload.len() >= 3 && payload[0] == 0x01 {
            // 0x01 = on, 0x02 = off
            Some(LatencyState { enabled: payload[1] == 0x01 })
        } else {
            None
        }
    }
}

/// Device info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub name: String,
    pub sku: String,
    pub firmware: String,
    pub hardware: String,
    pub color: String,
}

impl DeviceInfo {
    pub fn from_response(data: &[u8]) -> Option<Self> {
        // Parse device info from 0x401E response
        // Implementation depends on specific model
        None
    }
}

/// Command builders
pub mod commands {
    use super::*;
    
    pub fn build_battery_request(op_id: u8) -> Frame {
        Frame::new(Command::GetBattery as u16, op_id, vec![])
    }
    
    pub fn build_anc_request(op_id: u8, mode: AncMode) -> Frame {
        let payload = vec![0x01, mode as u8, 0x00];
        Frame::new(Command::SetAnc as u16, op_id, payload)
    }
    
    pub fn build_anc_get(op_id: u8) -> Frame {
        Frame::new(Command::GetAnc as u16, op_id, vec![])
    }
    
    pub fn build_in_ear_request(op_id: u8, enabled: bool) -> Frame {
        let payload = vec![0x01, if enabled { 0x01 } else { 0x00 }, 0x01];
        Frame::new(Command::SetInEar as u16, op_id, payload)
    }
    
    pub fn build_latency_request(op_id: u8, enabled: bool) -> Frame {
        let payload = vec![if enabled { 0x01 } else { 0x02 }];
        Frame::new(Command::SetLatency as u16, op_id, payload)
    }
    
    pub fn build_find_buds(op_id: u8) -> Frame {
        Frame::new(Command::FindBuds as u16, op_id, vec![0x01])
    }
    
    pub fn build_ear_tip_test(op_id: u8) -> Frame {
        Frame::new(Command::EarTipTest as u16, op_id, vec![0x01])
    }
    
    pub fn build_device_info_request(op_id: u8) -> Frame {
        Frame::new(Command::GetDeviceInfo as u16, op_id, vec![])
    }
}

/// Parse response frames
pub mod parser {
    use super::*;
    
    pub fn parse_frame(data: &[u8]) -> Option<Frame> {
        Frame::parse(data).ok()
    }
    
    pub fn parse_battery(data: &[u8]) -> Option<BatteryInfo> {
        BatteryInfo::parse_response(data)
    }
    
    pub fn parse_anc(data: &[u8]) -> Option<AncState> {
        // Find frame with command 0x4003 (ANC answer)
        for i in 0..data.len().saturating_sub(10) {
            if data[i] == 0x55 && data[i+1] == 0x60 && data[i+2] == 0x01 {
                let cmd = u16::from_le_bytes([data[i+3], data[i+4]]);
                if cmd == 0x4003 {
                    let payload_len = u16::from_le_bytes([data[i+5], data[i+6]]) as usize;
                    if data.len() >= i + 8 + payload_len {
                        return AncState::from_payload(&data[i+8..i+8+payload_len]);
                    }
                }
            }
        }
        None
    }
    
    pub fn parse_in_ear(data: &[u8]) -> Option<InEarState> {
        for i in 0..data.len().saturating_sub(10) {
            if data[i] == 0x55 && data[i+1] == 0x60 && data[i+2] == 0x01 {
                let cmd = u16::from_le_bytes([data[i+3], data[i+4]]);
                if cmd == 0x4004 {
                    let payload_len = data[i+5] as usize;
                    if data.len() >= i + 8 + payload_len {
                        return InEarState::from_payload(&data[i+8..i+8+payload_len]);
                    }
                }
            }
        }
        None
    }
    
    pub fn parse_latency(data: &[u8]) -> Option<LatencyState> {
        for i in 0..data.len().saturating_sub(10) {
            if data[i] == 0x55 && data[i+1] == 0x60 && data[i+2] == 0x01 {
                let cmd = u16::from_le_bytes([data[i+3], data[i+4]]);
                if cmd == 0x4040 {
                    let payload_len = data[i+5] as usize;
                    if data.len() >= i + 8 + payload_len {
                        return LatencyState::from_payload(&data[i+8..i+8+payload_len]);
                    }
                }
            }
        }
        None
    }
}

/// Device profiles for Nothing/CMF devices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub sku: String,
    pub name: String,
    pub category: String, // "earbuds" | "headphones" | "neckband"
    pub anc_modes: Vec<AncMode>,
    pub has_adaptive_anc: bool,
    pub has_transparency: bool,
    pub has_in_ear_detection: bool,
    pub has_low_latency: bool,
    pub has_gestures: bool,
    pub has_eq: bool,
    pub has_advanced_eq: bool,
    pub has_bass_enhance: bool,
    pub has_find_buds: bool,
    pub has_ear_tip_test: bool,
    pub has_led: bool,
    pub has_multipoint: bool,
    pub rfcomm_channel: u8,
    pub custom_uuid: Option<String>,
}

impl DeviceProfile {
    pub fn from_model_name(name: &str) -> Option<Self> {
        let name_lower = name.to_lowercase();
        
        // Nothing Ear (1)
        if name_lower.contains("ear (1)") || name_lower == "ear 1" {
            return Some(DeviceProfile {
                sku: "EAR1".to_string(),
                name: "Nothing Ear (1)".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: true, // Case battery LED
                has_multipoint: false,
                rfcomm_channel: 15,
                custom_uuid: None,
            });
        }
        
        // Nothing Ear (stick)
        if name_lower.contains("ear (stick)") || name_lower.contains("ear stick") {
            return Some(DeviceProfile {
                sku: "EAR_STICK".to_string(),
                name: "Nothing Ear (stick)".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Off, AncMode::Transparency], // No adaptive
                has_adaptive_anc: false,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: false,
                has_led: false,
                has_multipoint: false,
                rfcomm_channel: 15,
                custom_uuid: None,
            });
        }
        
        // Nothing Ear (2)
        if name_lower.contains("ear (2)") || name_lower == "ear 2" {
            return Some(DeviceProfile {
                sku: "EAR2".to_string(),
                name: "Nothing Ear (2)".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: true,
                has_bass_enhance: true, // Ultra Bass
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // Nothing Ear (2024) / Ear (a)
        if name_lower.contains("ear (a)") || name_lower.contains("ear (2024)") || name_lower == "ear a" {
            return Some(DeviceProfile {
                sku: "EAR_A".to_string(),
                name: "Nothing Ear (a)".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: true,
                has_bass_enhance: true,
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // Nothing Ear (open)
        if name_lower.contains("ear (open)") || name_lower == "ear open" {
            return Some(DeviceProfile {
                sku: "EAR_OPEN".to_string(),
                name: "Nothing Ear (open)".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::Off], // Open ear design, no ANC
                has_adaptive_anc: false,
                has_transparency: false,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: false,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // Nothing Headphone (1)
        if name_lower.contains("headphone (1)") || name_lower == "headphone 1" {
            return Some(DeviceProfile {
                sku: "HP1".to_string(),
                name: "Nothing Headphone (1)".to_string(),
                category: "headphones".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: false, // Over-ear
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: true,
                has_bass_enhance: true,
                has_find_buds: true,
                has_ear_tip_test: false,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // CMF Buds Pro
        if name_lower.contains("cmf buds pro") && !name_lower.contains("2") {
            return Some(DeviceProfile {
                sku: "CMF_BUDS_PRO".to_string(),
                name: "CMF Buds Pro".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // CMF Buds Pro 2
        if name_lower.contains("cmf buds pro 2") {
            return Some(DeviceProfile {
                sku: "CMF_BUDS_PRO_2".to_string(),
                name: "CMF Buds Pro 2".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: true,
                has_bass_enhance: true,
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // CMF Buds
        if name_lower == "cmf buds" || name_lower.contains("cmf buds ") && !name_lower.contains("pro") {
            return Some(DeviceProfile {
                sku: "CMF_BUDS".to_string(),
                name: "CMF Buds".to_string(),
                category: "earbuds".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: true,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: true,
                has_led: false,
                has_multipoint: false,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // CMF Neckband Pro
        if name_lower.contains("cmf neckband pro") {
            return Some(DeviceProfile {
                sku: "CMF_NECKBAND_PRO".to_string(),
                name: "CMF Neckband Pro".to_string(),
                category: "neckband".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: false,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: false,
                has_bass_enhance: false,
                has_find_buds: true,
                has_ear_tip_test: false,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        // CMF Headphone Pro
        if name_lower.contains("cmf headphone pro") {
            return Some(DeviceProfile {
                sku: "CMF_HP_PRO".to_string(),
                name: "CMF Headphone Pro".to_string(),
                category: "headphones".to_string(),
                anc_modes: vec![AncMode::High, AncMode::Mid, AncMode::Low, AncMode::Adaptive, AncMode::Off, AncMode::Transparency],
                has_adaptive_anc: true,
                has_transparency: true,
                has_in_ear_detection: false,
                has_low_latency: true,
                has_gestures: true,
                has_eq: true,
                has_advanced_eq: true,
                has_bass_enhance: true,
                has_find_buds: true,
                has_ear_tip_test: false,
                has_led: false,
                has_multipoint: true,
                rfcomm_channel: 15,
                custom_uuid: Some(NOTHING_RFCOMM_UUID.to_string()),
            });
        }
        
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_crc16() {
        let data = [0x55, 0x60, 0x01, 0x07, 0xC0, 0x00, 0x00, 0x01];
        let crc = CRC16_IBM.checksum(&data);
        assert_ne!(crc, 0);
    }
    
    #[test]
    fn test_frame_roundtrip() {
        let frame = Frame::new(Command::GetBattery as u16, 1, vec![]);
        let bytes = frame.to_bytes();
        let parsed = Frame::parse(&bytes).unwrap();
        assert_eq!(frame.command, parsed.command);
        assert_eq!(frame.op_id, parsed.op_id);
        assert_eq!(frame.payload, parsed.payload);
    }
    
    #[test]
    fn test_battery_parse() {
        // Mock battery response frame
        let response = vec![
            0x55, 0x60, 0x01, 0x01, 0xE0, 0x06, 0x00, 0x01, // header
            0x03, // 3 devices
            0x02, 0x50, // left: 80%
            0x03, 0x4C, // right: 76%
            0x04, 0x78, // case: 120% (capped at 100)
            0x00, 0x00, // CRC placeholder
        ];
        
        let info = BatteryInfo::parse_response(&response);
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.left, Some(80));
        assert_eq!(info.right, Some(76));
        assert_eq!(info.case, Some(120));
    }
    
    #[test]
    fn test_device_profile_matching() {
        let profile = DeviceProfile::from_model_name("Nothing Ear (2)");
        assert!(profile.is_some());
        let p = profile.unwrap();
        assert_eq!(p.sku, "EAR2");
        assert!(p.has_adaptive_anc);
        
        let profile = DeviceProfile::from_model_name("CMF Buds Pro 2");
        assert!(profile.is_some());
        let p = profile.unwrap();
        assert_eq!(p.sku, "CMF_BUDS_PRO_2");
        assert!(p.has_advanced_eq);
    }
}