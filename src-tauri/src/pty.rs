use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const REPLAY_BUFFER_CAP: usize = 65536; // 64 KB

/// Shared state between the reader thread and attach/detach operations.
struct PtyOutput {
    channel: Option<Channel<Vec<u8>>>,
    buffer: VecDeque<u8>,
}

pub struct PtyHandle {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    output: Arc<Mutex<PtyOutput>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    shell: String,
    initial_cwd: String,
}

impl PtyHandle {
    pub fn spawn(
        cols: u16,
        rows: u16,
        channel: Channel<Vec<u8>>,
        cwd: Option<String>,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let shell = if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        let initial_cwd = cwd.unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| ".".into())
                .to_string_lossy()
                .to_string()
        });

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&initial_cwd);

        // Suppress macOS "Restored session:" message and Apple Terminal hooks
        cmd.env("SHELL_SESSIONS_DISABLE", "1");
        cmd.env("TERM_PROGRAM", "yolo");

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // Drop slave — master owns the PTY now
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        let master = Arc::new(Mutex::new(pair.master));
        let writer = Arc::new(Mutex::new(writer));
        let child = Arc::new(Mutex::new(child));

        let output = Arc::new(Mutex::new(PtyOutput {
            channel: Some(channel),
            buffer: VecDeque::with_capacity(REPLAY_BUFFER_CAP),
        }));

        // Spawn reader thread → buffers bytes and pushes to Channel
        let output_clone = Arc::clone(&output);
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = &buf[..n];
                        let mut out = match output_clone.lock() {
                            Ok(guard) => guard,
                            Err(_) => break,
                        };

                        // Append to replay buffer, trim if over capacity
                        if out.buffer.len() + n > REPLAY_BUFFER_CAP {
                            let drain = (out.buffer.len() + n) - REPLAY_BUFFER_CAP;
                            out.buffer.drain(..drain);
                        }
                        out.buffer.extend(data);

                        // Send to attached channel
                        if let Some(ref ch) = out.channel {
                            let _ = ch.send(data.to_vec());
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(PtyHandle {
            master,
            writer,
            output,
            child,
            shell,
            initial_cwd,
        })
    }

    /// Re-attach a new Tauri Channel (e.g. after Vite HMR).
    /// Replays the buffer so the new terminal instance shows recent output,
    /// then starts streaming live data through the new channel.
    pub fn attach(&self, channel: Channel<Vec<u8>>, cols: u16, rows: u16) -> Result<(), String> {
        let mut out = self.output.lock().map_err(|e| e.to_string())?;

        // Replay buffered output
        if !out.buffer.is_empty() {
            let data: Vec<u8> = out.buffer.iter().copied().collect();
            let _ = channel.send(data);
        }

        // Swap to new channel
        out.channel = Some(channel);
        drop(out);

        // Resize to the new terminal dimensions
        self.resize(cols, rows)
    }

    /// Detach the channel (frontend unmounting). Reader thread keeps buffering.
    pub fn detach(&self) {
        if let Ok(mut out) = self.output.lock() {
            out.channel = None;
        }
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        self.writer
            .lock()
            .map_err(|e| e.to_string())?
            .write_all(data)
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|e| e.to_string())?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn is_alive(&self) -> bool {
        self.child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .map(|status| status.is_none())
            .unwrap_or(false)
    }

    pub fn shell(&self) -> &str {
        &self.shell
    }

    pub fn initial_cwd(&self) -> &str {
        &self.initial_cwd
    }

    /// Get the shell's current working directory via platform-specific methods.
    pub fn get_cwd(&self) -> Option<String> {
        let pid = self.child.lock().ok()?.process_id()?;

        #[cfg(target_os = "macos")]
        {
            let output = std::process::Command::new("lsof")
                .args(["-p", &pid.to_string(), "-Fn"])
                .output()
                .ok()?;
            let stdout = String::from_utf8(output.stdout).ok()?;
            let mut found_cwd = false;
            for line in stdout.lines() {
                if line == "fcwd" {
                    found_cwd = true;
                } else if found_cwd && line.starts_with('n') {
                    return Some(line[1..].to_string());
                }
            }
            None
        }

        #[cfg(target_os = "linux")]
        {
            std::fs::read_link(format!("/proc/{}/cwd", pid))
                .ok()
                .and_then(|p| p.to_str().map(|s| s.to_string()))
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = pid;
            None
        }
    }
}
