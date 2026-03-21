use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct SidecarManager {
    child: Mutex<Option<Child>>,
    exe_path: Mutex<Option<std::path::PathBuf>>,
    shutting_down: AtomicBool,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            exe_path: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
        }
    }

    pub fn start(&self, app: &AppHandle) {
        let exe_path = resolve_sidecar_path(app);
        eprintln!("[sidecar] Resolved path: {:?}", exe_path);

        if let Ok(mut path_guard) = self.exe_path.lock() {
            *path_guard = Some(exe_path.clone());
        }

        self.spawn_process(&exe_path);
    }

    fn spawn_process(&self, exe_path: &std::path::Path) -> bool {
        // Kill any existing process first
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }

        // Also kill any orphaned sidecar on port 8001
        kill_process_on_port(8001);

        match Command::new(exe_path)
            .env("PORT", "8001")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .spawn()
        {
            Ok(child) => {
                eprintln!("[sidecar] Started with PID {}", child.id());
                if let Ok(mut guard) = self.child.lock() {
                    *guard = Some(child);
                }
                wait_for_health(30)
            }
            Err(e) => {
                eprintln!("[sidecar] Failed to start: {}. Path: {:?}", e, exe_path);
                false
            }
        }
    }

    fn restart(&self) -> bool {
        let exe_path = if let Ok(guard) = self.exe_path.lock() {
            guard.clone()
        } else {
            None
        };

        if let Some(path) = exe_path {
            eprintln!("[sidecar] Restarting...");
            self.spawn_process(&path)
        } else {
            eprintln!("[sidecar] Cannot restart: no path stored");
            false
        }
    }

    pub fn is_alive(&self) -> bool {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                match child.try_wait() {
                    Ok(None) => return true, // still running
                    Ok(Some(status)) => {
                        eprintln!("[sidecar] Process exited with status: {}", status);
                        *guard = None;
                    }
                    Err(e) => {
                        eprintln!("[sidecar] Error checking process: {}", e);
                    }
                }
            }
        }
        false
    }

    pub fn stop(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                eprintln!("[sidecar] Stopping PID {}", child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Spawn a background thread that monitors sidecar health and restarts if needed
pub fn start_watchdog(app: AppHandle) {
    std::thread::spawn(move || {
        // Wait for initial startup to complete
        std::thread::sleep(std::time::Duration::from_secs(5));

        let mut consecutive_failures: u32 = 0;

        loop {
            let mgr = app.state::<SidecarManager>();

            if mgr.is_shutting_down() {
                eprintln!("[watchdog] App shutting down, stopping watchdog");
                break;
            }

            let healthy = check_health_quick();

            if healthy {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                eprintln!(
                    "[watchdog] Health check failed ({} consecutive)",
                    consecutive_failures
                );

                // After 2 consecutive failures, check if process is alive
                if consecutive_failures >= 2 {
                    if !mgr.is_alive() {
                        eprintln!("[watchdog] Sidecar process is dead, restarting");
                    } else {
                        eprintln!("[watchdog] Sidecar process alive but unhealthy, restarting");
                    }

                    if mgr.restart() {
                        eprintln!("[watchdog] Restart successful");
                        consecutive_failures = 0;
                    } else {
                        eprintln!("[watchdog] Restart failed");
                        // Back off before next attempt
                        let backoff = std::cmp::min(consecutive_failures * 5, 30);
                        std::thread::sleep(std::time::Duration::from_secs(backoff as u64));
                    }
                }
            }

            // Check every 10 seconds
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
    });
}

fn check_health_quick() -> bool {
    use std::io::Read;
    if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
        &"127.0.0.1:8001".parse().unwrap(),
        std::time::Duration::from_secs(3),
    ) {
        let req = "GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n";
        if std::io::Write::write_all(&mut stream, req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            let _ = stream.read(&mut buf);
            let resp = String::from_utf8_lossy(&buf);
            return resp.contains("200") || resp.contains("healthy");
        }
    }
    false
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

fn wait_for_health(max_seconds: u32) -> bool {
    use std::io::Read;
    for i in 0..max_seconds {
        if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
            &"127.0.0.1:8001".parse().unwrap(),
            std::time::Duration::from_secs(1),
        ) {
            let req = "GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n";
            if std::io::Write::write_all(&mut stream, req.as_bytes()).is_ok() {
                let mut buf = [0u8; 256];
                let _ = stream.read(&mut buf);
                let resp = String::from_utf8_lossy(&buf);
                if resp.contains("200") || resp.contains("healthy") {
                    eprintln!("[sidecar] Health check passed after {}s", i + 1);
                    return true;
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    eprintln!(
        "[sidecar] Warning: health check did not pass within {}s",
        max_seconds
    );
    false
}

fn kill_process_on_port(port: u16) {
    if let Ok(output) = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid_str in pids.trim().lines() {
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                eprintln!("[sidecar] Killing orphaned process {} on port {}", pid, port);
                unsafe {
                    libc::kill(pid, libc::SIGKILL);
                }
            }
        }
    }
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
