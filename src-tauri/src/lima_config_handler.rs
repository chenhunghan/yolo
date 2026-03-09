use crate::lima_config::{get_default_yolobox_config, LimaConfig};
use crate::lima_config_service;
use sysinfo::System;
use tauri::AppHandle;

/// Read the Lima YAML configuration for a specific instance by name.
/// If the file does not exist, generate the default yolobox config.
#[tauri::command]
pub async fn read_lima_yaml_cmd(
    app: AppHandle,
    instance_name: String,
) -> Result<LimaConfig, String> {
    let yaml_path = lima_config_service::get_lima_yaml_path(&app, &instance_name)?;

    if yaml_path.exists() {
        let yaml_content = std::fs::read_to_string(&yaml_path)
            .map_err(|e| format!("Failed to read lima.yaml: {}", e))?;
        return LimaConfig::from_yaml(&yaml_content)
            .map_err(|e| format!("Failed to parse YAML: {}", e));
    }

    get_default_yolobox_config(&app)
}

/// Write YAML config for a specific instance
#[tauri::command]
pub async fn write_lima_yaml_cmd(
    app: AppHandle,
    config: LimaConfig,
    instance_name: String,
) -> Result<(), String> {
    lima_config_service::write_lima_yaml(&app, &config, &instance_name)
}

/// Get the default YoloBox Lima configuration
#[tauri::command]
pub async fn get_default_yolobox_config_yaml_cmd(app: AppHandle) -> Result<LimaConfig, String> {
    get_default_yolobox_config(&app)
}

/// Get the Lima guest home directory path for the current host user
#[tauri::command]
pub async fn get_lima_guest_home_cmd() -> Result<String, String> {
    let host_user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .map_err(|_| "Could not determine host username".to_string())?;
    Ok(format!("/home/{host_user}.linux"))
}

/// Get total host memory in GiB
#[tauri::command]
pub async fn get_host_memory_gib_cmd() -> Result<u32, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let host_memory_gib = (sys.total_memory() / (1024 * 1024 * 1024)) as u32;
    Ok(host_memory_gib)
}

/// Convert LimaConfig to YAML string for display
#[tauri::command]
pub async fn convert_config_to_yaml_cmd(config: LimaConfig) -> Result<String, String> {
    config
        .to_yaml_pretty()
        .map_err(|e| format!("Failed to convert config to YAML: {}", e))
}

/// Check if a path is a directory
#[tauri::command]
pub async fn is_directory_cmd(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).is_dir())
}

/// Add a mount to an instance by editing the YAML directly.
/// Instance must be stopped.
#[tauri::command]
pub async fn add_mount_cmd(
    app: AppHandle,
    instance_name: String,
    host_path: String,
    mount_point: String,
    writable: bool,
) -> Result<(), String> {
    let yaml_path = lima_config_service::get_lima_yaml_path(&app, &instance_name)?;
    let yaml_content = std::fs::read_to_string(&yaml_path)
        .map_err(|e| format!("Failed to read lima.yaml: {}", e))?;
    let mut config =
        LimaConfig::from_yaml(&yaml_content).map_err(|e| format!("Failed to parse YAML: {}", e))?;

    let new_mount = crate::lima_config::Mount {
        location: Some(host_path),
        mount_point: Some(mount_point),
        writable: Some(writable),
    };

    match config.mounts {
        Some(ref mut mounts) => mounts.push(new_mount),
        None => config.mounts = Some(vec![new_mount]),
    }

    lima_config_service::write_lima_yaml(&app, &config, &instance_name)
}

/// Remove a mount from an instance by editing the YAML directly.
/// Instance must be stopped.
#[tauri::command]
pub async fn remove_mount_cmd(
    app: AppHandle,
    instance_name: String,
    host_path: String,
) -> Result<(), String> {
    let yaml_path = lima_config_service::get_lima_yaml_path(&app, &instance_name)?;
    let yaml_content = std::fs::read_to_string(&yaml_path)
        .map_err(|e| format!("Failed to read lima.yaml: {}", e))?;
    let mut config =
        LimaConfig::from_yaml(&yaml_content).map_err(|e| format!("Failed to parse YAML: {}", e))?;

    if let Some(ref mut mounts) = config.mounts {
        mounts.retain(|m| m.location.as_deref() != Some(&host_path));
    }

    lima_config_service::write_lima_yaml(&app, &config, &instance_name)
}

/// Copy a file from host to guest via `limactl cp`
#[tauri::command]
pub async fn copy_file_to_guest_cmd(
    instance_name: String,
    host_path: String,
    guest_path: String,
) -> Result<(), String> {
    let lima_cmd = crate::find_lima_executable().ok_or("Lima (limactl) not found")?;

    let dest = format!("{}:{}", instance_name, guest_path);
    let output = tokio::process::Command::new(&lima_cmd)
        .args(["cp", &host_path, &dest])
        .output()
        .await
        .map_err(|e| format!("Failed to run limactl cp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to copy file: {}", stderr));
    }

    Ok(())
}
