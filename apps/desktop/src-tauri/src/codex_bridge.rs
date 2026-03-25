use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

use crate::app_env::optional_env_var;

/// Returns `~/.awencode`, creating it if it does not exist.
/// This is Awencode's isolated Codex home — separate from `~/.codex` used by the
/// official OpenAI Codex CLI / app so the two never share sessions or config.
pub(crate) fn awencode_codex_home() -> std::io::Result<PathBuf> {
    let mut path = dirs::home_dir().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Cannot resolve home directory",
        )
    })?;
    path.push(".awencode");
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

fn codex_app_server_candidates() -> Vec<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir
        .ancestors()
        .nth(3)
        .map(PathBuf::from)
        .unwrap_or(manifest_dir);
    vec![
        workspace_root.join("codex-rs/target/debug/codex-app-server"),
        workspace_root.join("codex-rs/target/release/codex-app-server"),
    ]
}

/// Path next to the running executable (same rules as `tauri_plugin_shell` sidecars).
fn try_sidecar_codex_app_server(app: &AppHandle) -> Option<PathBuf> {
    let shell_cmd = app.shell().sidecar("codex-app-server").ok()?;
    let std_cmd: std::process::Command = shell_cmd.into();
    let path = PathBuf::from(std_cmd.get_program());
    path.is_file().then_some(path)
}

