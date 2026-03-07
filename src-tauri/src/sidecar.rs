use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct SidecarManager {
    child: Mutex<Option<Child>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn start(&self, app: &AppHandle) {
        let exe_path = resolve_sidecar_path(app);
        eprintln!("[sidecar] Resolved path: {:?}", exe_path);

        match Command::new(&exe_path)
            .env("PORT", "8001")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(child) => {
                eprintln!("[sidecar] Started with PID {}", child.id());
                if let Ok(mut guard) = self.child.lock() {
                    *guard = Some(child);
                }
            }
            Err(e) => {
                eprintln!("[sidecar] Failed to start: {}. Path: {:?}", e, exe_path);
            }
        }
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                eprintln!("[sidecar] Stopping PID {}", child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.stop();
    }
}

fn resolve_sidecar_path(app: &AppHandle) -> std::path::PathBuf {
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let target_triple = current_target_triple();
    let sidecar_name = format!("prodforge-sidecar-{}", target_triple);

    // In bundled app: <app>/Contents/Resources/binaries/<name>
    let bundled = resource_dir.join("binaries").join(&sidecar_name);
    if bundled.exists() {
        return bundled;
    }

    // Dev mode: src-tauri/binaries/<name>
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&sidecar_name);
    if dev.exists() {
        return dev;
    }

    // Fallback: plain name in binaries dir
    let plain = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("prodforge-sidecar");
    if plain.exists() {
        return plain;
    }

    bundled
}

fn current_target_triple() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else {
        "x86_64-unknown-linux-gnu"
    }
}
