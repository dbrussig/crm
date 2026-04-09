mod commands;
mod database;
mod security;
mod services;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle();
            database::init::ensure_app_directories(&app_handle)?;
            if let Err(error) = database::init::migrate_data_to_icloud(&app_handle) {
                eprintln!("[iCloud] Migration fehlgeschlagen (non-fatal): {}", error);
            }
            database::init::ensure_database(&app_handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_get_secret,
            commands::auth::auth_set_secret,
            commands::auth::auth_delete_secret,
            commands::contacts::contacts_request_access,
            commands::contacts::contacts_list_contacts,
            commands::contacts::contacts_save_contact,
            commands::contacts::contacts_update_contact,
            commands::health::healthcheck,
            commands::database::database_summary,
            commands::database::create_icloud_backup,
            commands::database::list_icloud_backups,
            commands::crm::list_customers,
            commands::crm::get_customer_by_id,
            commands::crm::find_customer_by_email,
            commands::crm::upsert_customer,
            commands::crm::delete_customer,
            commands::crm::list_rental_requests,
            commands::crm::get_rental_request,
            commands::crm::upsert_rental_request,
            commands::crm::update_rental_request,
            commands::crm::list_resources,
            commands::crm::upsert_resource,
            commands::crm::update_resource,
            commands::crm::delete_resource,
            commands::crm::list_accessories,
            commands::crm::upsert_accessory,
            commands::crm::update_accessory,
            commands::crm::delete_accessory,
            commands::crm::list_messages,
            commands::crm::upsert_message,
            commands::crm::list_payments,
            commands::crm::upsert_payment,
            commands::crm::delete_payment,
            commands::crm::list_invoices,
            commands::crm::upsert_invoice,
            commands::crm::delete_invoice,
            commands::crm::list_invoice_items,
            commands::crm::replace_invoice_items,
            commands::crm::list_customer_documents,
            commands::crm::upsert_customer_document,
            commands::crm::update_customer_document_meta,
            commands::crm::get_customer_document_payload,
            commands::crm::set_customer_document_payload,
            commands::crm::delete_customer_document,
            commands::crm::delete_all_customer_documents,
            commands::crm::list_expenses,
            commands::crm::upsert_expense,
            commands::crm::delete_expense,
            commands::print::open_html_for_print,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
