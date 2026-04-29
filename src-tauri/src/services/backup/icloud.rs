use std::fs;
use std::path::PathBuf;

use chrono::Utc;

use crate::database::init::icloud_documents_dir_for_app;

use super::providers::{BackupInfo, BackupProvider};

pub struct ICloudBackupProvider {
    app: tauri::AppHandle,
}

impl ICloudBackupProvider {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn backups_dir(&self) -> Option<PathBuf> {
        let icloud = icloud_documents_dir_for_app(&self.app)?;
        let dir = icloud.join("backups");
        fs::create_dir_all(&dir).ok()?;
        Some(dir)
    }
}

impl BackupProvider for ICloudBackupProvider {
    async fn upload_backup(&self, backup_path: &PathBuf) -> Result<String, String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let filename = format!("mietpark-crm_{}.db", ts);
        let dest = dir.join(&filename);
        fs::copy(backup_path, &dest).map_err(|error| error.to_string())?;
        Ok(filename)
    }

    async fn download_latest_backup(&self) -> Result<PathBuf, String> {
        let backups = self.list_backups().await?;
        let latest = backups
            .first()
            .ok_or("Keine Backups vorhanden".to_string())?;

        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;
        Ok(dir.join(&latest.id))
    }

    async fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        let mut backups: Vec<BackupInfo> = fs::read_dir(&dir)
            .map_err(|error| error.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().extension().map(|ext| ext == "db").unwrap_or(false))
            .map(|entry| {
                let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
                let created_at = entry
                    .metadata()
                    .ok()
                    .and_then(|meta| meta.modified().ok())
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs() as i64)
                    .unwrap_or(0);
                BackupInfo {
                    id: entry.file_name().to_string_lossy().to_string(),
                    created_at,
                    size_bytes: size,
                    version: "1".to_string(),
                }
            })
            .collect();

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    async fn delete_backup(&self, backup_id: &str) -> Result<(), String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        let filename = PathBuf::from(backup_id);
        if filename.components().count() != 1 {
            return Err("Ungültige Backup-ID".to_string());
        }
        let path = dir.join(filename);
        if !path.extension().map(|ext| ext == "db").unwrap_or(false) {
            return Err("Nur .db-Dateien können gelöscht werden".to_string());
        }

        fs::remove_file(path).map_err(|error| error.to_string())
    }
}
