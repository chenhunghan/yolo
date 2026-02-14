mod pty;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{ipc::Channel, Manager, State};

struct AppState {
    sessions: Mutex<HashMap<String, pty::PtyHandle>>,
}

#[derive(serde::Serialize)]
struct SessionInfo {
    id: String,
    alive: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SavedSession {
    id: String,
    shell: String,
    cwd: String,
}

#[tauri::command]
fn spawn_shell(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<Vec<u8>>,
    cwd: Option<String>,
) -> Result<(), String> {
    let handle = pty::PtyHandle::spawn(cols, rows, on_data, cwd)?;
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(session_id, handle);
    Ok(())
}

#[tauri::command]
fn attach_shell(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<Vec<u8>>,
) -> Result<(), String> {
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .get(&session_id)
        .ok_or("Session not found")?
        .attach(on_data, cols, rows)
}

#[tauri::command]
fn detach_shell(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .get(&session_id)
        .ok_or("Session not found")?
        .detach();
    Ok(())
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(id, handle)| SessionInfo {
            id: id.clone(),
            alive: handle.is_alive(),
        })
        .collect())
}

#[tauri::command]
fn write_pty(state: State<'_, AppState>, session_id: String, data: Vec<u8>) -> Result<(), String> {
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .get(&session_id)
        .ok_or("Session not found")?
        .write(&data)
}

#[tauri::command]
fn resize_pty(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .get(&session_id)
        .ok_or("Session not found")?
        .resize(cols, rows)
}

#[tauri::command]
fn get_saved_sessions(app: tauri::AppHandle) -> Result<Vec<SavedSession>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = data_dir.join("sessions.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_sessions(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let sessions = match state.sessions.lock() {
        Ok(s) => s,
        Err(_) => return,
    };

    let saved: Vec<SavedSession> = sessions
        .iter()
        .filter(|(_, h)| h.is_alive())
        .map(|(id, h)| SavedSession {
            id: id.clone(),
            shell: h.shell().to_string(),
            cwd: h.get_cwd().unwrap_or_else(|| h.initial_cwd().to_string()),
        })
        .collect();

    drop(sessions);

    if saved.is_empty() {
        return;
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&data_dir);
        let path = data_dir.join("sessions.json");
        if let Ok(json) = serde_json::to_string(&saved) {
            let _ = std::fs::write(&path, json);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            sessions: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            spawn_shell,
            attach_shell,
            detach_shell,
            list_sessions,
            write_pty,
            resize_pty,
            get_saved_sessions,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let handle = app.handle().clone();
    let _ = ctrlc::set_handler(move || {
        save_sessions(&handle);
        std::process::exit(0);
    });

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            save_sessions(app_handle);
        }
    });
}
