use crate::find_lima_executable;
use crate::lima_config::LimaConfig;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

#[derive(Clone, serde::Serialize)]
struct LimaLogPayload {
    instance_name: String,
    message: String,
    message_id: String,
    timestamp: String,
}

fn create_log_payload(instance_name: String, message: String) -> LimaLogPayload {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let timestamp = now.to_string();
    let message_id = uuid::Uuid::new_v4().to_string();

    LimaLogPayload {
        instance_name,
        message,
        message_id,
        timestamp,
    }
}

pub async fn start_lima_instance(app: AppHandle, instance_name: String) -> Result<String, String> {
    // Emit start event
    app.emit(
        "lima-instance-start",
        create_log_payload(
            instance_name.clone(),
            format!("Starting Lima instance '{}'...", instance_name),
        ),
    )
    .map_err(|e| format!("Failed to emit start event: {}", e))?;

    // Spawn async task to run limactl and stream output
    let app_handle = app.clone();
    let instance_name_clone = instance_name.clone();

    tokio::spawn(async move {
        let lima_cmd = match find_lima_executable() {
            Some(cmd) => cmd,
            None => {
                let _ = app_handle.emit(
                    "lima-instance-start-error",
                    create_log_payload(
                        instance_name_clone.clone(),
                        "Lima (limactl) not found. Please ensure lima is installed in /usr/local/bin, /opt/homebrew/bin, or is in your PATH.".to_string(),
                    ),
                );
                return;
            }
        };

        // Run limactl start command
        let child = TokioCommand::new(&lima_cmd)
            .args(["start", "--tty=false", &instance_name_clone])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start limactl start process: {}", e));

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(
                    "lima-instance-start-error",
                    create_log_payload(instance_name_clone.clone(), e.to_string()),
                );
                return;
            }
        };

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let app_handle_stdout = app_handle.clone();
            let instance_name_stdout = instance_name_clone.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();

                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = app_handle_stdout.emit(
                        "lima-instance-start-stdout",
                        create_log_payload(instance_name_stdout.clone(), line.clone()),
                    );
                }
            });
        }

        // Stream stderr and collect lines for error reporting
        let stderr_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let stderr_task = if let Some(stderr) = child.stderr.take() {
            let app_handle_stderr = app_handle.clone();
            let instance_name_stderr = instance_name_clone.clone();
            let stderr_lines_clone = stderr_lines.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();

                while let Ok(Some(line)) = reader.next_line().await {
                    stderr_lines_clone.lock().await.push(line.clone());
                    let _ = app_handle_stderr.emit(
                        "lima-instance-start-stderr",
                        create_log_payload(instance_name_stderr.clone(), line.clone()),
                    );
                }
            }))
        } else {
            None
        };

        // Wait for process to complete
        let wait_result = child.wait().await;
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        match wait_result {
            Ok(status) => {
                if status.success() {
                    // Copy ~/.claude.json into the guest if marker exists
                    let lima_home = std::env::var("LIMA_HOME").unwrap_or_else(|_| {
                        let home = std::env::var("HOME").unwrap_or_default();
                        format!("{home}/.lima")
                    });
                    let marker = std::path::PathBuf::from(&lima_home)
                        .join(&instance_name_clone)
                        .join(SYNC_CLAUDE_JSON_MARKER);
                    if marker.exists() {
                        if let Ok(home) = std::env::var("HOME") {
                            let host_user = std::env::var("USER")
                                .or_else(|_| std::env::var("LOGNAME"))
                                .unwrap_or_default();
                            let guest_home = format!("/home/{host_user}.linux");

                            // Copy ~/.claude.json (app config/preferences)
                            let claude_json = std::path::PathBuf::from(&home).join(".claude.json");
                            if claude_json.exists() {
                                let dest =
                                    format!("{}:{guest_home}/.claude.json", &instance_name_clone);
                                let _ = TokioCommand::new(&lima_cmd)
                                    .args(["cp", &claude_json.to_string_lossy(), &dest])
                                    .stdin(Stdio::null())
                                    .stdout(Stdio::null())
                                    .stderr(Stdio::null())
                                    .status()
                                    .await;
                            }

                            // Copy ~/.claude/.credentials.json (OAuth tokens)
                            let credentials =
                                std::path::PathBuf::from(&home).join(".claude/.credentials.json");
                            if credentials.exists() {
                                let _ = TokioCommand::new(&lima_cmd)
                                    .args([
                                        "shell",
                                        &instance_name_clone,
                                        "--",
                                        "mkdir",
                                        "-p",
                                        &format!("{guest_home}/.claude"),
                                    ])
                                    .stdin(Stdio::null())
                                    .stdout(Stdio::null())
                                    .stderr(Stdio::null())
                                    .status()
                                    .await;
                                let dest = format!(
                                    "{}:{guest_home}/.claude/.credentials.json",
                                    &instance_name_clone
                                );
                                let _ = TokioCommand::new(&lima_cmd)
                                    .args(["cp", &credentials.to_string_lossy(), &dest])
                                    .stdin(Stdio::null())
                                    .stdout(Stdio::null())
                                    .stderr(Stdio::null())
                                    .status()
                                    .await;
                            }
                        }
                    }

                    let _ = app_handle.emit(
                        "lima-instance-start-success",
                        create_log_payload(instance_name_clone, "Started".to_string()),
                    );
                } else {
                    let collected = stderr_lines.lock().await;
                    let detail = if collected.is_empty() {
                        format!("Exit code: {}", status.code().unwrap_or(-1))
                    } else {
                        collected.join("\n")
                    };
                    let _ = app_handle.emit(
                        "lima-instance-start-error",
                        create_log_payload(instance_name_clone, detail),
                    );
                }
            }
            Err(e) => {
                let error_msg = format!("Failed to wait for limactl start process: {}", e);
                let _ = app_handle.emit(
                    "lima-instance-start-error",
                    create_log_payload(instance_name_clone, error_msg),
                );
            }
        }
    });

    Ok(instance_name)
}

