mod commands;
mod database;
mod security;
mod services;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            database::init::ensure_app_directories(&app_handle)?;
            database::init::ensure_database(&app_handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::healthcheck,
            commands::database::database_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
