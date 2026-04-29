use serde::Serialize;
use tauri::AppHandle;

use crate::security::keychain::SecureTokenStore;

#[derive(Serialize)]
pub struct StoredSecretResponse {
    pub value: Option<String>,
}

fn app_identifier(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

#[tauri::command]
pub fn auth_get_secret(app: AppHandle, key: String) -> Result<StoredSecretResponse, String> {
    Ok(StoredSecretResponse {
        value: SecureTokenStore::get(&app_identifier(&app), &key)?,
    })
}

#[tauri::command]
pub fn auth_set_secret(app: AppHandle, key: String, value: String) -> Result<(), String> {
    SecureTokenStore::set(&app_identifier(&app), &key, &value)
}

#[tauri::command]
pub fn auth_delete_secret(app: AppHandle, key: String) -> Result<(), String> {
    SecureTokenStore::delete(&app_identifier(&app), &key)
}