pub async fn stop_lima_instance(app: AppHandle, instance_name: String) -> Result<String, String> {
    // Emit stop event
    app.emit(
        "lima-instance-stop",
        create_log_payload(
            instance_name.clone(),
            format!("Stopping Lima instance '{}'...", instance_name),
        ),
    )
    .map_err(|e| format!("Failed to emit stop event: {}", e))?;

    // Spawn async task to run limactl and stream output
    let app_handle = app.clone();
    let instance_name_clone = instance_name.clone();

    tokio::spawn(async move {
        let lima_cmd = match find_lima_executable() {
            Some(cmd) => cmd,
            None => {
                let _ = app_handle.emit(
                    "lima-instance-stop-error",
                    create_log_payload(
                        instance_name_clone.clone(),
                        "Lima (limactl) not found. Please ensure lima is installed in /usr/local/bin, /opt/homebrew/bin, or is in your PATH.".to_string(),
                    ),
                );
                return;
            }
        };

        // Run limactl stop command
        let child = TokioCommand::new(&lima_cmd)
            .args(["stop", "--tty=false", &instance_name_clone])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start limactl stop process: {}", e));

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(
                    "lima-instance-stop-error",
                    create_log_payload(instance_name_clone.clone(), e.to_string()),
                );
                return;
            }
        };

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let app_handle_stdout = app_handle.clone();
            let instance_name_stdout = instance_name_clone.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = app_handle_stdout.emit(
                        "lima-instance-stop-stdout",
                        create_log_payload(instance_name_stdout.clone(), line),
                    );
                }
            });
        }

        // Stream stderr and collect lines for error reporting
        let stderr_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let stderr_task = if let Some(stderr) = child.stderr.take() {
            let app_handle_stderr = app_handle.clone();
            let instance_name_stderr = instance_name_clone.clone();
            let stderr_lines_clone = stderr_lines.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    stderr_lines_clone.lock().await.push(line.clone());
                    let _ = app_handle_stderr.emit(
                        "lima-instance-stop-stderr",
                        create_log_payload(instance_name_stderr.clone(), line),
                    );
                }
            }))
        } else {
            None
        };

        // Wait for process to complete
        let wait_result = child.wait().await;
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        match wait_result {
            Ok(status) => {
                if status.success() {
                    let _ = app_handle.emit(
                        "lima-instance-stop-success",
                        create_log_payload(instance_name_clone, "Stopped".to_string()),
                    );
                } else {
                    let collected = stderr_lines.lock().await;
                    let detail = if collected.is_empty() {
                        format!("Exit code: {}", status.code().unwrap_or(-1))
                    } else {
                        collected.join("\n")
                    };
                    let _ = app_handle.emit(
                        "lima-instance-stop-error",
                        create_log_payload(instance_name_clone, detail),
                    );
                }
            }
            Err(e) => {
                let error_msg = format!("Failed to wait for limactl stop process: {}", e);
                let _ = app_handle.emit(
                    "lima-instance-stop-error",
                    create_log_payload(instance_name_clone, error_msg),
                );
            }
        }
    });

    Ok(instance_name)
}

