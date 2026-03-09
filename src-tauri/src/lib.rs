use tauri::{Listener, Manager};

mod instance_registry_handler;
mod instance_registry_service;
mod lima_config;
mod lima_config_handler;
mod lima_config_service;
mod lima_handler;
mod lima_instance_handler;
mod lima_instance_service;
mod lima_service;
mod state;
mod terminal_manager;
mod tray_handler;
mod yaml_handler;

pub use lima_service::find_lima_executable;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    tauri_plugin_log::log::LevelFilter::Debug
                } else {
                    tauri_plugin_log::log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(state::AppState {
                last_tray_menu_refresh: std::sync::Mutex::new(
                    std::time::Instant::now() - std::time::Duration::from_secs(60),
                ),
                is_window_visible: std::sync::atomic::AtomicBool::new(true),
                is_window_focused: std::sync::atomic::AtomicBool::new(true),
            });
            let pty_manager = terminal_manager::PtyManager::new();
            app.manage(pty_manager);

            let pty_manager = app.state::<terminal_manager::PtyManager>().inner().clone();
            let handle = app.handle().clone();
            handle.listen("pty-input", move |event| {
                #[derive(serde::Deserialize)]
                struct PtyInputPayload {
                    #[serde(rename = "sessionId")]
                    session_id: String,
                    data: String,
                }

                if let Ok(payload) = serde_json::from_str::<PtyInputPayload>(event.payload()) {
                    if let Err(e) = pty_manager.write(&payload.session_id, &payload.data) {
                        log::error!("Failed to write to PTY: {}", e);
                    }
                } else {
                    log::error!("Failed to parse pty-input payload: {}", event.payload());
                }
            });

            tray_handler::setup_tray(app)?;
            tray_handler::setup_listeners(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
                let handle = window.app_handle();
                let state = handle.state::<state::AppState>();
                state.on_window_close_requested();

                log::debug!("Window close requested - hiding window and updating AppState");
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = tray_handler::refresh_tray_menu(&h).await;
                });
            } else if let tauri::WindowEvent::Focused(focused) = event {
                let handle = window.app_handle();
                let state = handle.state::<state::AppState>();
                state.on_window_focused(*focused);

                log::debug!("Window focus changed: focused={}", focused);
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = tray_handler::refresh_tray_menu(&h).await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            lima_handler::lima_version_cmd,
            lima_handler::get_system_capabilities_cmd,
            lima_config_handler::read_lima_yaml_cmd,
            lima_config_handler::write_lima_yaml_cmd,
            lima_config_handler::get_default_yolobox_config_yaml_cmd,
            lima_config_handler::convert_config_to_yaml_cmd,
            lima_config_handler::get_host_memory_gib_cmd,
            lima_config_handler::get_lima_guest_home_cmd,
            lima_config_handler::is_directory_cmd,
            lima_config_handler::add_mount_cmd,
            lima_config_handler::remove_mount_cmd,
            lima_config_handler::copy_file_to_guest_cmd,
            instance_registry_handler::get_all_yolo_instances_cmd,
            instance_registry_handler::is_instance_registered_cmd,
            instance_registry_handler::get_instance_disk_usage_cmd,
            instance_registry_handler::get_instance_ip_cmd,
            instance_registry_handler::get_instance_uptime_cmd,
            instance_registry_handler::get_instance_guest_diagnostics_cmd,
            lima_instance_handler::create_lima_instance_cmd,
            lima_instance_handler::start_lima_instance_cmd,
            lima_instance_handler::stop_lima_instance_cmd,
            lima_instance_handler::delete_lima_instance_cmd,
            terminal_manager::spawn_pty_cmd,
            terminal_manager::attach_pty_cmd,
            terminal_manager::write_pty_cmd,
            terminal_manager::resize_pty_cmd,
            terminal_manager::close_pty_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