fn resolve_codex_app_server_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(override_path) = optional_env_var("AWENCODE_CODEX_APP_SERVER_PATH") {
        let path = PathBuf::from(&override_path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "AWENCODE_CODEX_APP_SERVER_PATH points to a missing file: {override_path}"
        ));
    }

    if let Some(path) = try_sidecar_codex_app_server(app) {
        return Ok(path);
    }

    for candidate in codex_app_server_candidates() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    which::which("codex-app-server").map_err(|e| {
        format!(
            "codex-app-server binary not found (bundled sidecar, target/debug copy, workspace build, or PATH): {e}"
        )
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    id: Option<u64>,
    method: String,
    params: Option<Value>,
}

/// One line from app-server: either a response (id + result/error) or a notification (method + params).
#[derive(Debug, Deserialize)]
struct JsonRpcMessage {
    id: Option<u64>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
    method: Option<String>,
    params: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
    #[serde(default)]
    data: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum AccountInfo {
    ApiKey {},
    Chatgpt {},
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadAccountResponse {
    account: Option<AccountInfo>,
}

pub struct CodexBridge {
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    /// Shared with the stdout reader task so it can complete pending requests.
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    openai_api_key: Option<String>,
    openrouter_api_key: Option<String>,
    azure_api_key: Option<String>,
}

impl CodexBridge {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
            openai_api_key: None,
            openrouter_api_key: None,
            azure_api_key: None,
        }
    }

    pub fn set_api_keys(
        &mut self,
        openai_api_key: Option<String>,
        openrouter_api_key: Option<String>,
        azure_api_key: Option<String>,
    ) {
        self.openai_api_key = openai_api_key.filter(|v| !v.trim().is_empty());
        self.openrouter_api_key = openrouter_api_key.filter(|v| !v.trim().is_empty());
        self.azure_api_key = azure_api_key.filter(|v| !v.trim().is_empty());
    }

    pub async fn restart(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        self.stop().await;
        self.start(app_handle).await
    }

    async fn stop(&mut self) {
        self.stdin = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        let mut pending = self.pending.lock().await;
        pending.clear();
    }

    pub async fn start(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        let codex_bin = resolve_codex_app_server_binary(app_handle)?;

        let codex_home = awencode_codex_home()
            .map_err(|e| format!("Failed to create Awencode data directory: {e}"))?;

        let mut cmd = Command::new(codex_bin);
        // Isolate Awencode's data from the official OpenAI Codex app (~/.codex).
        cmd.env("CODEX_HOME", &codex_home);
        if let Some(key) = self.openai_api_key.as_deref() {
            cmd.env("OPENAI_API_KEY", key);
        }
        if let Some(key) = self.openrouter_api_key.as_deref() {
            cmd.env("OPENROUTER_API_KEY", key);
        }
        if let Some(key) = self.azure_api_key.as_deref() {
            cmd.env("AZURE_OPENAI_API_KEY", key);
        }

        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn codex app-server: {e}"))?;

        let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

        self.child = Some(child);
        self.stdin = Some(stdin);

        let handle = app_handle.clone();
        let pending = Arc::clone(&self.pending);
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<JsonRpcMessage>(&line) {
                    if msg.method.is_some() {
                        // Server notification or server request (both have method).
                        // Server requests also carry an id — the frontend can
                        // inspect that and respond via rpc_notify/rpc_request.
                        let _ = handle.emit("codex:notification", &line);
                    } else if let Some(id) = msg.id {
                        // Response to a client-initiated request.
                        let result = match msg.error {
                            Some(e) => Err(e.message),
                            None => msg
                                .result
                                .ok_or_else(|| "Missing result and error".to_string()),
                        };
                        let mut guard = pending.lock().await;
                        if let Some(tx) = guard.remove(&id) {
                            let _ = tx.send(result);
                        }
                    }
                }
            }
        });

        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[codex-app-server] {line}");
            }
        });

        self.initialize().await?;
        self.sync_openai_auth_state().await
    }

    /// Perform initialize + initialized handshake so the connection is ready for other RPCs.
    async fn initialize(&mut self) -> Result<(), String> {
        let params = serde_json::json!({
            "clientInfo": {
                "name": "awencode_desktop",
                "title": "Awencode Desktop",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true
            }
        });
        self.request("initialize", params).await?;
        self.notify("initialized", serde_json::json!({})).await
    }

    async fn sync_openai_auth_state(&mut self) -> Result<(), String> {
        let account_state = self
            .request("account/read", serde_json::json!({ "refreshToken": false }))
            .await
            .ok()
            .and_then(|value| serde_json::from_value::<ReadAccountResponse>(value).ok());

        if let Some(ReadAccountResponse { account }) = account_state {
            match (self.openai_api_key.as_deref(), account) {
                // Preserve a persisted ChatGPT session; the user explicitly chose it.
                (_, Some(AccountInfo::Chatgpt { .. })) => return Ok(()),
                // No OpenAI key stored in Awencode, but app-server is still on API-key auth.
                // Clear the stale auth entry so a removed key does not keep working silently.
                (None, Some(AccountInfo::ApiKey {})) => {
                    self.request("account/logout", serde_json::json!({}))
                        .await
                        .map(|_| ())
                        .map_err(|err| {
                            format!("Failed to clear stale OpenAI API key auth: {err}")
                        })?;
                    return Ok(());
                }
                // No stored key and no auth state to reconcile.
                (None, None) => return Ok(()),
                // Stored key should populate API-key auth when account is empty or already apiKey.
                (Some(_), Some(AccountInfo::ApiKey {})) | (Some(_), None) => {}
            }
        } else if self.openai_api_key.is_none() {
            return Ok(());
        }

        let Some(api_key) = self.openai_api_key.clone() else {
            return Ok(());
        };

        self.login_with_openai_api_key(&api_key).await
    }

    pub async fn activate_openai_api_key_auth(
        &mut self,
        openai_api_key: Option<String>,
    ) -> Result<(), String> {
        self.openai_api_key = openai_api_key.filter(|value| !value.trim().is_empty());
        let Some(api_key) = self.openai_api_key.clone() else {
            return Err("No saved OpenAI API key is available.".to_string());
        };
        self.login_with_openai_api_key(&api_key).await
    }

    async fn login_with_openai_api_key(&mut self, api_key: &str) -> Result<(), String> {
        self.request(
            "account/login/start",
            serde_json::json!({
                "type": "apiKey",
                "apiKey": api_key,
            }),
        )
        .await
        .map(|_| ())
        .map_err(|err| format!("Failed to sync OpenAI API key with codex app-server: {err}"))
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        {
            let mut guard = self.pending.lock().await;
            guard.insert(id, tx);
        }

        let req = JsonRpcRequest {
            id: Some(id),
            method: method.to_string(),
            params: Some(params),
        };

        let mut payload =
            serde_json::to_string(&req).map_err(|e| format!("Serialize error: {e}"))?;
        payload.push('\n');

        let stdin = self.stdin.as_mut().ok_or("Bridge not started")?;
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Flush error: {e}"))?;

        let result = tokio::time::timeout(REQUEST_TIMEOUT, rx)
            .await
            .map_err(|_| "Request timeout".to_string())?
            .map_err(|_| "Channel closed".to_string())?;
        result
    }

    pub async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let req = JsonRpcRequest {
            id: None,
            method: method.to_string(),
            params: Some(params),
        };

        let mut payload =
            serde_json::to_string(&req).map_err(|e| format!("Serialize error: {e}"))?;
        payload.push('\n');

        let stdin = self.stdin.as_mut().ok_or("Bridge not started")?;
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Flush error: {e}"))?;

        Ok(())
    }

    /// Send a JSON-RPC response back to the app-server for a server request.
    pub async fn respond(&mut self, id: u64, result: Value) -> Result<(), String> {
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        });

        let mut payload =
            serde_json::to_string(&response).map_err(|e| format!("Serialize error: {e}"))?;
        payload.push('\n');

        let stdin = self.stdin.as_mut().ok_or("Bridge not started")?;
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Flush error: {e}"))?;

        Ok(())
    }
}
