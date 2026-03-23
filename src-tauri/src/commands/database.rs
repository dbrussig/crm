use crate::database::init::database_path;

#[tauri::command]
pub fn database_summary(app: tauri::AppHandle) -> Result<String, String> {
    let path = database_path(&app).map_err(|error| error.to_string())?;
    Ok(format!("SQLite vorgesehen unter {}", path.display()))
}
