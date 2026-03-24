mod codex_bridge;
mod openai;
mod secrets;

use base64::Engine;
use codex_bridge::CodexBridge;
use secrets::{load_api_key_statuses, load_api_keys, persist_api_key_updates};
use std::path::Path;
use std::sync::Arc;
#[cfg(target_os = "macos")]
use tauri::window::Color;
use tauri::Manager;
use tokio::sync::Mutex;
#[cfg(target_os = "macos")]
use window_vibrancy::{
    apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppListItemResult {
    id: String,
    name: String,
    is_accessible: bool,
}

#[derive(serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum PersistedOpenAiAccountResult {
    ApiKey {},
    Chatgpt {
        email: Option<String>,
        plan_type: Option<String>,
    },
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedOpenAiAccountStateResult {
    account: Option<PersistedOpenAiAccountResult>,
}

fn read_persisted_openai_auth_state_result() -> Result<PersistedOpenAiAccountStateResult, String> {
    let auth_path = codex_bridge::awencode_codex_home()
        .map_err(|err| format!("Failed to resolve Awencode data directory: {err}"))?
        .join("auth.json");
    let contents = match std::fs::read_to_string(&auth_path) {
        Ok(contents) => contents,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PersistedOpenAiAccountStateResult { account: None });
        }
        Err(err) => {
            return Err(format!("Failed to read persisted auth state: {err}"));
        }
    };
    let auth_json: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|err| format!("Failed to parse auth.json: {err}"))?;

    if auth_json
        .get("OPENAI_API_KEY")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
    {
        return Ok(PersistedOpenAiAccountStateResult {
            account: Some(PersistedOpenAiAccountResult::ApiKey {}),
        });
    }

    let id_token = match auth_json
        .get("tokens")
        .and_then(serde_json::Value::as_object)
        .and_then(|tokens| tokens.get("id_token"))
        .and_then(serde_json::Value::as_str)
    {
        Some(token) if !token.trim().is_empty() => token,
        _ => {
            return Ok(PersistedOpenAiAccountStateResult { account: None });
        }
    };

    let payload_segment = id_token.split('.').nth(1).unwrap_or_default();
    let decoded_payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_segment)
        .map_err(|err| format!("Failed to decode persisted ChatGPT token payload: {err}"))?;
    let payload_json: serde_json::Value = serde_json::from_slice(&decoded_payload)
        .map_err(|err| format!("Failed to parse persisted ChatGPT token payload: {err}"))?;
    let auth_section = payload_json
        .get("https://api.openai.com/auth")
        .and_then(serde_json::Value::as_object);

    Ok(PersistedOpenAiAccountStateResult {
        account: Some(PersistedOpenAiAccountResult::Chatgpt {
            email: payload_json
                .get("email")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
            plan_type: auth_section
                .and_then(|section| section.get("chatgpt_plan_type"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
        }),
    })
}

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
async fn rpc_respond(
    id: u64,
    result: serde_json::Value,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let mut bridge = state.lock().await;
    bridge.respond(id, result).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn codex_set_api_keys(
    openai_api_key: Option<String>,
    openrouter_api_key: Option<String>,
    azure_api_key: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let stored = persist_api_key_updates(
        openai_api_key.as_deref(),
        openrouter_api_key.as_deref(),
        azure_api_key.as_deref(),
    )?;
    let mut bridge = state.lock().await;
    bridge.set_api_keys(stored.openai, stored.openrouter, stored.azure);
    bridge.restart(&app).await
}

#[tauri::command]
async fn codex_activate_openai_api_key_auth(
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let stored = load_api_keys()?;
    let mut bridge = state.lock().await;
    bridge.activate_openai_api_key_auth(stored.openai).await
}

#[tauri::command]
fn codex_read_persisted_openai_auth_state() -> Result<PersistedOpenAiAccountStateResult, String> {
    read_persisted_openai_auth_state_result()
}

#[tauri::command]
async fn codex_refresh_bridge_credentials(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let stored = load_api_keys()?;
    let mut bridge = state.lock().await;
    bridge.set_api_keys(stored.openai, stored.openrouter, stored.azure);
    bridge.restart(&app).await
}

#[tauri::command]
fn api_key_statuses() -> Result<secrets::ApiKeyStatuses, String> {
    load_api_key_statuses()
}

#[tauri::command]
async fn generate_thread_title(seed_message: String) -> Result<Option<String>, String> {
    let stored = load_api_keys()?;
    let Some(openai_api_key) = stored.openai else {
        return Ok(None);
    };
    openai::generate_thread_title(&openai_api_key, &seed_message).await
}

fn command_stderr(stderr: &[u8], fallback: &str) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        fallback.to_string()
    } else {
        message
    }
}

