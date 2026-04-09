use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::init::database_path;

pub fn list_customers(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM customers ORDER BY updated_at DESC")
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

pub fn get_customer_by_id(app: &AppHandle, id: &str) -> Result<Option<Value>, String> {
    let connection = open_connection(app)?;
    fetch_single_json(&connection, "SELECT raw_json FROM customers WHERE id = ?1", params![id])
}

pub fn find_customer_by_email(app: &AppHandle, email: &str) -> Result<Option<Value>, String> {
    let connection = open_connection(app)?;
    fetch_single_json(
        &connection,
        "SELECT raw_json FROM customers WHERE lower(email) = lower(?1) LIMIT 1",
        params![email],
    )
}

pub fn upsert_customer(app: &AppHandle, customer: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(customer, "id")?;
    let first_name = string_field(customer, "firstName");
    let last_name = string_field(customer, "lastName");
    let name = format!("{} {}", first_name, last_name).trim().to_string();
    let email = string_field_optional(customer, "email");
    let phone = string_field_optional(customer, "phone");
    let address = customer.get("address").cloned().unwrap_or_else(|| json!({})).to_string();
    let created_at = number_field(customer, "createdAt");
    let updated_at = number_field(customer, "updatedAt");
    let raw_json = customer.to_string();

    connection
        .execute(
            "INSERT INTO customers (id, name, email, phone, address, created_at, updated_at, raw_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               email = excluded.email,
               phone = excluded.phone,
               address = excluded.address,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![id, name, email, phone, address, created_at, updated_at, raw_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn delete_customer(app: &AppHandle, id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute("DELETE FROM customers WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn list_rental_requests(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM rental_requests ORDER BY created_at DESC")
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

pub fn get_rental_request(app: &AppHandle, id: &str) -> Result<Option<Value>, String> {
    let connection = open_connection(app)?;
    fetch_single_json(
        &connection,
        "SELECT raw_json FROM rental_requests WHERE id = ?1",
        params![id],
    )
}

pub fn upsert_rental_request(app: &AppHandle, rental: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(rental, "id")?;
    let customer_id = required_string(rental, "customerId")?;
    let resource_id = string_field_optional(rental, "resourceId");
    let status = required_string(rental, "status")?;
    let notes = string_field_optional(rental, "description");
    let start_date = optional_number_field(rental, "rentalStart");
    let end_date = optional_number_field(rental, "rentalEnd");
    let created_at = number_field(rental, "createdAt");
    let updated_at = number_field(rental, "updatedAt");
    let raw_json = rental.to_string();

    connection
        .execute(
            "INSERT INTO rental_requests (
               id, customer_id, resource_id, start_date, end_date, status, notes, created_at, updated_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               customer_id = excluded.customer_id,
               resource_id = excluded.resource_id,
               start_date = excluded.start_date,
               end_date = excluded.end_date,
               status = excluded.status,
               notes = excluded.notes,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![
                id,
                customer_id,
                resource_id,
                start_date,
                end_date,
                status,
                notes,
                created_at,
                updated_at,
                raw_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn update_rental_request(app: &AppHandle, id: &str, updates: &Value) -> Result<(), String> {
    let existing = get_rental_request(app, id)?.ok_or_else(|| "Rental not found".to_string())?;
    let mut merged = existing;
    merge_json(&mut merged, updates);

    if merged.get("updatedAt").is_none() {
      merged["updatedAt"] = json!(chrono::Utc::now().timestamp_millis());
    }

    upsert_rental_request(app, &merged)
}

pub fn list_resources(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM resources ORDER BY created_at DESC")
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

pub fn upsert_resource(app: &AppHandle, resource: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(resource, "id")?;
    let name = required_string(resource, "name")?;
    let category = string_field(resource, "type");
    let daily_rate = optional_number_field(resource, "dailyRate").unwrap_or(0);
    let created_at = number_field(resource, "createdAt");
    let updated_at = optional_number_field(resource, "updatedAt").unwrap_or(created_at);
    let raw_json = resource.to_string();

    connection
        .execute(
            "INSERT INTO resources (id, name, license_plate, category, daily_rate, created_at, updated_at, raw_json)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               daily_rate = excluded.daily_rate,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![id, name, category, daily_rate, created_at, updated_at, raw_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn update_resource(app: &AppHandle, id: &str, updates: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let existing = fetch_single_json(
        &connection,
        "SELECT raw_json FROM resources WHERE id = ?1",
        params![id],
    )?
    .ok_or_else(|| "Resource not found".to_string())?;

    let mut merged = existing;
    merge_json(&mut merged, updates);
    upsert_resource(app, &merged)
}

pub fn delete_resource(app: &AppHandle, id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute("DELETE FROM resources WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn list_accessories(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM accessories ORDER BY updated_at DESC")
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

pub fn upsert_accessory(app: &AppHandle, accessory: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(accessory, "id")?;
    let name = required_string(accessory, "name")?;
    let category = required_string(accessory, "category")?;
    let inventory_key = required_string(accessory, "inventoryKey")?;
    let brand = string_field_optional(accessory, "brand");
    let model = string_field_optional(accessory, "model");
    let is_active = if accessory
        .get("isActive")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
    {
        1
    } else {
        0
    };
    let created_at = number_field(accessory, "createdAt");
    let updated_at = optional_number_field(accessory, "updatedAt").unwrap_or(created_at);
    let raw_json = accessory.to_string();

    connection
        .execute(
            "INSERT INTO accessories (
               id, name, category, inventory_key, brand, model, is_active, created_at, updated_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               inventory_key = excluded.inventory_key,
               brand = excluded.brand,
               model = excluded.model,
               is_active = excluded.is_active,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![
                id,
                name,
                category,
                inventory_key,
                brand,
                model,
                is_active,
                created_at,
                updated_at,
                raw_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn update_accessory(app: &AppHandle, id: &str, updates: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let existing = fetch_single_json(
        &connection,
        "SELECT raw_json FROM accessories WHERE id = ?1",
        params![id],
    )?
    .ok_or_else(|| "Accessory not found".to_string())?;

    let mut merged = existing;
    merge_json(&mut merged, updates);
    upsert_accessory(app, &merged)
}

pub fn delete_accessory(app: &AppHandle, id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute("DELETE FROM accessories WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn list_messages(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM messages ORDER BY created_at DESC")
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

pub fn upsert_message(app: &AppHandle, message: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(message, "id")?;
    let rental_request_id = string_field_optional(message, "rentalRequestId");
    let customer_id = string_field_optional(message, "customerId");
    let subject = string_field_optional(message, "subject");
    let body = string_field(message, "message");
    let received_at = optional_number_field(message, "receivedAt").unwrap_or(number_field(message, "createdAt"));
    let created_at = number_field(message, "createdAt");
    let raw_json = message.to_string();

    connection
        .execute(
            "INSERT INTO messages (
               id, rental_request_id, customer_id, from_address, subject, body, received_at, created_at, raw_json
             ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               rental_request_id = excluded.rental_request_id,
               customer_id = excluded.customer_id,
               subject = excluded.subject,
               body = excluded.body,
               received_at = excluded.received_at,
               raw_json = excluded.raw_json",
            params![id, rental_request_id, customer_id, subject, body, received_at, created_at, raw_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn list_payments(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM payments ORDER BY received_at DESC")
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

pub fn upsert_payment(app: &AppHandle, payment: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(payment, "id")?;
    let rental_request_id = required_string(payment, "rentalRequestId")?;
    let invoice_id = string_field_optional(payment, "invoiceId");
    let customer_id = string_field_optional(payment, "customerId");
    let kind = required_string(payment, "kind")?;
    let method = required_string(payment, "method")?;
    let amount = value_to_f64(payment.get("amount")).unwrap_or(0.0);
    let currency = required_string(payment, "currency")?;
    let received_at = optional_number_field(payment, "receivedAt").unwrap_or(number_field(payment, "createdAt"));
    let created_at = number_field(payment, "createdAt");
    let raw_json = payment.to_string();

    connection
        .execute(
            "INSERT INTO payments (
               id, rental_request_id, invoice_id, customer_id, kind, method, amount, currency, received_at, created_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               rental_request_id = excluded.rental_request_id,
               invoice_id = excluded.invoice_id,
               customer_id = excluded.customer_id,
               kind = excluded.kind,
               method = excluded.method,
               amount = excluded.amount,
               currency = excluded.currency,
               received_at = excluded.received_at,
               raw_json = excluded.raw_json",
            params![
                id,
                rental_request_id,
                invoice_id,
                customer_id,
                kind,
                method,
                amount,
                currency,
                received_at,
                created_at,
                raw_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn delete_payment(app: &AppHandle, id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute("DELETE FROM payments WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn list_invoices(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM invoices ORDER BY created_at DESC")
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

pub fn upsert_invoice(app: &AppHandle, invoice: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(invoice, "id")?;
    let rental_request_id = string_field_optional(invoice, "rentalRequestId");
    let invoice_type = required_string(invoice, "invoiceType")?;
    let number = required_string(invoice, "invoiceNo")?;
    let total_amount = value_to_f64(invoice.get("totalGross")).unwrap_or(0.0);
    let created_at = number_field(invoice, "createdAt");
    let updated_at = number_field(invoice, "updatedAt");
    let raw_json = invoice.to_string();

    connection
        .execute(
            "INSERT INTO invoices (
               id, rental_request_id, type, number, total_amount, created_at, updated_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               rental_request_id = excluded.rental_request_id,
               type = excluded.type,
               number = excluded.number,
               total_amount = excluded.total_amount,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![id, rental_request_id, invoice_type, number, total_amount, created_at, updated_at, raw_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn delete_invoice(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut connection = open_connection(app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;

    // Keep delete robust even when payments are already mapped to this invoice.
    transaction
        .execute(
            "UPDATE payments SET invoice_id = NULL WHERE invoice_id = ?1",
            params![id],
        )
        .map_err(|error| error.to_string())?;

    // Respect FK order: child rows first, parent invoice last.
    transaction
        .execute("DELETE FROM invoice_items WHERE invoice_id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM invoices WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn list_invoice_items(app: &AppHandle, invoice_id: &str) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM invoice_items WHERE invoice_id = ?1 ORDER BY order_index ASC")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![invoice_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let raw = row.map_err(|error| error.to_string())?;
        items.push(serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?);
    }
    Ok(items)
}

pub fn replace_invoice_items(app: &AppHandle, invoice_id: &str, items: &[Value]) -> Result<(), String> {
    let mut connection = open_connection(app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM invoice_items WHERE invoice_id = ?1", params![invoice_id])
        .map_err(|error| error.to_string())?;

    for item in items {
        let id = required_string(item, "id")?;
        let order_index = optional_number_field(item, "orderIndex").unwrap_or(0);
        let created_at = number_field(item, "createdAt");
        let raw_json = item.to_string();

        transaction
            .execute(
                "INSERT INTO invoice_items (id, invoice_id, order_index, created_at, raw_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, invoice_id, order_index, created_at, raw_json],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
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
    let raw = connection
        .query_row(sql, params, |row| row.get::<_, String>(0))
        .optional()
        .map_err(|error| error.to_string())?;

    raw.map(|value| serde_json::from_str::<Value>(&value).map_err(|error| error.to_string()))
        .transpose()
}

fn merge_json(target: &mut Value, updates: &Value) {
    match (target, updates) {
        (Value::Object(target_map), Value::Object(update_map)) => {
            for (key, value) in update_map {
                target_map.insert(key.clone(), value.clone());
            }
        }
        (target_value, update_value) => {
            *target_value = update_value.clone();
        }
    }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

pub fn list_expenses(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT raw_json FROM expenses ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| e.to_string())?;
        items.push(serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?);
    }
    Ok(items)
}

pub fn upsert_expense(app: &AppHandle, expense: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(expense, "id")?;
    let date = number_field(expense, "date");
    let amount = value_to_f64(expense.get("amount")).unwrap_or(0.0);
    let description = string_field_optional(expense, "description");
    let invoice_issuer = string_field_optional(expense, "invoiceIssuer");
    let is_recurring = expense.get("isRecurring").and_then(Value::as_bool).unwrap_or(false) as i64;
    let recurring_interval = string_field_optional(expense, "recurringInterval");
    let attachment_json = expense.get("attachment").map(|v| v.to_string());
    let created_at = number_field(expense, "createdAt");
    let updated_at = number_field(expense, "updatedAt");
    let raw_json = expense.to_string();

    connection.execute(
        "INSERT INTO expenses (id, date, amount, description, invoice_issuer, is_recurring, recurring_interval, attachment_json, created_at, updated_at, raw_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           amount = excluded.amount,
           description = excluded.description,
           invoice_issuer = excluded.invoice_issuer,
           is_recurring = excluded.is_recurring,
           recurring_interval = excluded.recurring_interval,
           attachment_json = excluded.attachment_json,
           updated_at = excluded.updated_at,
           raw_json = excluded.raw_json",
        params![id, date, amount, description, invoice_issuer, is_recurring, recurring_interval, attachment_json, created_at, updated_at, raw_json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_expense(app: &AppHandle, id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection.execute("DELETE FROM expenses WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────

fn required_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|v| v.to_string())
        .ok_or_else(|| format!("Missing field: {}", key))
}

fn string_field(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
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

fn value_to_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(|raw| raw.as_f64().or_else(|| raw.as_i64().map(|v| v as f64)))
}
