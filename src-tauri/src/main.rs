#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use soundcontrol_lib::run_app;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            soundcontrol_lib::commands::settings::get_settings,
            soundcontrol_lib::commands::settings::update_setting,
            soundcontrol_lib::commands::bluetooth::scan_devices,
            soundcontrol_lib::commands::bluetooth::connect_device,
            soundcontrol_lib::commands::bluetooth::disconnect_device,
            soundcontrol_lib::commands::bluetooth::get_bluetooth_state,
            soundcontrol_lib::commands::device::get_device_info,
            soundcontrol_lib::commands::device::set_anc_mode,
            soundcontrol_lib::commands::device::set_transparency,
            soundcontrol_lib::commands::device::set_adaptive_noise,
            soundcontrol_lib::commands::device::set_wind_noise,
            soundcontrol_lib::commands::device::set_game_mode,
            soundcontrol_lib::commands::device::set_ldac,
            soundcontrol_lib::commands::device::set_multipoint,
            soundcontrol_lib::commands::device::set_bass_enhance,
            soundcontrol_lib::commands::device::set_wearing_detection,
            soundcontrol_lib::commands::device::set_easy_chat,
            soundcontrol_lib::commands::device::set_auto_power_off,
            soundcontrol_lib::commands::device::set_find_buds,
            soundcontrol_lib::commands::device::set_ear_tip_test,
            soundcontrol_lib::commands::device::set_gestures,
            soundcontrol_lib::commands::device::get_battery_levels,
            soundcontrol_lib::commands::eq::get_eq_presets,
            soundcontrol_lib::commands::eq::save_eq_preset,
            soundcontrol_lib::commands::eq::delete_eq_preset,
            soundcontrol_lib::commands::eq::apply_eq_preset,
            soundcontrol_lib::commands::eq::set_eq_band,
            soundcontrol_lib::commands::diagnostics::get_battery_history,
            soundcontrol_lib::commands::diagnostics::get_frame_log,
            soundcontrol_lib::commands::diagnostics::export_diagnostics,
            soundcontrol_lib::commands::diagnostics::check_firmware_update,
            soundcontrol_lib::commands::system::register_hotkey,
            soundcontrol_lib::commands::system::unregister_hotkey,
            soundcontrol_lib::commands::system::get_hotkeys,
            soundcontrol_lib::commands::system::show_window,
            soundcontrol_lib::commands::system::minimize_window,
            soundcontrol_lib::commands::system::quit_app,
            soundcontrol_lib::commands::system::check_for_updates,
        ])
        .setup(|app| {
            soundcontrol_lib::tasks::start_background_tasks(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
