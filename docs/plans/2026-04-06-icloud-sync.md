# iCloud Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** DB und Dokumente in iCloud Drive synchronisieren — analog zu Enpass auf macOS — sodass Daten automatisch zwischen Geräten synchronisiert und im iCloud-Backup enthalten sind.

**Architecture:** Die SQLite-Datenbank und Dokumente werden in den iCloud Drive Container der App
(`~/Library/Mobile Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/`) verschoben.
macOS `bird`-Daemon übernimmt die Synchronisierung automatisch. Fallback auf `AppData` bleibt erhalten
wenn iCloud nicht verfügbar ist. Bestehende Daten werden einmalig migriert — die alten Pfade bleiben
als Backup erhalten.

**Tech Stack:** Rust (Tauri 2), rusqlite, TypeScript, JSZip

---

## Voraussetzung (manuell, nicht automatisierbar)

**Apple Developer Certificate erforderlich** für Task 3 (iCloud Drive).

1. Apple Developer Program beitreten (kostenpflichtig): https://developer.apple.com/programs/
2. In Xcode oder unter developer.apple.com ein **Apple Development** Zertifikat erstellen
3. Den Zertifikat-Namen in `src-tauri/tauri.conf.json` eintragen:
   ```json
   "macOS": { "signingIdentity": "Apple Development: dein@email.de (TEAMID)" }
   ```
4. `TEAMID` ist das 10-stellige Team-Kürzel aus dem Developer Portal (z.B. `AB12CD34EF`)

Tasks 1, 2 und 4 können **ohne** Developer Certificate umgesetzt werden.

---

## Task 1: SQLite WAL-Mode aktivieren

**Warum zuerst:** Niedrigstes Risiko, sofortiger Nutzen. Schützt die DB wenn iCloud-Daemon
(`bird`) während eines Schreibvorgangs auf die Datei zugreift.

**Files:**
- Modify: `src-tauri/src/database/repository.rs:447-450`
- Modify: `src-tauri/src/database/documents.rs:214-217`

### Schritt 1: `open_connection` in `repository.rs` anpassen

Ersetze Zeilen 447-450 in `src-tauri/src/database/repository.rs`:

**Alt:**
```rust
fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|error| error.to_string())?;
    Connection::open(path).map_err(|error| error.to_string())
}
```

**Neu:**
```rust
fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|error| error.to_string())?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;"
    ).map_err(|error| error.to_string())?;
    Ok(conn)
}
```

### Schritt 2: `open_connection` in `documents.rs` identisch anpassen

Ersetze Zeilen 214-217 in `src-tauri/src/database/documents.rs`:

**Alt:**
```rust
fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|error| error.to_string())?;
    Connection::open(path).map_err(|error| error.to_string())
}
```

**Neu:**
```rust
fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app).map_err(|error| error.to_string())?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;"
    ).map_err(|error| error.to_string())?;
    Ok(conn)
}
```

### Schritt 3: Build prüfen

```bash
cd src-tauri && cargo check 2>&1
```

Erwartete Ausgabe: `Finished` ohne Errors.

### Schritt 4: Commit

```bash
git add src-tauri/src/database/repository.rs src-tauri/src/database/documents.rs
git commit -m "feat(db): enable WAL mode and busy_timeout on all SQLite connections"
```

---

## Task 2: Relative Dokument-Pfade in DB

**Warum:** `file_path`-Spalte speichert aktuell absolute Pfade. Bei der iCloud-Migration
würden alle bestehenden Einträge auf den falschen Pfad zeigen. Relative Pfade machen die
Migration atomar und sicher.

**Files:**
- Modify: `src-tauri/src/database/documents.rs` — Funktionen `document_path`, `upsert_customer_document`, `get_customer_document_payload`, `set_customer_document_payload`, `delete_customer_document`
- Modify: `src-tauri/src/database/init.rs` — neue `docs_base_dir()`-Hilfsfunktion

### Schritt 1: `docs_base_dir()` in `init.rs` hinzufügen

Füge nach `database_path()` (Zeile 19) in `src-tauri/src/database/init.rs` ein:

```rust
pub fn docs_base_dir(app: &AppHandle) -> Result<PathBuf, BoxError> {
    let dir = app.path().resolve("documents", BaseDirectory::AppData)?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
```

### Schritt 2: `document_path` in `documents.rs` auf relative Namen umstellen

