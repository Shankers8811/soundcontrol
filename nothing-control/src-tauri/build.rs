use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Tell cargo to rerun if resources change
    println!("cargo:rerun-if-changed=assets/devices.toml");
    println!("cargo:rerun-if-changed=../public/icon-512.png");

    // Embed device profiles
    let profiles_path = PathBuf::from("assets/devices.toml");
    if profiles_path.exists() {
        let content = fs::read_to_string(&profiles_path).expect("Failed to read devices.toml");
        // Validate TOML
        toml::from_str::<toml::Value>(&content).expect("Invalid TOML in devices.toml");
        println!("cargo:rustc-env=DEVICE_PROFILES_TOML={}", content);
    }

    // Tauri build
    tauri_build::build();
}