fn truncate_prompt_context(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }

    format!(
        "{}\n...[truncated]",
        text.chars().take(max_chars).collect::<String>()
    )
}

async fn git_add_all(path: &Path) -> Result<(), String> {
    let path = path.to_path_buf();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(&path)
            .output()
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(command_stderr(&output.stderr, "git add failed"))
    }
}

async fn read_staged_diff_context(path: &Path) -> Result<String, String> {
    let summary_path = path.to_path_buf();
    let summary_output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["diff", "--cached", "--stat=160,120", "--summary"])
            .current_dir(&summary_path)
            .output()
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())?;
    if !summary_output.status.success() {
        return Err(command_stderr(
            &summary_output.stderr,
            "Failed to read staged diff summary",
        ));
    }

    let patch_path = path.to_path_buf();
    let patch_output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["diff", "--cached", "--no-color", "--no-ext-diff", "--unified=0"])
            .current_dir(&patch_path)
            .output()
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())?;
    if !patch_output.status.success() {
        return Err(command_stderr(
            &patch_output.stderr,
            "Failed to read staged patch",
        ));
    }

    let summary = String::from_utf8_lossy(&summary_output.stdout).trim().to_string();
    let patch = String::from_utf8_lossy(&patch_output.stdout).trim().to_string();

    if summary.is_empty() && patch.is_empty() {
        return Err("No staged changes to commit".to_string());
    }

    let mut sections = Vec::new();
    if !summary.is_empty() {
        sections.push(format!("Staged change summary:\n{summary}"));
    }
    if !patch.is_empty() {
        sections.push(format!(
            "Staged patch:\n{}",
            truncate_prompt_context(&patch, 12_000)
        ));
    }

    Ok(sections.join("\n\n"))
}

async fn resolve_commit_message(path: &Path, message: &str) -> Result<String, String> {
    let message = message.trim();
    if !message.is_empty() {
        return Ok(message.to_string());
    }

    let stored = load_api_keys()?;
    let Some(openai_api_key) = stored.openai else {
        return Err("Commit message is required when no OpenAI API key is configured".to_string());
    };

    let diff_context = read_staged_diff_context(path).await?;
    openai::generate_commit_message(&openai_api_key, &diff_context)
        .await?
        .ok_or_else(|| "Failed to generate a commit message from the staged changes".to_string())
}

