use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

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

pub struct CodexBridge {
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    /// Shared with the stdout reader task so it can complete pending requests.
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    openrouter_api_key: Option<String>,
    azure_api_key: Option<String>,
}

impl CodexBridge {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
            openrouter_api_key: None,
            azure_api_key: None,
        }
    }

    pub fn set_api_keys(
        &mut self,
        openrouter_api_key: Option<String>,
        azure_api_key: Option<String>,
    ) {
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
        let codex_bin = which::which("codex")
            .map_err(|e| format!("codex binary not found in PATH: {e}. Install codex-rs first."))?;

        let mut cmd = Command::new(codex_bin);
        cmd.arg("app-server");
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

        self.child = Some(child);
        self.stdin = Some(stdin);

        let handle = app_handle.clone();
        let pending = Arc::clone(&self.pending);
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<JsonRpcMessage>(&line) {
                    if let Some(_method) = msg.method {
                        let _ = handle.emit("codex:notification", &line);
                    } else if let Some(id) = msg.id {
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

        self.initialize().await
    }

    /// Perform initialize + initialized handshake so the connection is ready for other RPCs.
    async fn initialize(&mut self) -> Result<(), String> {
        let params = serde_json::json!({
            "clientInfo": {
                "name": "awencode_desktop",
                "title": "Awencode Desktop",
                "version": env!("CARGO_PKG_VERSION")
            }
        });
        self.request("initialize", params).await?;
        self.notify("initialized", serde_json::json!({})).await
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
}
