use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::init::{database_path, docs_base_dir};

#[derive(Serialize)]
pub struct DocumentPayloadResponse {
    #[serde(rename = "dataBase64")]
    pub data_base64: String,
}

pub fn list_customer_documents(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM customer_documents ORDER BY created_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut items = Vec::new();
    for row in rows {
      let raw = row.map_err(|error| error.to_string())?;
      items.push(serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?);
    }
    Ok(items)
}

pub fn upsert_customer_document(
    app: &AppHandle,
    doc: &Value,
    payload_base64: Option<&str>,
) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(doc, "id")?;
    let customer_id = required_string(doc, "customerId")?;
    let file_name = required_string(doc, "filename")?;
    let mime_type = string_field_optional(doc, "mimeType");
    let size_bytes = optional_number_field(doc, "sizeBytes");
    let created_at = number_field(doc, "createdAt");
    let relative = relative_doc_filename(&id, &file_name);
    let file_path = resolve_doc_path(app, &relative)?;

    if let Some(payload) = payload_base64 {
        let bytes = STANDARD.decode(payload).map_err(|error| error.to_string())?;
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&file_path, bytes).map_err(|error| error.to_string())?;
    }

    let mut persisted = doc.clone();
    if let Value::Object(map) = &mut persisted {
        map.insert(
            "sizeBytes".to_string(),
            serde_json::json!(size_bytes.unwrap_or_else(|| file_size_or_zero(&file_path))),
        );
    }
    let raw_json = persisted.to_string();

    connection
        .execute(
            "INSERT INTO customer_documents (
               id, customer_id, file_path, file_name, mime_type, size_bytes, created_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               customer_id = excluded.customer_id,
               file_path = excluded.file_path,
               file_name = excluded.file_name,
               mime_type = excluded.mime_type,
               size_bytes = excluded.size_bytes,
               raw_json = excluded.raw_json",
            params![
                id,
                customer_id,
                relative.clone(),
                file_name,
                mime_type,
                size_bytes.unwrap_or_else(|| file_size_or_zero(&file_path)),
                created_at,
                raw_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn update_customer_document_meta(app: &AppHandle, doc_id: &str, patch: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let existing = fetch_single_json(
        &connection,
        "SELECT raw_json FROM customer_documents WHERE id = ?1",
        params![doc_id],
    )?
    .ok_or_else(|| "Document not found".to_string())?;

    let mut merged = existing;
    merge_json(&mut merged, patch);
    upsert_customer_document(app, &merged, None)
}

pub fn get_customer_document_payload(app: &AppHandle, doc_id: &str) -> Result<Option<DocumentPayloadResponse>, String> {
    let connection = open_connection(app)?;
    let file_path: Option<String> = connection
        .query_row(
            "SELECT file_path FROM customer_documents WHERE id = ?1",
            params![doc_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let Some(relative) = file_path else {
        return Ok(None);
    };

    let abs_path = if relative.starts_with('/') {
        PathBuf::from(&relative)
    } else {
        resolve_doc_path(app, &relative)?
    };
    let bytes = fs::read(&abs_path).map_err(|error| error.to_string())?;
    Ok(Some(DocumentPayloadResponse {
        data_base64: STANDARD.encode(bytes),
    }))
}

pub fn set_customer_document_payload(
    app: &AppHandle,
    doc_id: &str,
    payload_base64: &str,
) -> Result<(), String> {
    let connection = open_connection(app)?;
    let (file_path, raw_json): (String, String) = connection
        .query_row(
            "SELECT file_path, raw_json FROM customer_documents WHERE id = ?1",
            params![doc_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;

    let bytes = STANDARD.decode(payload_base64).map_err(|error| error.to_string())?;
    let abs_path = if file_path.starts_with('/') {
        PathBuf::from(&file_path)
    } else {
        resolve_doc_path(app, &file_path)?
    };
    fs::write(&abs_path, &bytes).map_err(|error| error.to_string())?;

    let mut payload = serde_json::from_str::<Value>(&raw_json).map_err(|error| error.to_string())?;
    if let Value::Object(map) = &mut payload {
        map.insert("sizeBytes".to_string(), serde_json::json!(bytes.len()));
    }

    connection
        .execute(
            "UPDATE customer_documents SET size_bytes = ?2, raw_json = ?3 WHERE id = ?1",
            params![doc_id, bytes.len() as i64, payload.to_string()],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn delete_customer_document(app: &AppHandle, doc_id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    let file_path: Option<String> = connection
        .query_row(
            "SELECT file_path FROM customer_documents WHERE id = ?1",
            params![doc_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(relative) = file_path {
        let abs = if relative.starts_with('/') {
            PathBuf::from(&relative)
        } else {
            resolve_doc_path(app, &relative).unwrap_or_else(|_| PathBuf::from(&relative))
        };
        let _ = fs::remove_file(abs);
    }

    connection
        .execute("DELETE FROM customer_documents WHERE id = ?1", params![doc_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_all_customer_documents(app: &AppHandle) -> Result<(), String> {
    let documents = list_customer_documents(app)?;
    for document in documents {
        if let Some(id) = document.get("id").and_then(Value::as_str) {
            delete_customer_document(app, id)?;
        }
    }
    Ok(())
}

fn relative_doc_filename(doc_id: &str, file_name: &str) -> String {
    format!("{}_{}", doc_id, sanitize_filename(file_name))
}

fn resolve_doc_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let docs_dir = docs_base_dir(app).map_err(|error| error.to_string())?;
    Ok(docs_dir.join(relative))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect()
}

fn file_size_or_zero(path: &Path) -> i64 {
    fs::metadata(path).map(|meta| meta.len() as i64).unwrap_or(0)
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|error| error.to_string())?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;")
        .map_err(|error| error.to_string())?;
    Ok(conn)
}

fn fetch_single_json<P>(connection: &Connection, sql: &str, params: P) -> Result<Option<Value>, String>
where
    P: rusqlite::Params,
{
    connection
        .query_row(sql, params, |row| row.get::<_, String>(0))
        .optional()
        .map_err(|error| error.to_string())?
        .map(|raw| serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string()))
        .transpose()
}

fn merge_json(target: &mut Value, updates: &Value) {
    match (target, updates) {
        (Value::Object(target_map), Value::Object(update_map)) => {
            for (key, value) in update_map {
                if value.is_null() {
                    target_map.remove(key);
                } else {
                    target_map.insert(key.clone(), value.clone());
                }
            }
        }
        (target_value, update_value) => {
            *target_value = update_value.clone();
        }
    }
}

fn required_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|v| v.to_string())
        .ok_or_else(|| format!("Missing field: {}", key))
}

fn string_field_optional(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(|v| v.to_string())
}

fn number_field(value: &Value, key: &str) -> i64 {
    optional_number_field(value, key).unwrap_or(chrono::Utc::now().timestamp_millis())
}

fn optional_number_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}
