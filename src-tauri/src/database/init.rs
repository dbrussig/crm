use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use super::schema::SCHEMA_SQL;

type BoxError = Box<dyn std::error::Error>;

pub fn ensure_app_directories(app: &AppHandle) -> Result<(), BoxError> {
    let app_dir = app.path().resolve("data", BaseDirectory::AppData)?;
    fs::create_dir_all(app_dir)?;
    Ok(())
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, BoxError> {
    Ok(app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?)
}

pub fn ensure_database(app: &AppHandle) -> Result<(), BoxError> {
    let db_path = database_path(app)?;
    let connection = Connection::open(db_path)?;
    connection.execute_batch(SCHEMA_SQL)?;
    Ok(())
}
