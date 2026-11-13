use tauri::{State, command};
use crate::AppState;

#[command]
pub fn get_eq_presets(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db = &state.db;
    let presets = db.get_eq_presets().map_err(|e| e.to_string())?;
    Ok(presets.into_iter().map(|(name, bands)| {
        serde_json::json!({
            "name": name,
            "bands": bands,
        })
    }).collect())
}

#[command]
pub fn save_eq_preset(state: State<'_, AppState>, name: String, bands: String) -> Result<(), String> {
    let db = &state.db;
    db.save_eq_preset(&name, &bands).map_err(|e| e.to_string())
}

#[command]
pub fn delete_eq_preset(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let db = &state.db;
    db.delete_eq_preset(&name).map_err(|e| e.to_string())
}

#[command]
pub fn apply_eq_preset(state: State<'_, AppState>, address: String, name: String) -> Result<(), String> {
    let db = &state.db;
    let presets = db.get_eq_presets().map_err(|e| e.to_string())?;
    let preset = presets.iter().find(|(n, _)| n == &name);
    if let Some((_, bands)) = preset {
        let protocol = &state.protocol;
        let band_values: Vec<i8> = bands.split(',')
            .filter_map(|b| b.trim().parse().ok())
            .collect();
        for (i, gain) in band_values.iter().enumerate() {
            let _ = protocol.set_eq_band_cmd(i as u8, *gain);
        }
    }
    Ok(())
}

#[command]
pub fn set_eq_band(state: State<'_, AppState>, address: String, band: u8, gain: i8) -> Result<(), String> {
    let protocol = &state.protocol;
    let _ = protocol.set_eq_band_cmd(band, gain);
    Ok(())
}
