use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    id: Option<u64>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    id: Option<u64>,
    result: Option<Value>,
    error: Option<Value>,
    method: Option<String>,
    params: Option<Value>,
}

pub struct CodexBridge {
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    pending: HashMap<u64, oneshot::Sender<Result<Value, String>>>,
}

impl CodexBridge {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            pending: HashMap::new(),
        }
    }

    pub async fn start(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        let codex_bin = which::which("codex").map_err(|e| {
            format!("codex binary not found in PATH: {e}. Install codex-rs first.")
        })?;

        let mut child = Command::new(codex_bin)
            .arg("app-server")
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
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<JsonRpcResponse>(&line) {
                    if msg.method.is_some() {
                        let _ = handle.emit("codex:notification", &line);
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
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
        stdin.flush().await.map_err(|e| format!("Flush error: {e}"))?;

        Ok(Value::Null)
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
        stdin.flush().await.map_err(|e| format!("Flush error: {e}"))?;

        Ok(())
    }
}
