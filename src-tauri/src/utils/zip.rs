//! ZIP utility for diagnostics export

use zip::write::FileOptions;
use std::io::Write;

pub fn create_diagnostics_zip(
    device_mac: &str,
    main_log: &str,
    bridge_log: &str,
    bluetooth_info: &str,
    frame_log: &[crate::bluetooth::models::FrameLogEntry],
    battery_history: &[crate::bluetooth::models::BatteryRecord],
) -> anyhow::Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    
    // Main log
    zip.start_file("main.log", options)?;
    zip.write_all(main_log.as_bytes())?;
    
    // Bridge log
    zip.start_file("bridge.log", options)?;
    zip.write_all(bridge_log.as_bytes())?;
    
    // Bluetooth info
    zip.start_file("bluetooth_info.txt", options)?;
    zip.write_all(bluetooth_info.as_bytes())?;
    
    // Frame log as JSON
    zip.start_file("frame_log.json", options)?;
    let frames_json = serde_json::to_string_pretty(frame_log)?;
    zip.write_all(frames_json.as_bytes())?;
    
    // Battery history as CSV
    zip.start_file("battery_history.csv", options)?;
    let mut csv = String::from("timestamp,left_pct,right_pct,case_pct,charging\n");
    for record in battery_history {
        csv.push_str(&format!("{},{},{},{},{}\n",
            record.timestamp.to_rfc3339(),
            record.left_pct.map_or("".to_string(), |v| v.to_string()),
            record.right_pct.map_or("".to_string(), |v| v.to_string()),
            record.case_pct.map_or("".to_string(), |v| v.to_string()),
            record.charging as i32
        ));
    }
    zip.write_all(csv.as_bytes())?;
    
    // Device info
    zip.start_file("device_info.json", options)?;
    let device_info = serde_json::json!({
        "mac": device_mac,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "app_version": env!("CARGO_PKG_VERSION"),
    });
    zip.write_all(serde_json::to_string_pretty(&device_info)?.as_bytes())?;
    
    zip.finish()?;
    Ok(buffer)
}