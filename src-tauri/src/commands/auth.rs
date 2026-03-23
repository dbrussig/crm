use serde::Serialize;

use crate::security::keychain::SecureTokenStore;

#[derive(Serialize)]
pub struct StoredSecretResponse {
    pub value: Option<String>,
}

#[tauri::command]
pub fn auth_get_secret(key: String) -> Result<StoredSecretResponse, String> {
    Ok(StoredSecretResponse {
        value: SecureTokenStore::get(&key)?,
    })
}

#[tauri::command]
pub fn auth_set_secret(key: String, value: String) -> Result<(), String> {
    SecureTokenStore::set(&key, &value)
}

#[tauri::command]
pub fn auth_delete_secret(key: String) -> Result<(), String> {
    SecureTokenStore::delete(&key)
}
