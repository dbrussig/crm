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
    ensure_payments_invoice_column(&connection)?;
    Ok(())
}

fn ensure_payments_invoice_column(connection: &Connection) -> Result<(), BoxError> {
    let mut stmt = connection.prepare("PRAGMA table_info(payments)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut has_invoice_id = false;
    for row in rows {
        let name = row?;
        if name == "invoice_id" {
            has_invoice_id = true;
            break;
        }
    }
    if !has_invoice_id {
        connection.execute("ALTER TABLE payments ADD COLUMN invoice_id TEXT", [])?;
    }
    Ok(())
}
