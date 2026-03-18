mod codex_bridge;

use codex_bridge::CodexBridge;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[tauri::command]
async fn rpc_request(
    method: String,
    params: serde_json::Value,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<serde_json::Value, String> {
    let mut bridge = state.lock().await;
    bridge
        .request(&method, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn rpc_notify(
    method: String,
    params: serde_json::Value,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let mut bridge = state.lock().await;
    bridge
        .notify(&method, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn codex_set_api_keys(
    openai_api_key: String,
    openrouter_api_key: String,
    azure_api_key: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let mut bridge = state.lock().await;
    let openai = (!openai_api_key.trim().is_empty()).then_some(openai_api_key);
    let openrouter = (!openrouter_api_key.trim().is_empty()).then_some(openrouter_api_key);
    let azure = (!azure_api_key.trim().is_empty()).then_some(azure_api_key);
    bridge.set_api_keys(openai, openrouter, azure);
    bridge.restart(&app).await
}

/// Open a URL in the default browser.
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL is required".to_string());
    }
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(url).status();
    #[cfg(not(target_os = "macos"))]
    let status = std::process::Command::new("xdg-open").arg(url).status();
    status.map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a path in an external app by id. Uses heuristics for known app ids (cursor, vscode, code, terminal, finder).
#[tauri::command]
async fn open_in_app(app_id: String, path: String) -> Result<(), String> {
    let path_utf8 = std::path::Path::new(&path).to_string_lossy();
    let id_lower = app_id.to_lowercase();
    let status = if id_lower.contains("cursor") {
        std::process::Command::new("open")
            .args(["-a", "Cursor", path_utf8.as_ref()])
            .status()
    } else if id_lower.contains("vscode") || id_lower == "code" {
        std::process::Command::new("code").arg(&path).status()
    } else if id_lower.contains("terminal") {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .args(["-a", "Terminal", path_utf8.as_ref()])
                .status()
        }
        #[cfg(not(target_os = "macos"))]
        {
            std::process::Command::new("xdg-open").arg(&path).status()
        }
    } else if id_lower.contains("finder") {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .args(["-R", path_utf8.as_ref()])
                .status()
        }
        #[cfg(not(target_os = "macos"))]
        {
            std::process::Command::new("xdg-open").arg(&path).status()
        }
    } else {
        std::process::Command::new("open").arg(&path).status()
    };
    status.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct GitInfoResult {
    branch: Option<String>,
    sha: Option<String>,
    origin_url: Option<String>,
}

#[tauri::command]
async fn get_git_info(path: String) -> Result<GitInfoResult, String> {
    let path = std::path::Path::new(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let path_clone = path.to_path_buf();
    let (branch, sha, origin_url) = tokio::task::spawn_blocking(move || {
        let branch = std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&path_clone)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let sha = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&path_clone)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let origin_url = std::process::Command::new("git")
            .args(["remote", "get-url", "origin"])
            .current_dir(&path_clone)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        (branch, sha, origin_url)
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(GitInfoResult {
        branch,
        sha,
        origin_url,
    })
}

#[tauri::command]
async fn git_commit(path: String, message: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Commit message is required".to_string());
    }
    let path_add = path.clone();
    let status = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(&path_add)
            .status()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("git add failed".to_string());
    }
    let path_commit = path.clone();
    let status = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["commit", "-m", &message])
            .current_dir(&path_commit)
            .status()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("git commit failed".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn git_push(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let path_clone = path.clone();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .arg("push")
            .current_dir(&path_clone)
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {stderr}"));
    }
    Ok(())
}

/// Clone a git repo at `url` into `parent_dir`. Returns the full path of the cloned directory.
#[tauri::command]
async fn git_clone(url: String, parent_dir: String) -> Result<String, String> {
    let url = url.trim().to_string();
    let parent_dir = std::path::PathBuf::from(&parent_dir);
    if !parent_dir.is_dir() {
        return Err(format!("Not a directory: {}", parent_dir.display()));
    }
    let url_clone = url.clone();
    let parent_dir_clone = parent_dir.clone();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .arg("clone")
            .arg(&url_clone)
            .current_dir(&parent_dir_clone)
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git clone failed: {stderr}"));
    }
    let dir_name = url
        .split('/')
        .last()
        .unwrap_or("repo")
        .strip_suffix(".git")
        .unwrap_or_else(|| url.split('/').last().unwrap_or("repo"));
    let full_path = parent_dir.join(dir_name);
    full_path
        .into_os_string()
        .into_string()
        .map_err(|_| "Invalid path".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let bridge = Arc::new(Mutex::new(CodexBridge::new()));
            app.manage(bridge.clone());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut b = bridge.lock().await;
                if let Err(e) = b.start(&handle).await {
                    eprintln!("Failed to start codex bridge: {e}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            rpc_request,
            rpc_notify,
            codex_set_api_keys,
            git_clone,
            open_in_app,
            open_url,
            get_git_info,
            git_commit,
            git_push,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