Die Funktion `document_path` (Zeile 192) gibt jetzt nur noch den **relativen Dateinamen** zurück:

**Alt:**
```rust
fn document_path(app: &AppHandle, doc_id: &str, file_name: &str) -> Result<PathBuf, String> {
    let docs_dir = app
        .path()
        .resolve("documents", BaseDirectory::AppData)
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&docs_dir).map_err(|error| error.to_string())?;
    Ok(docs_dir.join(format!("{}_{}", doc_id, sanitize_filename(file_name))))
}
```

**Neu:** Teile in zwei Funktionen auf:

```rust
fn relative_doc_filename(doc_id: &str, file_name: &str) -> String {
    format!("{}_{}", doc_id, sanitize_filename(file_name))
}

fn resolve_doc_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let docs_dir = docs_base_dir(app).map_err(|error| error.to_string())?;
    Ok(docs_dir.join(relative))
}
```

Ergänze den Import am Anfang von `documents.rs`:
```rust
use super::init::{database_path, docs_base_dir};
```

### Schritt 3: `upsert_customer_document` anpassen

In `upsert_customer_document` (Zeile 47) — ersetze die Verwendung von `file_path`:

**Alt (Zeile 47):**
```rust
let file_path = document_path(app, &id, &file_name)?;
```

**Neu:**
```rust
let relative = relative_doc_filename(&id, &file_name);
let file_path = resolve_doc_path(app, &relative)?;
```

**Alt (Zeile 80-81):**
```rust
file_path.to_string_lossy().to_string(),
```

**Neu:**
```rust
relative.clone(),
```

### Schritt 4: `get_customer_document_payload` anpassen

Die Funktion liest `file_path` aus der DB (Zeile 110-123). Der gespeicherte Wert ist jetzt relativ:

Ersetze Zeilen 119-124:

**Alt:**
```rust
let Some(path) = file_path else {
    return Ok(None);
};

let bytes = fs::read(path).map_err(|error| error.to_string())?;
```

**Neu:**
```rust
let Some(relative) = file_path else {
    return Ok(None);
};

// Absoluten Pfad aus relativem Namen aufloesen.
// Fallback: wenn der gespeicherte Wert ein absoluter Pfad ist (Altdaten),
// diesen direkt verwenden.
let abs_path = if relative.starts_with('/') {
    PathBuf::from(&relative)
} else {
    resolve_doc_path(app, &relative)?
};

let bytes = fs::read(&abs_path).map_err(|error| error.to_string())?;
```

### Schritt 5: `set_customer_document_payload` anpassen

In `set_customer_document_payload` (Zeile 135, 144) — gleicher Fallback:

Ersetze nach dem Query (Zeile 144):

**Alt:**
```rust
fs::write(&file_path, &bytes).map_err(|error| error.to_string())?;
```

**Neu:**
```rust
let abs_path = if file_path.starts_with('/') {
    PathBuf::from(&file_path)
} else {
    resolve_doc_path(app, &file_path)?
};
fs::write(&abs_path, &bytes).map_err(|error| error.to_string())?;
```

### Schritt 6: `delete_customer_document` anpassen

Zeile 172 — gleicher Fallback:

**Alt:**
```rust
if let Some(path) = file_path {
    let _ = fs::remove_file(path);
}
```

**Neu:**
```rust
if let Some(relative) = file_path {
    let abs = if relative.starts_with('/') {
        PathBuf::from(&relative)
    } else {
        resolve_doc_path(app, &relative).unwrap_or_else(|_| PathBuf::from(&relative))
    };
    let _ = fs::remove_file(abs);
}
```

### Schritt 7: Build prüfen

```bash
cd src-tauri && cargo check 2>&1
```

Erwartete Ausgabe: `Finished` ohne Errors.

### Schritt 8: Commit

```bash
git add src-tauri/src/database/documents.rs src-tauri/src/database/init.rs
git commit -m "refactor(db): store relative document paths, resolve absolute at runtime"
```

---

## Task 3: iCloud Drive Container — Pfad-Migration

**Voraussetzung:** Apple Developer Certificate und `signingIdentity` in `tauri.conf.json` gesetzt.
Ohne Signatur kann dieser Task trotzdem implementiert werden — der iCloud-Pfad wird aber erst
tatsächlich synchronisiert wenn die App signiert ist.

