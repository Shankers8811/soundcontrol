//! Logging setup

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use std::path::PathBuf;
use dirs;

pub fn init() {
    // Console layer
    let console_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_thread_ids(true)
        .with_level(true);
    
    // File layer
    let log_dir = get_log_dir();
    let _ = std::fs::create_dir_all(&log_dir);
    let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, "soundcontrol.log");
    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .json();
    
    // Env filter
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,soundcontrol=debug,tauri=warn"));
    
    tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer)
        .with(file_layer)
        .init();
}

fn get_log_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap())
        .join("SoundControl")
        .join("logs")
}