pub async fn delete_lima_instance(app: AppHandle, instance_name: String) -> Result<String, String> {
    // Emit delete event
    app.emit(
        "lima-instance-delete",
        create_log_payload(
            instance_name.clone(),
            format!("Deleting Lima instance '{}'...", instance_name),
        ),
    )
    .map_err(|e| format!("Failed to emit delete event: {}", e))?;

    // Spawn async task to run limactl and stream output
    let app_handle = app.clone();
    let instance_name_clone = instance_name.clone();

    tokio::spawn(async move {
        let lima_cmd = match find_lima_executable() {
            Some(cmd) => cmd,
            None => {
                let _ = app_handle.emit(
                    "lima-instance-delete-error",
                    create_log_payload(
                        instance_name_clone.clone(),
                        "Lima (limactl) not found. Please ensure lima is installed in /usr/local/bin, /opt/homebrew/bin, or is in your PATH.".to_string(),
                    ),
                );
                return;
            }
        };

        // Run limactl delete command
        let child = TokioCommand::new(&lima_cmd)
            .args(["delete", &instance_name_clone])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start limactl delete process: {}", e));

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(
                    "lima-instance-delete-error",
                    create_log_payload(instance_name_clone.clone(), e.to_string()),
                );
                return;
            }
        };

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let app_handle_stdout = app_handle.clone();
            let instance_name_stdout = instance_name_clone.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = app_handle_stdout.emit(
                        "lima-instance-delete-stdout",
                        create_log_payload(instance_name_stdout.clone(), line),
                    );
                }
            });
        }

        // Stream stderr and collect lines for error reporting
        let stderr_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let stderr_task = if let Some(stderr) = child.stderr.take() {
            let app_handle_stderr = app_handle.clone();
            let instance_name_stderr = instance_name_clone.clone();
            let stderr_lines_clone = stderr_lines.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    stderr_lines_clone.lock().await.push(line.clone());
                    let _ = app_handle_stderr.emit(
                        "lima-instance-delete-stderr",
                        create_log_payload(instance_name_stderr.clone(), line),
                    );
                }
            }))
        } else {
            None
        };

        // Wait for process to complete
        let wait_result = child.wait().await;
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        match wait_result {
            Ok(status) => {
                if status.success() {
                    let _ = app_handle.emit(
                        "lima-instance-delete-success",
                        create_log_payload(instance_name_clone, "Deleted".to_string()),
                    );
                } else {
                    let collected = stderr_lines.lock().await;
                    let detail = if collected.is_empty() {
                        format!("Exit code: {}", status.code().unwrap_or(-1))
                    } else {
                        collected.join("\n")
                    };
                    let _ = app_handle.emit(
                        "lima-instance-delete-error",
                        create_log_payload(instance_name_clone, detail),
                    );
                }
            }
            Err(e) => {
                let error_msg = format!("Failed to wait for limactl delete process: {}", e);
                let _ = app_handle.emit(
                    "lima-instance-delete-error",
                    create_log_payload(instance_name_clone, error_msg),
                );
            }
        }
    });

    Ok(instance_name)
}

/// Marker file in the Lima instance directory that enables .claude.json sync on start.
const SYNC_CLAUDE_JSON_MARKER: &str = "_yolobox_sync_claude_json";

