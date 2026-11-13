pub mod helpers;

pub fn format_battery(level: Option<u8>) -> String {
    match level {
        Some(l) => format!("{}%", l),
        None => "N/A".to_string(),
    }
}

pub fn is_soundcore_device(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("soundcore") || 
    lower.contains("anker") || 
    lower.contains("life ") ||
    lower.contains("liberty") ||
    lower.contains("dot ") ||
    lower.contains("vortex") ||
    lower.contains("p20") ||
    lower.contains("p30") ||
    lower.contains("p40") ||
    lower.contains("r20") ||
    lower.contains("r30") ||
    lower.contains("r40") ||
    lower.contains("r50")
}
