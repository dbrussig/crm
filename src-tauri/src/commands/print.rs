use std::fs;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn open_html_for_print(app: tauri::AppHandle, html: String) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir();
    let file_path = tmp_dir.join("crm_print_invoice.html");
    fs::write(&file_path, html.as_bytes()).map_err(|e| e.to_string())?;
    let url = format!("file://{}", file_path.display());
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}
