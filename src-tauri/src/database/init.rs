use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use super::schema::SCHEMA_SQL;

type BoxError = Box<dyn std::error::Error>;
const PROD_IDENTIFIER: &str = "com.serverraum247.mietparkcrm.desktop";
const PROD_ICLOUD_FOLDER: &str = "CRM Desktop";

fn is_production_identifier(identifier: &str) -> bool {
    identifier.trim() == PROD_IDENTIFIER
}

pub fn icloud_documents_dir_for_identifier(identifier: &str) -> Option<PathBuf> {
    if !is_production_identifier(identifier) {
        return None;
    }

    let home = std::env::var("HOME").ok()?;
    let path = PathBuf::from(home)
        .join("Library")
        .join("Mobile Documents")
        .join("com~apple~CloudDocs")
        .join(PROD_ICLOUD_FOLDER);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

pub fn icloud_documents_dir_for_app(app: &AppHandle) -> Option<PathBuf> {
    icloud_documents_dir_for_identifier(&app.config().identifier)
}

pub fn ensure_app_directories(app: &AppHandle) -> Result<(), BoxError> {
    let app_dir = app.path().resolve("data", BaseDirectory::AppData)?;
    fs::create_dir_all(app_dir)?;
    Ok(())
}

/// Returns the iCloud Drive storage directory for CRM Desktop.
/// Uses the user-visible iCloud Drive folder "CRM Desktop" so that
/// iOS apps can read/write the same data via iCloud Drive access.
/// Path: ~/Library/Mobile Documents/com~apple~CloudDocs/CRM Desktop
pub fn icloud_documents_dir() -> Option<PathBuf> {
    icloud_documents_dir_for_identifier(PROD_IDENTIFIER)
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir_for_app(app) {
        let data_dir = icloud_dir.join("data");
        fs::create_dir_all(&data_dir)?;
        return Ok(data_dir.join("mietpark-crm.db"));
    }

    Ok(app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?)
}

pub fn docs_base_dir(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir_for_app(app) {
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
    let Some(icloud_dir) = icloud_documents_dir_for_app(app) else {
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
    ensure_invoices_hybrid_columns(&connection)?;
    ensure_invoice_items_hybrid_columns(&connection)?;
    ensure_hybrid_indexes(&connection)?;
    ensure_accessory_calendar_tables(&connection)?;
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

fn ensure_invoices_hybrid_columns(connection: &Connection) -> Result<(), BoxError> {
    let mut stmt = connection.prepare("PRAGMA table_info(invoices)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut has_state = false;
    let mut has_service_start = false;
    let mut has_service_end = false;
    for row in rows {
        let name = row?;
        match name.as_str() {
            "state" => has_state = true,
            "service_period_start" => has_service_start = true,
            "service_period_end" => has_service_end = true,
            _ => {}
        }
    }
    if !has_state {
        connection.execute("ALTER TABLE invoices ADD COLUMN state TEXT", [])?;
    }
    if !has_service_start {
        connection.execute("ALTER TABLE invoices ADD COLUMN service_period_start INTEGER", [])?;
    }
    if !has_service_end {
        connection.execute("ALTER TABLE invoices ADD COLUMN service_period_end INTEGER", [])?;
    }
    Ok(())
}

fn ensure_invoice_items_hybrid_columns(connection: &Connection) -> Result<(), BoxError> {
    let mut stmt = connection.prepare("PRAGMA table_info(invoice_items)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut has_assigned_accessory_id = false;
    for row in rows {
        let name = row?;
        if name == "assigned_accessory_id" {
            has_assigned_accessory_id = true;
            break;
        }
    }
    if !has_assigned_accessory_id {
        connection.execute("ALTER TABLE invoice_items ADD COLUMN assigned_accessory_id TEXT", [])?;
    }
    Ok(())
}

fn ensure_hybrid_indexes(connection: &Connection) -> Result<(), BoxError> {
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_invoice_items_assigned_accessory_id ON invoice_items(assigned_accessory_id)",
        [],
    )?;
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_invoices_service_period ON invoices(service_period_start, service_period_end)",
        [],
    )?;
    Ok(())
}

fn ensure_accessory_calendar_tables(connection: &Connection) -> Result<(), BoxError> {
    // Tables are created via SCHEMA_SQL, but older DBs need the new tables too.
    connection.execute(
        "CREATE TABLE IF NOT EXISTS accessory_calendar_mappings (
            accessory_id TEXT PRIMARY KEY,
            google_calendar_id TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    connection.execute(
        "CREATE TABLE IF NOT EXISTS accessory_calendar_events (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            invoice_item_id TEXT,
            accessory_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            google_calendar_id TEXT,
            google_event_id TEXT,
            sync_status TEXT NOT NULL,
            last_error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        )",
        [],
    )?;

    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_accessory_calendar_events_accessory_time ON accessory_calendar_events(accessory_id, start_time, end_time)",
        [],
    )?;
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_accessory_calendar_events_invoice_id ON accessory_calendar_events(invoice_id)",
        [],
    )?;

    Ok(())
}
