//! When Codex is launched from a GUI (macOS `.app`, Tauri, etc.), the process
//! often inherits a minimal `PATH` that omits Homebrew, Cargo, and other common
//! install locations. Shell tools and `rg` then fail to resolve even when
//! installed on the machine.

/// Prepend typical developer `PATH` entries so subprocesses match an interactive shell.
pub fn augment_for_shell_tools() {
    let mut prefixes: Vec<String> = Vec::new();
    if cfg!(target_os = "macos") {
        prefixes.push("/opt/homebrew/bin".to_string());
        prefixes.push("/usr/local/bin".to_string());
    } else if cfg!(target_os = "linux") {
        prefixes.push("/usr/local/bin".to_string());
    }
    if let Ok(home) = std::env::var("HOME") {
        prefixes.push(format!("{home}/.cargo/bin"));
    }

    let prefix = prefixes.join(":");
    let updated = match std::env::var("PATH") {
        Ok(existing) => format!("{prefix}:{existing}"),
        Err(_) => prefix,
    };
    // SAFETY: `set_var` is unsafe in Rust 2024 when other threads may read the env.
    // `arg0_dispatch` invokes this before `build_runtime` creates any Tokio worker threads.
    unsafe {
        std::env::set_var("PATH", updated);
    }
}
