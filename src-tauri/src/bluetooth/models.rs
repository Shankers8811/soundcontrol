use crate::protocol::DeviceProfile;

#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub address: String,
    pub name: String,
    pub rssi: i16,
    pub profile: Option<DeviceProfile>,
}

#[derive(Debug, Clone)]
pub enum BluetoothEvent {
    DeviceDiscovered(DiscoveredDevice),
    DeviceConnected(String),
    DeviceDisconnected(String),
    BatteryUpdated(String, crate::protocol::BatteryLevel),
    ANCModeChanged(String, String),
}