**Files:**
- Modify: `src-tauri/src/database/init.rs`
- Create: `src-tauri/Entitlements.plist`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs` — Migration beim App-Start aufrufen

### Schritt 1: `Entitlements.plist` erstellen

Erstelle `src-tauri/Entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.developer.ubiquity-container-identifiers</key>
  <array>
    <string>$(TeamIdentifierPrefix)com.serverraum247.mietparkcrm.desktop</string>
  </array>
  <key>com.apple.developer.ubiquity-kvstore-identifier</key>
  <string>$(TeamIdentifierPrefix)com.serverraum247.mietparkcrm.desktop</string>
</dict>
</plist>
```

**Hinweis:** `$(TeamIdentifierPrefix)` wird von Xcode/codesign automatisch durch die Team-ID ersetzt
(z.B. `AB12CD34EF.`). Das Platzhalter-Literal `$(TeamIdentifierPrefix)` MUSS so stehen bleiben —
nicht manuell ersetzen.

### Schritt 2: `tauri.conf.json` um Entitlements-Pfad ergänzen

In `src-tauri/tauri.conf.json`, `bundle.macOS`-Block:

**Alt:**
```json
"macOS": {
  "signingIdentity": null
}
```

**Neu:**
```json
"macOS": {
  "signingIdentity": null,
  "entitlements": "Entitlements.plist"
}
```

(`signingIdentity` bleibt `null` bis das Developer Certificate vorhanden ist.)

### Schritt 3: iCloud-Hilfsfunktionen in `init.rs` hinzufügen

Füge in `src-tauri/src/database/init.rs` nach den Imports folgende Funktionen ein:

```rust
/// Gibt den iCloud Drive Container-Pfad zurück, falls verfügbar.
/// Format: ~/Library/Mobile Documents/iCloud~{bundle-id-mit-tilden}/Documents/
/// Gibt None zurück wenn iCloud auf dem System nicht verfügbar ist.
pub fn icloud_documents_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    // Bundle-ID: com.serverraum247.mietparkcrm.desktop
    // → Punkte durch Tilden ersetzen für Container-Name
    let container = "iCloud~com~serverraum247~mietparkcrm~desktop";
    let path = PathBuf::from(home)
        .join("Library")
        .join("Mobile Documents")
        .join(container)
        .join("Documents");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}
```

### Schritt 4: `database_path` und `docs_base_dir` auf iCloud umstellen

Ersetze `database_path` und `docs_base_dir` in `init.rs`:

**Neu:**
```rust
pub fn database_path(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir() {
        let data_dir = icloud_dir.join("data");
        fs::create_dir_all(&data_dir)?;
        return Ok(data_dir.join("mietpark-crm.db"));
    }
    // Fallback: kein iCloud verfügbar
    let fallback = app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?;
    Ok(fallback)
}

