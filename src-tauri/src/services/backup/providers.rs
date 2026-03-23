use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub created_at: i64,
    pub size_bytes: u64,
    pub version: String,
}

#[allow(async_fn_in_trait)]
pub trait BackupProvider {
    async fn upload_backup(&self, backup_path: &PathBuf) -> Result<String, String>;
    async fn download_latest_backup(&self) -> Result<PathBuf, String>;
    async fn list_backups(&self) -> Result<Vec<BackupInfo>, String>;
    async fn delete_backup(&self, backup_id: &str) -> Result<(), String>;
}