/// Whether `path` exists on disk and is a directory (false if missing or inaccessible).
#[tauri::command]
fn path_is_directory(path: String) -> bool {
    let path = path.trim();
    if path.is_empty() {
        return false;
    }
    Path::new(path)
        .metadata()
        .map(|m| m.is_dir())
        .unwrap_or(false)
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
    } else if id_lower.contains("ghostty") {
        std::process::Command::new("open")
            .args(["-a", "Ghostty", path_utf8.as_ref()])
            .status()
    } else if id_lower.contains("vscode") || id_lower == "code" {
        std::process::Command::new("code").arg(&path).status()
    } else if id_lower.contains("visualstudio") {
        std::process::Command::new("open")
            .args(["-a", "Visual Studio", path_utf8.as_ref()])
            .status()
    } else if id_lower.contains("xcode") {
        std::process::Command::new("open")
            .args(["-a", "Xcode", path_utf8.as_ref()])
            .status()
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

#[tauri::command]
async fn detect_open_apps() -> Result<Vec<AppListItemResult>, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(detect_open_apps_macos)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
async fn resolve_app_icon(app_id: String, app_name: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(move || resolve_app_icon_macos(&app_id, &app_name))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_id, app_name);
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
fn resolve_app_icon_macos(app_id: &str, app_name: &str) -> Result<Option<String>, String> {
    let app_path = find_application_path(app_id, app_name);
    let Some(app_path) = app_path else {
        return Ok(None);
    };

    let icns_path = read_icon_file_from_plist(&app_path)?;
    let Some(icns_path) = icns_path else {
        return Ok(None);
    };

    let tmp_name = format!("awencode-open-in-{}.png", sanitize_for_file_name(app_id));
    let png_path = std::env::temp_dir().join(tmp_name);
    let png_path_str = png_path.to_string_lossy().to_string();
    let icns_str = icns_path.to_string_lossy().to_string();

    let status = std::process::Command::new("sips")
        .args([
            "-s",
            "format",
            "png",
            &icns_str,
            "--resampleHeightWidthMax",
            "64",
            "--out",
            &png_path_str,
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Ok(None);
    }

    let png_bytes = std::fs::read(&png_path).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    Ok(Some(format!("data:image/png;base64,{encoded}")))
}

#[cfg(target_os = "macos")]
fn read_icon_file_from_plist(
    app_path: &std::path::Path,
) -> Result<Option<std::path::PathBuf>, String> {
    let plist_path = app_path.join("Contents/Info.plist");
    if !plist_path.exists() {
        return Ok(None);
    }
    let plist_str = plist_path.to_string_lossy().to_string();

    let output = std::process::Command::new("defaults")
        .args(["read", &plist_str, "CFBundleIconFile"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }

    let icon_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if icon_name.is_empty() {
        return Ok(None);
    }

    let resources = app_path.join("Contents/Resources");
    // Try with .icns extension first, then as-is (some bundles omit the extension)
    for candidate in [
        resources.join(format!("{icon_name}.icns")),
        resources.join(&icon_name),
    ] {
        if candidate.exists() {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
fn find_application_path(app_id: &str, _app_name: &str) -> Option<std::path::PathBuf> {
    resolve_known_app_path(app_id)
}

/// All filesystem locations macOS places app bundles, in priority order.
#[cfg(target_os = "macos")]
fn app_search_roots() -> Vec<std::path::PathBuf> {
    let mut roots = vec![
        std::path::PathBuf::from("/Applications"),
        std::path::PathBuf::from("/System/Applications"),
        std::path::PathBuf::from("/System/Applications/Utilities"),
        std::path::PathBuf::from("/System/Library/CoreServices"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(std::path::Path::new(&home).join("Applications"));
    }
    roots
}

#[cfg(target_os = "macos")]
fn find_app_bundle_path(bundle_name: &str) -> Option<std::path::PathBuf> {
    for root in app_search_roots() {
        let candidate = root.join(bundle_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_open_apps_macos() -> Vec<AppListItemResult> {
    let candidates = [
        ("cursor", "Cursor", "Cursor.app"),
        ("ghostty", "Ghostty", "Ghostty.app"),
        ("vscode", "VS Code", "Visual Studio Code.app"),
        ("visualstudio", "Visual Studio", "Visual Studio.app"),
        ("xcode", "Xcode", "Xcode.app"),
        ("terminal", "Terminal", "Terminal.app"),
        ("finder", "Finder", "Finder.app"),
    ];
    let mut apps = Vec::new();
    for (id, name, bundle) in candidates {
        if find_app_bundle_path(bundle).is_some() {
            apps.push(AppListItemResult {
                id: id.to_string(),
                name: name.to_string(),
                is_accessible: true,
            });
        }
    }
    apps
}

#[cfg(target_os = "macos")]
fn resolve_known_app_path(app_id: &str) -> Option<std::path::PathBuf> {
    let id_lower = app_id.to_lowercase();
    let bundle = if id_lower.contains("cursor") {
        "Cursor.app"
    } else if id_lower.contains("ghostty") {
        "Ghostty.app"
    } else if id_lower.contains("vscode") || id_lower == "code" {
        "Visual Studio Code.app"
    } else if id_lower.contains("visualstudio") {
        "Visual Studio.app"
    } else if id_lower.contains("xcode") {
        "Xcode.app"
    } else if id_lower.contains("terminal") {
        "Terminal.app"
    } else if id_lower.contains("finder") {
        "Finder.app"
    } else {
        return None;
    };
    find_app_bundle_path(bundle)
}

#[cfg(target_os = "macos")]
fn sanitize_for_file_name(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    if sanitized.is_empty() {
        "app".to_string()
    } else {
        sanitized
    }
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GitPrInfo {
    number: String,
    url: String,
}

/// Look up the open PR for the current branch via `gh pr view`.
/// Returns `null` (Ok(None)) when there is no PR or `gh` is unavailable.
#[tauri::command]
async fn get_branch_pr(path: String) -> Result<Option<GitPrInfo>, String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    tokio::task::spawn_blocking(move || {
        let output = std::process::Command::new("gh")
            .args(["pr", "view", "--json", "number,url", "--jq", ".number,.url"])
            .current_dir(&path)
            .output()
            .ok();
        let output = match output {
            Some(o) if o.status.success() => o,
            _ => return Ok(None),
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.trim().lines();
        let number = lines.next().unwrap_or("").trim().to_string();
        let url = lines.next().unwrap_or("").trim().to_string();
        if number.is_empty() || url.is_empty() {
            return Ok(None);
        }
        Ok(Some(GitPrInfo { number, url }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileStatusEntry {
    path: String,
    status: String,
}

#[tauri::command]
async fn get_git_file_status(path: String) -> Result<Vec<FileStatusEntry>, String> {
    let path = std::path::PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    tokio::task::spawn_blocking(move || {
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain=v1", "-uall"])
            .current_dir(&path)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("git status failed".to_string());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut entries = Vec::new();
        for line in stdout.lines() {
            if line.len() < 4 {
                continue;
            }
            let xy = &line[..2];
            let file_path = line[3..].to_string();
            let status = match xy.trim() {
                "M" | "MM" | "AM" => "M",
                "A" => "A",
                "D" => "D",
                "R" => "R",
                "C" => "C",
                "??" => "U",
                "!" | "!!" => "!",
                s if s.starts_with('M') => "M",
                s if s.starts_with('A') => "A",
                s if s.starts_with('D') => "D",
                s if s.starts_with('R') => "R",
                _ => "M",
            };
            entries.push(FileStatusEntry {
                path: file_path,
                status: status.to_string(),
            });
        }
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<DirEntry>>,
}

#[tauri::command]
async fn list_directory_tree(path: String, depth: Option<u32>) -> Result<Vec<DirEntry>, String> {
    let root = std::path::PathBuf::from(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let max_depth = depth.unwrap_or(1);
    tokio::task::spawn_blocking(move || build_dir_tree(&root, &root, 0, max_depth))
        .await
        .map_err(|e| e.to_string())?
}

fn build_dir_tree(
    base: &std::path::Path,
    dir: &std::path::Path,
    current_depth: u32,
    max_depth: u32,
) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "__pycache__"
            || name == "dist"
            || name == "build"
        {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let is_dir = file_type.is_dir();
        let rel_path = entry
            .path()
            .strip_prefix(base)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .to_string();
        let children = if is_dir && current_depth < max_depth {
            Some(build_dir_tree(
                base,
                &entry.path(),
                current_depth + 1,
                max_depth,
            )?)
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };
        entries.push(DirEntry {
            name,
            path: rel_path,
            is_dir,
            children,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
async fn git_commit(path: String, message: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }

    git_add_all(&path).await?;
    let message = resolve_commit_message(&path, &message).await?;

    let path_commit = path.clone();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["commit", "-m", &message])
            .current_dir(&path_commit)
            .output()
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err(command_stderr(&output.stderr, "git commit failed"));
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

/// Create and checkout a new git branch at `path`.
#[tauri::command]
async fn git_create_branch(path: String, name: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Branch name is required".to_string());
    }
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["checkout", "-b", &name])
            .current_dir(&path)
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout -b failed: {stderr}"));
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

#[tauri::command]
fn sync_window_theme(theme: String, app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        let theme = theme.trim();
        let material = match theme {
            "light" => {
                window
                    .set_theme(Some(tauri::Theme::Light))
                    .map_err(|e| e.to_string())?;
                NSVisualEffectMaterial::Light
            }
            "dark" => {
                window
                    .set_theme(Some(tauri::Theme::Dark))
                    .map_err(|e| e.to_string())?;
                NSVisualEffectMaterial::Dark
            }
            _ => {
                window.set_theme(None).map_err(|e| e.to_string())?;
                NSVisualEffectMaterial::Sidebar
            }
        };

        window
            .set_background_color(Some(Color(0, 0, 0, 1)))
            .map_err(|e| e.to_string())?;
        let _ = clear_vibrancy(&window);
        apply_vibrancy(&window, material, Some(NSVisualEffectState::Active), None)
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (theme, app);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");
                window
                    .set_background_color(Some(Color(0, 0, 0, 1)))
                    .expect("Failed to set window background color");
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::Sidebar,
                    Some(NSVisualEffectState::Active),
                    None,
                )
                .expect("Failed to apply vibrancy");
            }

            let mut bridge = CodexBridge::new();
            match load_api_keys() {
                Ok(stored) => {
                    bridge.set_api_keys(stored.openai, stored.openrouter, stored.azure);
                }
                Err(err) => {
                    eprintln!("Failed to load API keys from secure storage: {err}");
                }
            }
            let bridge = Arc::new(Mutex::new(bridge));
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
            rpc_respond,
            codex_set_api_keys,
            codex_activate_openai_api_key_auth,
            codex_read_persisted_openai_auth_state,
            codex_refresh_bridge_credentials,
            api_key_statuses,
            generate_thread_title,
            git_clone,
            git_create_branch,
            open_in_app,
            detect_open_apps,
            resolve_app_icon,
            open_url,
            get_git_info,
            get_branch_pr,
            get_git_file_status,
            path_is_directory,
            list_directory_tree,
            sync_window_theme,
            git_commit,
            git_push,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
