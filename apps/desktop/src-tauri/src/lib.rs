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
    bridge.request(&method, params).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn rpc_notify(
    method: String,
    params: serde_json::Value,
    state: tauri::State<'_, Arc<Mutex<CodexBridge>>>,
) -> Result<(), String> {
    let mut bridge = state.lock().await;
    bridge.notify(&method, params).await.map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![rpc_request, rpc_notify])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