pub fn docs_base_dir(app: &AppHandle) -> Result<PathBuf, BoxError> {
    if let Some(icloud_dir) = icloud_documents_dir() {
        let docs_dir = icloud_dir.join("documents");
        fs::create_dir_all(&docs_dir)?;
        return Ok(docs_dir);
    }
    // Fallback
    let dir = app.path().resolve("documents", BaseDirectory::AppData)?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
```

### Schritt 5: Migrations-Funktion in `init.rs` hinzufügen

```rust
/// Verschiebt DB und Dokumente von AppData in den iCloud-Container.
/// Sicher: Altdaten in AppData bleiben als Backup erhalten.
/// Gibt Ok(true) zurück wenn Migration durchgeführt wurde.
pub fn migrate_data_to_icloud(app: &AppHandle) -> Result<bool, BoxError> {
    let Some(icloud_dir) = icloud_documents_dir() else {
        return Ok(false); // iCloud nicht verfügbar
    };

    // DB migrieren
    let legacy_db = app.path().resolve("data/mietpark-crm.db", BaseDirectory::AppData)?;
    let new_db_dir = icloud_dir.join("data");
    let new_db = new_db_dir.join("mietpark-crm.db");
    if legacy_db.exists() && !new_db.exists() {
        fs::create_dir_all(&new_db_dir)?;
        fs::copy(&legacy_db, &new_db)?;
        eprintln!("[iCloud] DB migriert: {:?} → {:?}", legacy_db, new_db);
    }

    // Dokumente migrieren
    let legacy_docs = app.path().resolve("documents", BaseDirectory::AppData)?;
    let new_docs = icloud_dir.join("documents");
    if legacy_docs.exists() && !new_docs.exists() {
        fs::create_dir_all(&new_docs)?;
        for entry in fs::read_dir(&legacy_docs)? {
            let entry = entry?;
            let dest = new_docs.join(entry.file_name());
            if !dest.exists() {
                fs::copy(entry.path(), dest)?;
            }
        }
        eprintln!("[iCloud] Dokumente migriert: {:?} → {:?}", legacy_docs, new_docs);
    }

    Ok(true)
}
```

### Schritt 6: Migration beim App-Start aufrufen

In `src-tauri/src/lib.rs` (oder `main.rs`) — die Stelle wo `ensure_database` aufgerufen wird.
Suche nach `ensure_database` und füge davor die Migration ein:

```rust
// Migration zu iCloud (einmalig, sicher)
if let Err(e) = database::init::migrate_data_to_icloud(&app) {
    eprintln!("[iCloud] Migration fehlgeschlagen (non-fatal): {}", e);
}
// Danach DB initialisieren (nutzt jetzt iCloud-Pfad)
database::init::ensure_database(&app)?;
```

### Schritt 7: Build prüfen

```bash
cd src-tauri && cargo check 2>&1
```

Erwartete Ausgabe: `Finished` ohne Errors.

### Schritt 8: Manuell testen (ohne Signatur)

```bash
npm run tauri:dev
```

Prüfe in der App ob der DB-Pfad jetzt iCloud verwendet:
- Einstellungen → Debug-Panel → "DB Summary" — sollte iCloud-Pfad zeigen wenn `~/Library/Mobile Documents/iCloud~...` existiert.

### Schritt 9: Commit

```bash
git add src-tauri/Entitlements.plist src-tauri/tauri.conf.json src-tauri/src/database/init.rs src-tauri/src/lib.rs
git commit -m "feat(icloud): add iCloud Drive container path, entitlements, and AppData migration"
```

---

## Task 4: `snapshot()` und `restore()` auf SQLite umstellen

**Warum:** `backupService.ts` liest aktuell aus IndexedDB-Legacy-Keys — bei migrierten Instanzen
sind diese leer. Backups sichern faktisch nichts. Fix: alle `loadJson()`-Calls durch die
bereits existierenden `sqliteService`-Funktionen ersetzen.

**Files:**
- Modify: `src/services/backupService.ts:26-48`

### Schritt 1: Imports in `backupService.ts` ergänzen

Am Anfang der Datei nach den bestehenden Imports einfügen:

```typescript
import {
  getAllCustomers,
  getAllRentalRequests,
  getAllMessages,
  loadPayments,
  getAllResources,
  getAllCustomerDocuments,
  fetchAllInvoices as getAllInvoicesFromDb,
  fetchAllInvoiceItems,
  createCustomer,
  createRentalRequest,
  upsertMessage,
  addPayment,
  upsertResource,
  upsertInvoice,
  replaceInvoiceItems,
} from './sqliteService';
```

**Hinweis:** Prüfe welche dieser Funktionen in `sqliteService.ts` tatsächlich exportiert werden.
Passe Namen ggf. an (z.B. `getAllCustomers` heißt dort möglicherweise anders — schaue in
`sqliteService.ts` nach den `export async function`-Definitionen).

### Schritt 2: `snapshot()` ersetzen

**Alt:**
```typescript
async function snapshot(): Promise<BackupPayload> {
  return {
    customers: await loadJson<Customer[]>('mietpark_crm_customers_v1', []),
    rentals: await loadJson<RentalRequest[]>('mietpark_crm_rentals_v1', []),
    messages: await loadJson<Message[]>('mietpark_crm_messages_v1', []),
    payments: await loadJson<Payment[]>('mietpark_crm_payments_v1', []),
    resources: await loadJson<Resource[]>('mietpark_crm_resources_v1', []),
    customerDocs: await getAllCustomerDocuments(),
    invoices: await loadJson<Invoice[]>('mietpark_crm_invoices_v1', []),
    invoiceItems: await loadJson<InvoiceItem[]>('mietpark_crm_invoice_items_v1', []),
  };
}
```

**Neu:**
```typescript
async function snapshot(): Promise<BackupPayload> {
  const [customers, rentals, messages, payments, resources, customerDocs, invoices] =
    await Promise.all([
      getAllCustomers(),
      getAllRentalRequests(),
      getAllMessages(),
      loadPayments(),
      getAllResources(),
      getAllCustomerDocuments(),
      getAllInvoicesFromDb(),
    ]);

  // InvoiceItems: pro Invoice laden (kein Bulk-Endpoint vorhanden)
  const invoiceItems: InvoiceItem[] = [];
  for (const inv of invoices) {
    const items = await fetchAllInvoiceItems(inv.id);
    invoiceItems.push(...items);
  }

  return { customers, rentals, messages, payments, resources, customerDocs, invoices, invoiceItems };
}
```

### Schritt 3: `restore()` ersetzen

**Alt:**
```typescript
async function restore(payload: BackupPayload) {
  await saveJson('mietpark_crm_customers_v1', payload.customers);
  // ...
}
```

**Neu:**
```typescript
async function restore(payload: BackupPayload) {
  // Customers
  for (const c of payload.customers || []) await createCustomer(c);
  // Rentals
  for (const r of payload.rentals || []) await createRentalRequest(r);
  // Messages
  for (const m of payload.messages || []) await upsertMessage(m);
  // Payments
  for (const p of payload.payments || []) await addPayment(p);
  // Resources
  for (const r of payload.resources || []) await upsertResource(r);
  // Invoices
  for (const inv of payload.invoices || []) await upsertInvoice(inv);
  // Invoice Items (grouped by invoiceId)
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of payload.invoiceItems || []) {
    const list = itemsByInvoice.get(item.invoiceId) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoiceId, list);
  }
  for (const [invoiceId, items] of itemsByInvoice) {
    await replaceInvoiceItems(invoiceId, items);
  }
  // CustomerDocs: Metadaten — Payloads sind separat im ZIP
  // (Payload-Restore erfolgt bereits in importBackupBundleFromFile)
}
```

**Hinweis:** Passe Funktionsnamen an die tatsächlichen Exports in `sqliteService.ts` an.
Wenn ein `upsert*`-Pattern für Updates nötig ist, verwende das statt `create*`.

### Schritt 4: Typecheck

```bash
npm run typecheck
```

Erwartete Ausgabe: keine Fehler.

### Schritt 5: Commit

```bash
git add src/services/backupService.ts
git commit -m "fix(backup): snapshot and restore now read/write SQLite instead of IndexedDB"
```

---

## Task 5: BackupProvider iCloud implementieren

**Warum:** Der `BackupProvider`-Trait in `providers.rs` ist ein leeres Interface. Eine
dateibasierte iCloud-Implementierung macht automatische Backups möglich: Die App kopiert
die SQLite-DB periodisch in einen `backups/`-Unterordner des iCloud-Containers — `bird`
synchronisiert diese Kopien automatisch.

**Files:**
- Modify: `src-tauri/src/services/backup/providers.rs`
- Modify: `src-tauri/src/services/backup/mod.rs`
- Create: `src-tauri/src/services/backup/icloud.rs`

### Schritt 1: `icloud.rs` erstellen

Erstelle `src-tauri/src/services/backup/icloud.rs`:

```rust
use std::fs;
use std::path::PathBuf;
use chrono::Utc;

