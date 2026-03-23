# Native Desktop App Roadmap

Stand: 2026-03-23
Status: In Arbeit

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
- Kunden, Vorgaenge, Ressourcen, Nachrichten, Zahlungen und Belege lokal in SQLite
- Google Calendar OAuth und Event-Sync
- lokales Backup
- vorbereitete Struktur fuer Google Drive Backup

## Aktueller Stand

### Erledigt

- [x] Docker-/Web-App und Desktop-App lokal und in GitLab sauber getrennt
- [x] Desktop-Repository auf `mietpark-crm-desktop` umgestellt
- [x] Desktop-Grundarchitektur von Swift-WebView auf `Tauri 2 + React + Rust` umgestellt
- [x] Tauri-Frontend- und Rust-Projektstruktur angelegt
- [x] bestehende React-Oberflaeche aus `mietpark-crm` in das Desktop-Projekt uebernommen
- [x] `cargo check` fuer das Tauri-Backend laeuft
- [x] `npm run build` fuer das Desktop-Frontend laeuft
- [x] SQLite-Basis und Initialschema angelegt
- [x] Tauri-Commands fuer Kern-CRM-Daten angelegt
- [x] Kunden nativ ueber Tauri/SQLite verdrahtet
- [x] Vorgaenge nativ ueber Tauri/SQLite verdrahtet
- [x] Ressourcen nativ ueber Tauri/SQLite verdrahtet
- [x] Nachrichten nativ ueber Tauri/SQLite verdrahtet
- [x] Zahlungen nativ ueber Tauri/SQLite verdrahtet
- [x] Belege und Belegpositionen nativ ueber Tauri/SQLite verdrahtet

### Teilweise erledigt

- [~] UI ist migriert, nutzt aber noch an mehreren Stellen Browser-nahe Fallbacks
- [~] TypeScript-Typpruefung der migrierten Alt-UI ist noch nicht bereinigt
- [~] Architektur fuer OAuth, Backup und Keychain steht, produktive Implementierung fehlt noch

### Offen

- [ ] Kundendokumente und Anhaenge in nativen Dateispeicher + SQLite-Metadaten verschieben
- [ ] Zubehoer nativ ueber Tauri/SQLite verdrahten
- [ ] Backup-Historie und Backup-Dateien nativ verdrahten
- [ ] OAuth-Token sicher in Keychain speichern
- [ ] Google OAuth mit PKCE produktiv implementieren
- [ ] Google Calendar Sync produktiv implementieren
- [ ] Gmail-Integration produktiv implementieren
- [ ] lokales verschluesseltes Backup implementieren
- [ ] Google Drive als ersten Cloud-Backup-Provider implementieren
- [ ] OneDrive, Dropbox und iCloud als nachgelagerte Provider anschliessen
- [ ] TypeScript-Warnungen und Altlasten aus der migrierten UI bereinigen
- [ ] Tauri-Dev-Start mit realen Datenflussen testen
- [ ] Code Signing, Notarisierung und spaetere Distribution vorbereiten

## Arbeitsphasen

### Phase 1: Fundament

- [x] Repos und Verzeichnisse trennen
- [x] Tauri-Projektgeruest anlegen
- [x] React-UI migrieren
- [x] SQLite-Basis herstellen

### Phase 2: CRM-Kerndaten

- [x] Customers
- [x] Rental Requests
- [x] Resources
- [x] Messages
- [x] Payments
- [x] Invoices
- [x] Invoice Items

### Phase 3: Dateispeicher und Sicherheit

- [ ] Customer Documents
- [ ] Dateiablage im nativen App-Container
- [ ] Keychain fuer Tokens
- [ ] verschluesselte lokale Backups

### Phase 4: Google-Integration

- [ ] OAuth 2.0 mit PKCE
- [ ] Google Calendar
- [ ] Gmail
- [ ] Token-Refresh und Verbindungsverwaltung

### Phase 5: Backup und Distribution

- [ ] Google Drive Backup
- [ ] weitere Provider
- [ ] QA und End-to-End-Tests
- [ ] Code Signing und Notarisierung

## Naechste konkrete Schritte

1. Kundendokumente und Anhaenge aus dem Browser-Fallback in nativen Dateispeicher ueberfuehren.
2. Zubehoer und restliche Metadaten ebenfalls an SQLite/Tauri anschliessen.
3. Danach Google OAuth und Keychain produktiv umsetzen.

## Bewusste Verschiebungen

- OneDrive, Dropbox und iCloud erst nach stabiler V1
- Gmail-Import nach SQLite-Basis und Google OAuth
- Mac App Store nicht im ersten Lieferumfang
