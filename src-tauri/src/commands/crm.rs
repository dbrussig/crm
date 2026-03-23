use serde_json::Value;

use crate::database::repository;

#[tauri::command]
pub fn list_customers(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_customers(&app)
}

#[tauri::command]
pub fn get_customer_by_id(app: tauri::AppHandle, id: String) -> Result<Option<Value>, String> {
    repository::get_customer_by_id(&app, &id)
}

#[tauri::command]
pub fn find_customer_by_email(app: tauri::AppHandle, email: String) -> Result<Option<Value>, String> {
    repository::find_customer_by_email(&app, &email)
}

#[tauri::command]
pub fn upsert_customer(app: tauri::AppHandle, customer: Value) -> Result<(), String> {
    repository::upsert_customer(&app, &customer)
}

#[tauri::command]
pub fn delete_customer(app: tauri::AppHandle, id: String) -> Result<(), String> {
    repository::delete_customer(&app, &id)
}

#[tauri::command]
pub fn list_rental_requests(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_rental_requests(&app)
}

#[tauri::command]
pub fn get_rental_request(app: tauri::AppHandle, id: String) -> Result<Option<Value>, String> {
    repository::get_rental_request(&app, &id)
}

#[tauri::command]
pub fn upsert_rental_request(app: tauri::AppHandle, rental: Value) -> Result<(), String> {
    repository::upsert_rental_request(&app, &rental)
}

#[tauri::command]
pub fn update_rental_request(app: tauri::AppHandle, id: String, updates: Value) -> Result<(), String> {
    repository::update_rental_request(&app, &id, &updates)
}

#[tauri::command]
pub fn list_resources(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_resources(&app)
}

#[tauri::command]
pub fn upsert_resource(app: tauri::AppHandle, resource: Value) -> Result<(), String> {
    repository::upsert_resource(&app, &resource)
}

#[tauri::command]
pub fn update_resource(app: tauri::AppHandle, id: String, updates: Value) -> Result<(), String> {
    repository::update_resource(&app, &id, &updates)
}

#[tauri::command]
pub fn delete_resource(app: tauri::AppHandle, id: String) -> Result<(), String> {
    repository::delete_resource(&app, &id)
}

#[tauri::command]
pub fn list_messages(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_messages(&app)
}

#[tauri::command]
pub fn upsert_message(app: tauri::AppHandle, message: Value) -> Result<(), String> {
    repository::upsert_message(&app, &message)
}

#[tauri::command]
pub fn list_payments(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_payments(&app)
}

#[tauri::command]
pub fn upsert_payment(app: tauri::AppHandle, payment: Value) -> Result<(), String> {
    repository::upsert_payment(&app, &payment)
}

#[tauri::command]
pub fn delete_payment(app: tauri::AppHandle, id: String) -> Result<(), String> {
    repository::delete_payment(&app, &id)
}

#[tauri::command]
pub fn list_invoices(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    repository::list_invoices(&app)
}

#[tauri::command]
pub fn upsert_invoice(app: tauri::AppHandle, invoice: Value) -> Result<(), String> {
    repository::upsert_invoice(&app, &invoice)
}

#[tauri::command]
pub fn delete_invoice(app: tauri::AppHandle, id: String) -> Result<(), String> {
    repository::delete_invoice(&app, &id)
}

#[tauri::command]
pub fn list_invoice_items(app: tauri::AppHandle, invoiceId: String) -> Result<Vec<Value>, String> {
    repository::list_invoice_items(&app, &invoiceId)
}

#[tauri::command]
pub fn replace_invoice_items(app: tauri::AppHandle, invoiceId: String, items: Vec<Value>) -> Result<(), String> {
    repository::replace_invoice_items(&app, &invoiceId, &items)
}
