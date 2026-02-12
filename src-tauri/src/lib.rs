mod pty;

use std::sync::Mutex;
use tauri::{ipc::Channel, State};

struct AppState {
    pty: Mutex<Option<pty::PtyHandle>>,
}

#[tauri::command]
fn spawn_shell(
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
    on_data: Channel<Vec<u8>>,
) -> Result<(), String> {
    let handle = pty::PtyHandle::spawn(cols, rows, on_data)?;
    *state.pty.lock().map_err(|e| e.to_string())? = Some(handle);
    Ok(())
}

#[tauri::command]
fn write_pty(state: State<'_, AppState>, data: Vec<u8>) -> Result<(), String> {
    state
        .pty
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .ok_or("PTY not spawned")?
        .write(&data)
}

#[tauri::command]
fn resize_pty(state: State<'_, AppState>, cols: u16, rows: u16) -> Result<(), String> {
    state
        .pty
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .ok_or("PTY not spawned")?
        .resize(cols, rows)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pty: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![spawn_shell, write_pty, resize_pty,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