use crate::database::init::{database_path, icloud_documents_dir};
use super::providers::{BackupInfo, BackupProvider};

/// Dateibasierter Backup-Provider, der in den iCloud Drive Container schreibt.
/// Backups landen in: ~/Library/Mobile Documents/iCloud~.../Documents/backups/
pub struct ICloudBackupProvider {
    app: tauri::AppHandle,
}

impl ICloudBackupProvider {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn backups_dir(&self) -> Option<PathBuf> {
        let icloud = icloud_documents_dir()?;
        let dir = icloud.join("backups");
        fs::create_dir_all(&dir).ok()?;
        Some(dir)
    }
}

impl BackupProvider for ICloudBackupProvider {
    async fn upload_backup(&self, backup_path: &PathBuf) -> Result<String, String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let filename = format!("mietpark-crm_{}.db", ts);
        let dest = dir.join(&filename);
        fs::copy(backup_path, &dest).map_err(|e| e.to_string())?;

        Ok(filename)
    }

    async fn download_latest_backup(&self) -> Result<PathBuf, String> {
        let backups = self.list_backups().await?;
        let latest = backups
            .first()
            .ok_or("Keine Backups vorhanden".to_string())?;

        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;
        Ok(dir.join(&latest.id))
    }

    async fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        let mut backups: Vec<BackupInfo> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "db")
                    .unwrap_or(false)
            })
            .map(|e| {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                let modified = e
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                BackupInfo {
                    id: e.file_name().to_string_lossy().to_string(),
                    created_at: modified,
                    size_bytes: size,
                    version: "1".to_string(),
                }
            })
            .collect();

        // Neueste zuerst
        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    async fn delete_backup(&self, backup_id: &str) -> Result<(), String> {
        let dir = self
            .backups_dir()
            .ok_or("iCloud-Backups-Verzeichnis nicht verfügbar".to_string())?;

        // Sicherheitscheck: nur .db-Dateien löschen, keine Pfad-Traversal
        let filename = PathBuf::from(backup_id);
        if filename.components().count() != 1 {
            return Err("Ungültige Backup-ID".to_string());
        }
        let path = dir.join(filename);
        if !path.extension().map(|e| e == "db").unwrap_or(false) {
            return Err("Nur .db-Dateien können gelöscht werden".to_string());
        }

        fs::remove_file(path).map_err(|e| e.to_string())
    }
}
```

### Schritt 2: `mod.rs` um `icloud`-Modul ergänzen

In `src-tauri/src/services/backup/mod.rs`:

**Alt:**
```rust
pub mod providers;
```

**Neu:**
```rust
pub mod icloud;
pub mod providers;
```

### Schritt 3: Tauri-Command für manuelles Backup registrieren

In `src-tauri/src/commands/database.rs` — neue Funktion hinzufügen:

```rust
use crate::services::backup::icloud::ICloudBackupProvider;
use crate::services::backup::providers::BackupProvider;

