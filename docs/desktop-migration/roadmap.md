# Native macOS App Roadmap

Stand: 2025-03-19

## Zielbild

Die bisherige Docker-Web-App wird schrittweise zu einer eigenstaendigen Desktop-App mit Tauri 2, React, Rust und lokaler SQLite-Datenbank migriert. Die UI soll sich moeglichst wenig von der bestehenden App unterscheiden.

## Kernanforderungen

- Multi-Tenant Google OAuth fuer Kalender, Gmail und Cloud-Backups
- lokale SQLite-Datenbank
- Backup-System mit mehreren Providern
- Offline-First
- Keychain fuer Tokens

## V1-Scope

- nahezu identische UI
- Kunden, Vorgaenge, Ressourcen, Belege lokal in SQLite
- Google Calendar OAuth und Event-Sync
- lokales Backup
- vorbereitete Struktur fuer Google Drive Backup

## Bewusste Verschiebungen

- OneDrive, Dropbox und iCloud erst nach stabiler V1
- Gmail-Import nach SQLite-Basis und Google OAuth
- Mac App Store nicht im ersten Lieferumfang
