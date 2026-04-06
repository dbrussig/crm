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

/// Returns the iCloud Drive documents container if available on this system.
/// Format: ~/Library/Mobile Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents
pub fn icloud_documents_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let container = "iCloud~com~serverraum247~mietparkcrm~desktop";
    let path = PathBuf::from(home)
        .join("Library")
        .join("Mobile Documents")
        .join(container)
        .join("Documents");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir() {
        let data_dir = icloud_dir.join("data");
        fs::create_dir_all(&data_dir)?;
        return Ok(data_dir.join("mietpark-crm.db"));
    }

    Ok(app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?)
}

pub fn docs_base_dir(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir() {
        let docs_dir = icloud_dir.join("documents");
        fs::create_dir_all(&docs_dir)?;
        return Ok(docs_dir);
    }

    let dir = app.path().resolve("documents", BaseDirectory::AppData)?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Best-effort migration from legacy AppData into iCloud container.
/// Legacy files remain as backup and are not deleted.
pub fn migrate_data_to_icloud(app: &AppHandle) -> Result<bool, BoxError> {
    let Some(icloud_dir) = icloud_documents_dir() else {
        return Ok(false);
    };

    let legacy_db = app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?;
    let new_db_dir = icloud_dir.join("data");
    let new_db = new_db_dir.join("mietpark-crm.db");
    if legacy_db.exists() && !new_db.exists() {
        fs::create_dir_all(&new_db_dir)?;
        fs::copy(&legacy_db, &new_db)?;
        eprintln!("[iCloud] DB migrated: {:?} -> {:?}", legacy_db, new_db);
    }

    let legacy_docs = app.path().resolve("documents", BaseDirectory::AppData)?;
    let new_docs = icloud_dir.join("documents");
    if legacy_docs.exists() {
        fs::create_dir_all(&new_docs)?;
        let mut copied_count = 0usize;
        for entry in fs::read_dir(&legacy_docs)? {
            let entry = entry?;
            let dest = new_docs.join(entry.file_name());
            if !dest.exists() {
                fs::copy(entry.path(), dest)?;
                copied_count += 1;
            }
        }
        if copied_count > 0 {
            eprintln!(
                "[iCloud] Documents migrated: {:?} -> {:?} ({} files)",
                legacy_docs, new_docs, copied_count
            );
        }
    }

    Ok(true)
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
