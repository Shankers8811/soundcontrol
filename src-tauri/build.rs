fn main() {
    println!("cargo:rerun-if-changed=../devices.toml");
    println!("cargo:rerun-if-changed=build.rs");
}
