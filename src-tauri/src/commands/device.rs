use tauri::{State, command};
use crate::AppState;
use crate::protocol::{DeviceFeature, DeviceProfile};

#[command]
pub async fn get_device_info(state: State<'_, AppState>, address: String) -> Result<serde_json::Value, String> {
    let db = &state.db;
    let state_val = db.get_device_state(&address).unwrap_or_default();
    let profile = match &state_val {
        Some(s) => serde_json::from_str::<DeviceProfile>(s).ok(),
        None => None,
    };

    let mut features = serde_json::Map::new();
    if let Some(ref p) = profile {
        for feature in [
            DeviceFeature::ANC,
            DeviceFeature::Transparency,
            DeviceFeature::Adaptive,
            DeviceFeature::WindNoise,
            DeviceFeature::GameMode,
            DeviceFeature::LDAC,
            DeviceFeature::Multipoint,
            DeviceFeature::BassEnhance,
            DeviceFeature::WearingDetection,
            DeviceFeature::EasyChat,
            DeviceFeature::AutoPowerOff,
            DeviceFeature::FindBuds,
            DeviceFeature::EarTipTest,
            DeviceFeature::CustomGestures,
        ] {
            let key = match feature {
                DeviceFeature::ANC => "anc",
                DeviceFeature::Transparency => "transparency",
                DeviceFeature::Adaptive => "adaptive",
                DeviceFeature::WindNoise => "wind_noise",
                DeviceFeature::GameMode => "game_mode",
                DeviceFeature::LDAC => "ldac",
                DeviceFeature::Multipoint => "multipoint",
                DeviceFeature::BassEnhance => "bass_enhance",
                DeviceFeature::WearingDetection => "wearing_detection",
                DeviceFeature::EasyChat => "easy_chat",
                DeviceFeature::AutoPowerOff => "auto_power_off",
                DeviceFeature::FindBuds => "find_buds",
                DeviceFeature::EarTipTest => "ear_tip_test",
                DeviceFeature::CustomGestures => "custom_gestures",
            };
            features.insert(key.to_string(), serde_json::Value::Bool(p.has_feature(feature)));
        }
    }

    Ok(serde_json::json!({
        "address": address,
        "profile": profile.map(|p| serde_json::json!({
            "name": p.name,
            "model": p.model,
            "anc_modes": p.anc_modes,
            "battery_count": p.battery_count,
            "eq_bands": p.eq_bands,
        })),
        "features": features,
        "connected": state_val.is_some(),
    }))
}

#[command]
pub async fn set_anc_mode(state: State<'_, AppState>, address: String, mode: String) -> Result<(), String> {
    if mode.is_empty() {
        return Err("ANC mode cannot be empty".to_string());
    }
    let protocol = &state.protocol;
    let bluetooth = &state.bluetooth;

    let anc_cmd = protocol.encode_frame(0x0101, 0xF0, &[mode.as_bytes()[0]]);

    let bt = bluetooth.read().await;
    bt.send_frame(&anc_cmd).await.map_err(|e| e.to_string())?;

    let db = &state.db;
    db.log_frame("out", &anc_cmd)?;

    Ok(())
}

#[command]
pub async fn set_transparency(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0106, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_adaptive_noise(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0107, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_wind_noise(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0108, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_game_mode(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0103, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_ldac(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0104, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_multipoint(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0105, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_bass_enhance(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x0109, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_wearing_detection(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010A, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_easy_chat(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010B, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_auto_power_off(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010C, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_find_buds(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010D, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_ear_tip_test(state: State<'_, AppState>, address: String, enabled: bool) -> Result<(), String> {
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010E, 0xF0, &[if enabled { 0x01 } else { 0x00 }]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn set_gestures(state: State<'_, AppState>, address: String, left_gesture: String, right_gesture: String) -> Result<(), String> {
    if left_gesture.is_empty() || right_gesture.is_empty() {
        return Err("Gesture cannot be empty".to_string());
    }
    let protocol = &state.protocol;
    let frame = protocol.encode_frame(0x010F, 0xF0, &[0x01, left_gesture.as_bytes()[0], right_gesture.as_bytes()[0]]);
    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&frame).await.map_err(|e| e.to_string())?;
    let db = &state.db;
    db.log_frame("out", &frame)?;
    Ok(())
}

#[command]
pub async fn get_battery_levels(state: State<'_, AppState>, address: String) -> Result<serde_json::Value, String> {
    let db = &state.db;
    let protocol = &state.protocol;
    let battery_cmd = protocol.get_battery_cmd();
    db.log_frame("out", &battery_cmd)?;

    let bluetooth = &state.bluetooth;
    let bt = bluetooth.read().await;
    bt.send_frame(&battery_cmd).await.map_err(|e| e.to_string())?;

    let device_state = db.get_device_state(&address).unwrap_or_default();
    let single_earbud_mode = device_state.as_deref() == Some("single_earbud");

    Ok(serde_json::json!({
        "address": address,
        "left": null,
        "right": null,
        "case": null,
        "left_charging": false,
        "right_charging": false,
        "case_charging": false,
        "single_earbud_mode": single_earbud_mode,
    }))
}