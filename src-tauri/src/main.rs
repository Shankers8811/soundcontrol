#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use soundcontrol::run_app;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            soundcontrol::commands::settings::get_settings,
            soundcontrol::commands::settings::update_setting,
            soundcontrol::commands::bluetooth::scan_devices,
            soundcontrol::commands::bluetooth::connect_device,
            soundcontrol::commands::bluetooth::disconnect_device,
            soundcontrol::commands::bluetooth::get_bluetooth_state,
            soundcontrol::commands::device::get_device_info,
            soundcontrol::commands::device::set_anc_mode,
            soundcontrol::commands::device::set_transparency,
            soundcontrol::commands::device::set_adaptive_noise,
            soundcontrol::commands::device::set_wind_noise,
            soundcontrol::commands::device::set_game_mode,
            soundcontrol::commands::device::set_ldac,
            soundcontrol::commands::device::set_multipoint,
            soundcontrol::commands::device::set_bass_enhance,
            soundcontrol::commands::device::set_wearing_detection,
            soundcontrol::commands::device::set_easy_chat,
            soundcontrol::commands::device::set_auto_power_off,
            soundcontrol::commands::device::set_find_buds,
            soundcontrol::commands::device::set_ear_tip_test,
            soundcontrol::commands::device::set_gestures,
            soundcontrol::commands::device::get_battery_levels,
            soundcontrol::commands::eq::get_eq_presets,
            soundcontrol::commands::eq::save_eq_preset,
            soundcontrol::commands::eq::delete_eq_preset,
            soundcontrol::commands::eq::apply_eq_preset,
            soundcontrol::commands::eq::set_eq_band,
            soundcontrol::commands::diagnostics::get_battery_history,
            soundcontrol::commands::diagnostics::get_frame_log,
            soundcontrol::commands::diagnostics::export_diagnostics,
            soundcontrol::commands::diagnostics::check_firmware_update,
            soundcontrol::commands::system::register_hotkey,
            soundcontrol::commands::system::unregister_hotkey,
            soundcontrol::commands::system::get_hotkeys,
            soundcontrol::commands::system::show_window,
            soundcontrol::commands::system::minimize_window,
            soundcontrol::commands::system::quit_app,
            soundcontrol::commands::system::check_for_updates,
        ])
        .setup(|app| {
            soundcontrol::tasks::start_background_tasks(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
