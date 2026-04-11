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
    let state = string_field_optional(invoice, "state").unwrap_or_else(|| "entwurf".to_string());
    let service_period_start = optional_number_field(invoice, "servicePeriodStart");
    let service_period_end = optional_number_field(invoice, "servicePeriodEnd");
    let total_amount = value_to_f64(invoice.get("totalGross")).unwrap_or(0.0);
    let created_at = number_field(invoice, "createdAt");
    let updated_at = number_field(invoice, "updatedAt");
    let raw_json = invoice.to_string();

    connection
        .execute(
            "INSERT INTO invoices (
               id, rental_request_id, type, number, state, service_period_start, service_period_end, total_amount, created_at, updated_at, raw_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               rental_request_id = excluded.rental_request_id,
               type = excluded.type,
               number = excluded.number,
               state = excluded.state,
               service_period_start = excluded.service_period_start,
               service_period_end = excluded.service_period_end,
               total_amount = excluded.total_amount,
               updated_at = excluded.updated_at,
               raw_json = excluded.raw_json",
            params![
                id,
                rental_request_id,
                invoice_type,
                number,
                state,
                service_period_start,
                service_period_end,
                total_amount,
                created_at,
                updated_at,
                raw_json
            ],
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
        let assigned_accessory_id = string_field_optional(item, "assignedAccessoryId");
        let raw_json = item.to_string();

        transaction
            .execute(
                "INSERT INTO invoice_items (id, invoice_id, order_index, created_at, assigned_accessory_id, raw_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, invoice_id, order_index, created_at, assigned_accessory_id, raw_json],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn check_accessory_availability(
    app: &AppHandle,
    accessory_id: &str,
    start_ms: i64,
    end_ms: i64,
    exclude_invoice_id: Option<&str>,
    exclude_invoice_item_id: Option<&str>,
) -> Result<Value, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare(
            "SELECT inv.id, inv.number, inv.type, COALESCE(inv.state, ''), inv.service_period_start, inv.service_period_end
             FROM invoice_items it
             JOIN invoices inv ON inv.id = it.invoice_id
             WHERE it.assigned_accessory_id = ?1
               AND it.assigned_accessory_id IS NOT NULL
               AND inv.service_period_start IS NOT NULL
               AND inv.service_period_end IS NOT NULL
               AND COALESCE(inv.state, '') NOT IN ('storniert', 'abgelehnt', 'archiviert')
               AND (?2 IS NULL OR inv.id <> ?2)
               AND (?3 IS NULL OR it.id <> ?3)
               AND inv.service_period_start < ?5
               AND inv.service_period_end > ?4
             ORDER BY inv.service_period_start ASC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row(
            params![accessory_id, exclude_invoice_id, exclude_invoice_item_id, start_ms, end_ms],
            |row| {
                let invoice_id: String = row.get(0)?;
                let invoice_no: String = row.get(1)?;
                let invoice_type: String = row.get(2)?;
                let invoice_state: String = row.get(3)?;
                let service_start: i64 = row.get(4)?;
                let service_end: i64 = row.get(5)?;
                Ok((invoice_id, invoice_no, invoice_type, invoice_state, service_start, service_end))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((invoice_id, invoice_no, invoice_type, invoice_state, service_start, service_end)) = row {
        return Ok(json!({
            "isAvailable": false,
            "conflict": {
                "invoiceId": invoice_id,
                "invoiceNo": invoice_no,
                "invoiceType": invoice_type,
                "invoiceState": invoice_state,
                "servicePeriodStart": service_start,
                "servicePeriodEnd": service_end
            }
        }));
    }

    Ok(json!({ "isAvailable": true }))
}

pub fn list_accessory_bookings(app: &AppHandle, start_ms: i64, end_ms: i64) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare(
            "SELECT it.assigned_accessory_id, inv.id, inv.number, inv.type, COALESCE(inv.state, ''), inv.service_period_start, inv.service_period_end
             FROM invoice_items it
             JOIN invoices inv ON inv.id = it.invoice_id
             WHERE it.assigned_accessory_id IS NOT NULL
               AND TRIM(it.assigned_accessory_id) <> ''
               AND inv.service_period_start IS NOT NULL
               AND inv.service_period_end IS NOT NULL
               AND COALESCE(inv.state, '') NOT IN ('storniert', 'abgelehnt', 'archiviert')
               AND inv.service_period_start < ?2
               AND inv.service_period_end > ?1
             ORDER BY inv.service_period_start ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![start_ms, end_ms], |row| {
            let accessory_id: String = row.get(0)?;
            let invoice_id: String = row.get(1)?;
            let invoice_no: String = row.get(2)?;
            let invoice_type: String = row.get(3)?;
            let invoice_state: String = row.get(4)?;
            let service_start: i64 = row.get(5)?;
            let service_end: i64 = row.get(6)?;
            Ok(json!({
                "accessoryId": accessory_id,
                "invoiceId": invoice_id,
                "invoiceNo": invoice_no,
                "invoiceType": invoice_type,
                "invoiceState": invoice_state,
                "servicePeriodStart": service_start,
                "servicePeriodEnd": service_end
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// ─── Accessory calendar mapping + events ──────────────────────────────────────

pub fn upsert_accessory_calendar_mapping(
    app: &AppHandle,
    accessory_id: &str,
    google_calendar_id: &str,
    updated_at: i64,
) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute(
            "INSERT INTO accessory_calendar_mappings (accessory_id, google_calendar_id, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(accessory_id) DO UPDATE SET
               google_calendar_id = excluded.google_calendar_id,
               updated_at = excluded.updated_at",
            params![accessory_id, google_calendar_id, updated_at],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_accessory_calendar_mapping(app: &AppHandle, accessory_id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute(
            "DELETE FROM accessory_calendar_mappings WHERE accessory_id = ?1",
            params![accessory_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_accessory_calendar_mappings(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare("SELECT accessory_id, google_calendar_id, updated_at FROM accessory_calendar_mappings ORDER BY accessory_id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let accessory_id: String = row.get(0)?;
            let google_calendar_id: String = row.get(1)?;
            let updated_at: i64 = row.get(2)?;
            Ok(json!({
                "accessoryId": accessory_id,
                "googleCalendarId": google_calendar_id,
                "updatedAt": updated_at
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn upsert_accessory_calendar_event(app: &AppHandle, event: &Value) -> Result<(), String> {
    let connection = open_connection(app)?;
    let id = required_string(event, "id")?;
    let invoice_id = required_string(event, "invoiceId")?;
    let invoice_item_id = string_field_optional(event, "invoiceItemId");
    let accessory_id = required_string(event, "accessoryId")?;
    let kind = required_string(event, "kind")?;
    let title = required_string(event, "title")?;
    let start_time = number_field(event, "startTime");
    let end_time = number_field(event, "endTime");
    let google_calendar_id = string_field_optional(event, "googleCalendarId");
    let google_event_id = string_field_optional(event, "googleEventId");
    let sync_status = required_string(event, "syncStatus")?;
    let last_error = string_field_optional(event, "lastError");
    let created_at = number_field(event, "createdAt");
    let updated_at = number_field(event, "updatedAt");

    connection
        .execute(
            "INSERT INTO accessory_calendar_events (
               id, invoice_id, invoice_item_id, accessory_id, kind, title, start_time, end_time,
               google_calendar_id, google_event_id, sync_status, last_error, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(id) DO UPDATE SET
               invoice_id = excluded.invoice_id,
               invoice_item_id = excluded.invoice_item_id,
               accessory_id = excluded.accessory_id,
               kind = excluded.kind,
               title = excluded.title,
               start_time = excluded.start_time,
               end_time = excluded.end_time,
               google_calendar_id = excluded.google_calendar_id,
               google_event_id = excluded.google_event_id,
               sync_status = excluded.sync_status,
               last_error = excluded.last_error,
               updated_at = excluded.updated_at",
            params![
                id,
                invoice_id,
                invoice_item_id,
                accessory_id,
                kind,
                title,
                start_time,
                end_time,
                google_calendar_id,
                google_event_id,
                sync_status,
                last_error,
                created_at,
                updated_at
            ],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_accessory_calendar_events_for_invoice(app: &AppHandle, invoice_id: &str) -> Result<(), String> {
    let connection = open_connection(app)?;
    connection
        .execute(
            "DELETE FROM accessory_calendar_events WHERE invoice_id = ?1",
            params![invoice_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_accessory_calendar_events_for_invoice(app: &AppHandle, invoice_id: &str) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare(
            "SELECT id, invoice_id, invoice_item_id, accessory_id, kind, title, start_time, end_time,
                    google_calendar_id, google_event_id, sync_status, last_error, created_at, updated_at
             FROM accessory_calendar_events
             WHERE invoice_id = ?1
             ORDER BY start_time ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![invoice_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "invoiceId": row.get::<_, String>(1)?,
                "invoiceItemId": row.get::<_, Option<String>>(2)?,
                "accessoryId": row.get::<_, String>(3)?,
                "kind": row.get::<_, String>(4)?,
                "title": row.get::<_, String>(5)?,
                "startTime": row.get::<_, i64>(6)?,
                "endTime": row.get::<_, i64>(7)?,
                "googleCalendarId": row.get::<_, Option<String>>(8)?,
                "googleEventId": row.get::<_, Option<String>>(9)?,
                "syncStatus": row.get::<_, String>(10)?,
                "lastError": row.get::<_, Option<String>>(11)?,
                "createdAt": row.get::<_, i64>(12)?,
                "updatedAt": row.get::<_, i64>(13)?
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn list_accessory_calendar_events_range(app: &AppHandle, start_ms: i64, end_ms: i64) -> Result<Vec<Value>, String> {
    let connection = open_connection(app)?;
    let mut stmt = connection
        .prepare(
            "SELECT id, invoice_id, invoice_item_id, accessory_id, kind, title, start_time, end_time,
                    google_calendar_id, google_event_id, sync_status, last_error, created_at, updated_at
             FROM accessory_calendar_events
             WHERE start_time < ?2 AND end_time > ?1
             ORDER BY start_time ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start_ms, end_ms], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "invoiceId": row.get::<_, String>(1)?,
                "invoiceItemId": row.get::<_, Option<String>>(2)?,
                "accessoryId": row.get::<_, String>(3)?,
                "kind": row.get::<_, String>(4)?,
                "title": row.get::<_, String>(5)?,
                "startTime": row.get::<_, i64>(6)?,
                "endTime": row.get::<_, i64>(7)?,
                "googleCalendarId": row.get::<_, Option<String>>(8)?,
                "googleEventId": row.get::<_, Option<String>>(9)?,
                "syncStatus": row.get::<_, String>(10)?,
                "lastError": row.get::<_, Option<String>>(11)?,
                "createdAt": row.get::<_, i64>(12)?,
                "updatedAt": row.get::<_, i64>(13)?
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
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
