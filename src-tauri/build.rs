fn main() {
    tauri_build::build();
    println!("cargo:rerun-if-changed=../devices.toml");
    println!("cargo:rerun-if-changed=build.rs");
}