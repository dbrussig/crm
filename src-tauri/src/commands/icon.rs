use std::fs;
use std::path::PathBuf;

use base64::Engine;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::database::init::database_path;

// ---------------------------------------------------------------------------
// Built-in icon definitions
// ---------------------------------------------------------------------------

struct IconDef {
    id: &'static str,
    label: &'static str,
    filename: &'static str,
}

const BUILTIN_ICONS: &[IconDef] = &[
    IconDef {
        id: "key-car",
        label: "Key & Car",
        filename: "icon-key-car.png",
    },
    IconDef {
        id: "cb-mono",
        label: "CB Mono",
        filename: "icon-cb-mono.png",
    },
    IconDef {
        id: "handshake",
        label: "Handshake",
        filename: "icon-handshake.png",
    },
    IconDef {
        id: "buddy",
        label: "Buddy",
        filename: "icon-buddy.png",
    },
    IconDef {
        id: "tag",
        label: "Tag",
        filename: "icon-tag.png",
    },
    IconDef {
        id: "fleet",
        label: "Fleet",
        filename: "icon-fleet.png",
    },
];

// ---------------------------------------------------------------------------
// JSON response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct IconInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|e| e.to_string())?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn get_setting(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let conn = open_connection(app)?;
    let result: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(result)
}

