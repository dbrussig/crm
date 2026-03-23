# Architektur

## Leitlinie

Die bestehende React-Oberflaeche aus `mietpark-crm` bleibt die visuelle Referenz. Die Desktop-App wird jedoch nicht mehr als Swift-WebView-Container gebaut, sondern als eigenstaendige Tauri-2-Anwendung mit Rust-Backend.

## Schichten

- `src/`
  React-UI, Routing, State und Darstellung
- `src/platform/`
  Frontend-Adapter fuer Tauri IPC
- `src-tauri/src/commands/`
  Tauri-Kommandos als stabile API zwischen UI und Backend
- `src-tauri/src/database/`
  SQLite, Migrationen, Repositories
- `src-tauri/src/services/auth/`
  OAuth 2.0 mit PKCE und Token-Refresh
- `src-tauri/src/services/calendar/`
  Google Calendar API
- `src-tauri/src/services/backup/`
  Lokale und Cloud-Backups
- `src-tauri/src/security/`
  Keychain und spaetere Verschluesselung

## Grundsaetze

1. UI bleibt moeglichst identisch zur Web-App
2. Browser-Speicher ist nur noch Entwicklungs-Fallback, nicht produktive Wahrheit
3. SQLite ist der einzige produktive lokale Primärspeicher
4. Tokens liegen nicht im Frontend, sondern im sicheren nativen Speicher
5. Cloud wird fuer Backup und Sync eingesetzt, nicht als Pflicht fuer den Basisbetrieb

## Entwicklungsreihenfolge

1. Tauri-Grundgeruest
2. Frontend-Migration aus `mietpark-crm`
3. SQLite und Repositories
4. Google OAuth
5. Google Calendar
6. lokale verschluesselte Backups
7. Cloud-Backup-Provider
