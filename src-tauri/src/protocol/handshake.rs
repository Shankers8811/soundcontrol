use crate::protocol::ProtocolHandler;

impl ProtocolHandler {
    pub fn get_battery_cmd(&self) -> Vec<u8> {
        // Get battery command for Soundcore devices
        self.encode_frame(0x0100, 0xC0, &[0x02])
    }

    pub fn get_anc_cmd(&self, mode: u8) -> Vec<u8> {
        self.encode_frame(0x0101, 0xF0, &[mode])
    }

    pub fn set_eq_band_cmd(&self, band: u8, gain: i8) -> Vec<u8> {
        let mut payload = vec![band];
        payload.push(gain as u8);
        self.encode_frame(0x0102, 0xF0, &payload)
    }

    pub fn set_game_mode_cmd(&self, enabled: bool) -> Vec<u8> {
        self.encode_frame(0x0103, 0xF0, &[if enabled { 0x01 } else { 0x00 }])
    }

    pub fn set_ldac_cmd(&self, enabled: bool) -> Vec<u8> {
        self.encode_frame(0x0104, 0xF0, &[if enabled { 0x01 } else { 0x00 }])
    }

    pub fn set_multipoint_cmd(&self, enabled: bool) -> Vec<u8> {
        self.encode_frame(0x0105, 0xF0, &[if enabled { 0x01 } else { 0x00 }])
    }
}