#[tauri::command]
pub async fn create_icloud_backup(app: tauri::AppHandle) -> Result<String, String> {
    use crate::database::init::database_path;
    let db_path = database_path(&app).map_err(|e| e.to_string())?;
    let provider = ICloudBackupProvider::new(app);
    let id = provider.upload_backup(&db_path).await?;
    Ok(id)
}

#[tauri::command]
pub async fn list_icloud_backups(app: tauri::AppHandle) -> Result<Vec<crate::services::backup::providers::BackupInfo>, String> {
    let provider = ICloudBackupProvider::new(app);
    provider.list_backups().await
}
```

### Schritt 4: Commands in `mod.rs` registrieren

In `src-tauri/src/commands/mod.rs` — Commands zur Handler-Liste hinzufügen:

```rust
pub use database::{database_summary, create_icloud_backup, list_icloud_backups};
```

Und in `src-tauri/src/lib.rs` in der `generate_handler!`-Macro ergänzen:

```rust
create_icloud_backup,
list_icloud_backups,
```

### Schritt 5: Build prüfen

```bash
cd src-tauri && cargo check 2>&1
```

Erwartete Ausgabe: `Finished` ohne Errors.

### Schritt 6: Commit

```bash
git add src-tauri/src/services/backup/icloud.rs src-tauri/src/services/backup/mod.rs src-tauri/src/commands/database.rs src-tauri/src/lib.rs
git commit -m "feat(backup): implement ICloudBackupProvider with file-based iCloud Drive backup"
```

---

## Verifikation (End-to-End)

Nach Task 3 (iCloud-Pfad aktiv):

```bash
# Prüfen ob iCloud-Container existiert
ls ~/Library/Mobile\ Documents/ | grep mietparkcrm

# Nach App-Start: DB-Pfad prüfen
ls ~/Library/Mobile\ Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/data/
# Erwartete Ausgabe: mietpark-crm.db

# WAL-Mode prüfen
sqlite3 ~/Library/Mobile\ Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/data/mietpark-crm.db "PRAGMA journal_mode;"
# Erwartete Ausgabe: wal
```

Nach Task 4 (Backup-Fix):

1. App öffnen → Kundenverwaltung → "Backup erstellen"
2. Backup herunterladen und als ZIP öffnen
3. `backup.json` prüfen: Kunden-Array darf NICHT leer sein

Nach Task 5 (iCloud Backup-Provider):

```bash
# Backup manuell erstellen (Tauri-Command via App-UI oder Dev-Tools)
ls ~/Library/Mobile\ Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/backups/
# Erwartete Ausgabe: mietpark-crm_20260406_*.db
```
