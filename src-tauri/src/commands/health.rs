#[tauri::command]
pub fn healthcheck() -> String {
    "Rust backend erreichbar".to_string()
}
