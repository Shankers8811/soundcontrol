use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Tell cargo to rerun if resources change
    println!("cargo:rerun-if-changed=resources/device_profiles.json");
    println!("cargo:rerun-if-changed=../public/icon-512.png");

    // Embed device profiles
    let profiles_path = PathBuf::from("resources/device_profiles.json");
    if profiles_path.exists() {
        let content = fs::read_to_string(&profiles_path).expect("Failed to read device_profiles.json");
        // Validate JSON
        serde_json::from_str::<serde_json::Value>(&content).expect("Invalid JSON in device_profiles.json");
        println!("cargo:rustc-env=DEVICE_PROFILES_JSON={}", content);
    }

    // Tauri build
    tauri_build::build();
}