use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

pub struct PtyHandle {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

impl PtyHandle {
    pub fn spawn(cols: u16, rows: u16, channel: Channel<Vec<u8>>) -> Result<Self, String> {
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

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(dirs::home_dir().unwrap_or_else(|| ".".into()));

        let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // Drop slave — master owns the PTY now
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        let master = Arc::new(Mutex::new(pair.master));
        let writer = Arc::new(Mutex::new(writer));

        // Spawn reader thread → pushes bytes to Channel
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let _ = channel.send(buf[..n].to_vec());
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(PtyHandle { master, writer })
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
}
