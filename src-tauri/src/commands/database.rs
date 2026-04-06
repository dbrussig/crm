use crate::database::init::database_path;
use crate::services::backup::icloud::ICloudBackupProvider;
use crate::services::backup::providers::{BackupInfo, BackupProvider};

#[tauri::command]
pub fn database_summary(app: tauri::AppHandle) -> Result<String, String> {
    let path = database_path(&app).map_err(|error| error.to_string())?;
    Ok(format!("SQLite vorgesehen unter {}", path.display()))
}

#[tauri::command]
pub async fn create_icloud_backup(app: tauri::AppHandle) -> Result<String, String> {
    let db_path = database_path(&app).map_err(|error| error.to_string())?;
    let provider = ICloudBackupProvider::new(app);
    provider.upload_backup(&db_path).await
}

#[tauri::command]
pub async fn list_icloud_backups(app: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let provider = ICloudBackupProvider::new(app);
    provider.list_backups().await
}