pub async fn create_lima_instance(
    app: AppHandle,
    config: LimaConfig,
    instance_name: String,
    sync_claude_json: bool,
) -> Result<String, String> {
    // Create a temporary config file for limactl create
    let temp_dir = app
        .path()
        .temp_dir()
        .map_err(|e| format!("Failed to get temp directory: {}", e))?;
    let temp_config_path = temp_dir.join(format!("{}-lima-config.yaml", instance_name));

    // Write config to temp file
    let yaml_content = config
        .to_yaml_pretty()
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;
    std::fs::write(&temp_config_path, yaml_content)
        .map_err(|e| format!("Failed to write temporary config: {}", e))?;

    // Emit create event
    app.emit(
        "lima-instance-create",
        create_log_payload(
            instance_name.clone(),
            format!("Creating Lima instance '{}'...", instance_name),
        ),
    )
    .map_err(|e| format!("Failed to emit create event: {}", e))?;

    // Spawn async task to run limactl and stream output
    let app_handle = app.clone();
    let instance_name_clone = instance_name.clone();
    let temp_config_path_clone = temp_config_path.clone();

    tokio::spawn(async move {
        let lima_cmd = match find_lima_executable() {
            Some(cmd) => cmd,
            None => {
                let _ = app_handle.emit(
                    "lima-instance-create-error",
                    create_log_payload(
                        instance_name_clone,
                        "Lima (limactl) not found. Please ensure lima is installed in /usr/local/bin, /opt/homebrew/bin, or is in your PATH.".to_string(),
                    ),
                );
                return;
            }
        };

        // Run limactl create command with the temporary config file and explicit instance name
        let child = TokioCommand::new(&lima_cmd)
            .args([
                "create",
                "--tty=false",
                "--name",
                &instance_name_clone,
                &temp_config_path_clone.to_string_lossy(),
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start limactl create process: {}", e));

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(
                    "lima-instance-create-error",
                    create_log_payload(instance_name_clone.clone(), e.to_string()),
                );
                return;
            }
        };

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let app_handle_stdout = app_handle.clone();
            let instance_name_stdout = instance_name_clone.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = app_handle_stdout.emit(
                        "lima-instance-create-stdout",
                        create_log_payload(instance_name_stdout.clone(), line),
                    );
                }
            });
        }

        // Stream stderr and collect lines for error reporting
        let stderr_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let stderr_task = if let Some(stderr) = child.stderr.take() {
            let app_handle_stderr = app_handle.clone();
            let instance_name_stderr = instance_name_clone.clone();
            let stderr_lines_clone = stderr_lines.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    stderr_lines_clone.lock().await.push(line.clone());
                    let _ = app_handle_stderr.emit(
                        "lima-instance-create-stderr",
                        create_log_payload(instance_name_stderr.clone(), line),
                    );
                }
            }))
        } else {
            None
        };

        // Wait for process to complete
        let wait_result = child.wait().await;
        // Ensure stderr is fully read before checking collected lines
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        match wait_result {
            Ok(status) => {
                if status.success() {
                    // Write sync marker file if user opted in
                    if sync_claude_json {
                        let lima_home = std::env::var("LIMA_HOME").unwrap_or_else(|_| {
                            let home = std::env::var("HOME").unwrap_or_default();
                            format!("{home}/.lima")
                        });
                        let marker = std::path::PathBuf::from(&lima_home)
                            .join(&instance_name_clone)
                            .join(SYNC_CLAUDE_JSON_MARKER);
                        let _ = std::fs::write(&marker, "");
                    }

                    let _ = app_handle.emit(
                        "lima-instance-create-success",
                        create_log_payload(instance_name_clone, "Created".to_string()),
                    );
                } else {
                    let collected = stderr_lines.lock().await;
                    let detail = if collected.is_empty() {
                        format!("Exit code: {}", status.code().unwrap_or(-1))
                    } else {
                        collected.join("\n")
                    };
                    let _ = app_handle.emit(
                        "lima-instance-create-error",
                        create_log_payload(instance_name_clone, detail),
                    );
                }
            }
            Err(e) => {
                let error_msg = format!("Failed to wait for limactl create process: {}", e);
                let _ = app_handle.emit(
                    "lima-instance-create-error",
                    create_log_payload(instance_name_clone, error_msg),
                );
            }
        }
    });

    Ok(instance_name)
}
