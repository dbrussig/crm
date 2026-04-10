use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn open_html_for_print(_app: tauri::AppHandle, html: String) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir();
    let file_path: PathBuf = tmp_dir.join("crm_print_invoice.html");
    fs::write(&file_path, html.as_bytes()).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        use objc2_foundation::{NSString, NSURL};

        let path_str = file_path
            .to_str()
            .ok_or_else(|| "Ungültiger Pfad.".to_string())?;
        let ns_path = NSString::from_str(path_str);
        let ns_url = NSURL::fileURLWithPath(&ns_path);
        let workspace = NSWorkspace::sharedWorkspace();
        if workspace.openURL(&ns_url) {
            Ok(())
        } else {
            Err("Konnte Druck-HTML nicht öffnen.".to_string())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_opener::OpenerExt;
        _app.opener()
            .open_path(file_path.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }
}
