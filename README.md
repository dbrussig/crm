# Mietpark CRM Desktop

Native Desktop-App fuer Mietpark CRM auf Basis von Tauri 2, React und Rust.

## Ziel

- nahezu identische UI zur bestehenden Web-/Docker-App
- lokale SQLite-Datenbank als Primärspeicher
- OAuth 2.0 pro Nutzer fuer Google Kalender, Gmail und Cloud-Backups
- sichere Token-Ablage im Keychain
- spaeter Cloud-Backups ueber Google Drive, OneDrive, Dropbox und optional iCloud

## Architektur

- `src/`: React-Frontend fuer die UI
- `src-tauri/`: Rust-Backend mit Tauri-Kommandos, SQLite und Integrationen
- `docs/`: Architektur, Roadmap und Migrationsnotizen

## Startpunkt

Dieses Repository ist das neue Desktop-Projekt. Die bestehende Web-App bleibt separat in `../mietpark-crm`.

## Geplante Kernfunktionen fuer V1

- Dashboard, Kanban, Kunden, Belege in React
- SQLite lokal
- Google OAuth mit PKCE
- Google Calendar Sync
- lokales verschluesseltes Backup
- spaeter Google Drive als erster Cloud-Backup-Provider

## Naechste Schritte

1. Frontend aus der Web-App kontrolliert uebernehmen
2. Tauri IPC und SQLite-Grundschicht fertig verdrahten
3. OAuth- und Google-Services implementieren
4. Backup-System aufbauen