fn set_setting(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let conn = open_connection(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![key, value, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Directory where bundled variant PNGs live (inside .app/Contents/Resources).
fn variants_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let res_dir = app
        .path()
        .resolve("icons/variants", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    Ok(res_dir)
}

/// Directory where bundled thumbnail PNGs live.
fn thumbnails_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let res_dir = app
        .path()
        .resolve("icons/thumbnails", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    Ok(res_dir)
}

/// Directory for custom uploaded icons (lives next to the DB in app data).
fn custom_icons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = if let Some(icloud) = crate::database::init::icloud_documents_dir() {
        icloud.join("custom-icons")
    } else {
        app.path()
            .resolve("custom-icons", BaseDirectory::AppData)
            .map_err(|e| e.to_string())?
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolve the full PNG path for a given icon ID.
/// Checks built-in variants first, then custom icons directory.
fn resolve_icon_path(app: &AppHandle, icon_id: &str) -> Result<PathBuf, String> {
    // Built-in?
    for def in BUILTIN_ICONS {
        if def.id == icon_id {
            let path = variants_resource_dir(app)?.join(def.filename);
            if path.exists() {
                return Ok(path);
            }
        }
    }
    // Custom icon?
    let custom = custom_icons_dir(app)?.join(format!("{}.png", icon_id));
    if custom.exists() {
        return Ok(custom);
    }
    Err(format!("Icon '{}' not found", icon_id))
}

// ---------------------------------------------------------------------------
// macOS dock icon change via NSDockTile
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn set_dock_icon(path: &std::path::Path) -> Result<(), String> {
    use objc2::AnyThread;
    use objc2::MainThreadOnly;
    use objc2_app_kit::{NSApplication, NSImage, NSImageView};
    use objc2_foundation::{NSRect, NSSize};

    let mtm = objc2::MainThreadMarker::new()
        .ok_or_else(|| "set_dock_icon must be called on the main thread")?;

    let app = NSApplication::sharedApplication(mtm);
    let dock_tile = app.dockTile();

    let ns_string_path = objc2_foundation::NSString::from_str(&path.to_string_lossy());
    let url = objc2_foundation::NSURL::fileURLWithPath(&ns_string_path);

    let image = NSImage::initWithContentsOfURL(NSImage::alloc(), &url)
        .ok_or_else(|| format!("Failed to load NSImage from {:?}", path))?;

    image.setSize(NSSize::new(512.0, 512.0));

    let frame = NSRect::new(
        objc2_foundation::NSPoint::new(0.0, 0.0),
        NSSize::new(512.0, 512.0),
    );

    let image_view = {
        let iv = NSImageView::initWithFrame(NSImageView::alloc(mtm), frame);
        iv.setImage(Some(&image));
        iv.setImageScaling(objc2_app_kit::NSImageScaling::ScaleProportionallyUpOrDown);
        iv.setEditable(false);
        iv
    };

    dock_tile.setContentView(Some(&image_view));
    dock_tile.display();

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn set_dock_icon(_path: &std::path::Path) -> Result<(), String> {
    // Dock icon change is macOS-only; no-op on other platforms.
    Ok(())
}

// ---------------------------------------------------------------------------
// Public Tauri commands
// ---------------------------------------------------------------------------

/// Returns the list of available built-in icon variants.
#[tauri::command]
pub fn list_app_icons() -> Result<Vec<IconInfo>, String> {
    Ok(BUILTIN_ICONS
        .iter()
        .map(|def| IconInfo {
            id: def.id.to_string(),
            label: def.label.to_string(),
            filename: def.filename.to_string(),
        })
        .collect())
}

/// Returns the currently selected icon ID (or "default" if none set).
#[tauri::command]
pub fn get_current_app_icon(app: AppHandle) -> Result<String, String> {
    let val = get_setting(&app, "app_icon")?;
    Ok(val.unwrap_or_else(|| "default".to_string()))
}

/// Sets the current app icon: persists to settings and updates the dock icon.
#[tauri::command]
pub fn set_app_icon(app: AppHandle, icon_id: String) -> Result<(), String> {
    if icon_id == "default" {
        // Reset: remove setting, restore default dock icon
        set_setting(&app, "app_icon", "default")?;
        restore_default_dock_icon();
        return Ok(());
    }

    // Validate the icon exists
    let path = resolve_icon_path(&app, &icon_id)?;

    // Persist
    set_setting(&app, "app_icon", &icon_id)?;

    // Apply to dock
    set_dock_icon(&path)
}

/// Uploads a custom icon: base64-encoded PNG data.
/// Returns the assigned icon ID.
#[tauri::command]
pub fn upload_custom_icon(app: AppHandle, name: String, data: String) -> Result<String, String> {
    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    // Basic PNG header check
    if bytes.len() < 8 || bytes[0..4] != [0x89, 0x50, 0x4E, 0x47] {
        return Err("Uploaded file is not a valid PNG".to_string());
    }

    // Sanitize name into a safe ID: lowercase, replace non-alphanumeric with dash
    let safe_id: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if safe_id.is_empty() {
        return Err("Icon name results in empty ID".to_string());
    }

    let icon_id = format!("custom-{}", safe_id);
    let dir = custom_icons_dir(&app)?;
    let file_path = dir.join(format!("{}.png", icon_id));

    fs::write(&file_path, &bytes).map_err(|e| format!("Failed to write icon file: {}", e))?;

    // Persist as current icon
    set_setting(&app, "app_icon", &icon_id)?;

    // Apply to dock
    set_dock_icon(&file_path)?;

    Ok(icon_id)
}

/// Returns the thumbnail PNG data as base64 for a given icon.
/// Used by the frontend to display icon previews via data-URLs,
/// avoiding the need for tauri-plugin-asset or asset-protocol.
#[tauri::command]
pub fn get_icon_thumbnail_base64(app: AppHandle, icon_id: String) -> Result<String, String> {
    let path = find_thumbnail_path(&app, &icon_id)?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Resolve the file path for a thumbnail (built-in or custom).
fn find_thumbnail_path(app: &AppHandle, icon_id: &str) -> Result<PathBuf, String> {
    // Built-in thumbnail
    for def in BUILTIN_ICONS {
        if def.id == icon_id {
            let thumb_filename = def.filename.replace(".png", "-thumb.png");
            let path = thumbnails_resource_dir(app)?.join(&thumb_filename);
            if path.exists() {
                return Ok(path);
            }
            // Fallback to full variant
            let fallback = variants_resource_dir(app)?.join(def.filename);
            if fallback.exists() {
                return Ok(fallback);
            }
            return Err(format!("Thumbnail for '{}' not found", icon_id));
        }
    }

    // Custom icon: return the custom icon file itself (acts as its own thumbnail)
    if icon_id.starts_with("custom-") {
        let path = custom_icons_dir(app)?.join(format!("{}.png", icon_id));
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!("No thumbnail for icon '{}'", icon_id))
}

// ---------------------------------------------------------------------------
// Startup helper: apply saved icon if set
// ---------------------------------------------------------------------------

/// Restores the macOS dock icon to the app default.
#[cfg(target_os = "macos")]
fn restore_default_dock_icon() {
    use objc2_app_kit::NSApplication;

    let Some(mtm) = objc2::MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    let dock_tile = app.dockTile();
    dock_tile.setContentView(None);
    dock_tile.display();
}

#[cfg(not(target_os = "macos"))]
fn restore_default_dock_icon() {}

/// Apply the saved icon preference at startup. Call from lib.rs setup.
pub fn apply_saved_icon(app: &AppHandle) {
    match get_setting(app, "app_icon") {
        Ok(Some(icon_id)) if icon_id != "default" => match resolve_icon_path(app, &icon_id) {
            Ok(path) => {
                if let Err(e) = set_dock_icon(&path) {
                    eprintln!("[icon] Failed to apply dock icon '{}': {}", icon_id, e);
                }
            }
            Err(e) => {
                eprintln!("[icon] Saved icon '{}' not found: {}", icon_id, e);
            }
        },
        _ => {}
    }
}
