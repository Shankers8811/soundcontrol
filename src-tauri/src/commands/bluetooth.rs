use tauri::{State, command};
use crate::AppState;
use crate::protocol::DeviceProfile;

#[command]
pub async fn scan_devices(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    let devices = bt.scan_devices().await?;
    
    let mut result = Vec::new();
    for device in devices {
        let profile = &device.profile;
        result.push(serde_json::json!({
            "address": device.address,
            "name": device.name,
            "connected": device.connected,
            "profile": profile.as_ref().map(|p| serde_json::json!({
                "name": p.name,
                "model": p.model,
                "anc_modes": p.anc_modes,
                "supports_transparency": p.supports_transparency,
                "supports_adaptive": p.supports_adaptive,
                "supports_wind_noise": p.supports_wind_noise,
                "supports_game_mode": p.supports_game_mode,
                "supports_ldac": p.supports_ldac,
                "supports_multipoint": p.supports_multipoint,
                "supports_bass_enhance": p.supports_bass_enhance,
                "supports_wearing_detection": p.supports_wearing_detection,
                "supports_easy_chat": p.supports_easy_chat,
                "supports_auto_power_off": p.supports_auto_power_off,
                "supports_find_buds": p.supports_find_buds,
                "supports_ear_tip_test": p.supports_ear_tip_test,
                "supports_custom_gestures": p.supports_custom_gestures,
                "battery_count": p.battery_count,
                "eq_bands": p.eq_bands,
                "rfcomm_channel": p.rfcomm_channel,
            })),
        }));
    }
    Ok(result)
}

#[command]
pub async fn connect_device(state: State<'_, AppState>, address: String) -> Result<(), String> {
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.connect_device(&address).await?;
    Ok(())
}

#[command]
pub async fn disconnect_device(state: State<'_, AppState>, address: String) -> Result<(), String> {
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.disconnect_device(&address).await?;
    Ok(())
}

#[command]
pub async fn get_bluetooth_state(state: State<'_, AppState>) -> Result<String, String> {
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.get_state().await
}
