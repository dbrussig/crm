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

## Auto-Update (GitLab + .app)

Das Projekt ist fuer automatische Desktop-Updates vorbereitet:

- Tauri Updater Plugin ist eingebunden (Rust + Frontend).
- Beim App-Start wird im Desktop-Build regelmaessig auf Updates geprueft.
- GitLab CI (`.gitlab-ci.yml`) baut auf `main` und publiziert `latest.json` + `.app.tar.gz` + `.sig` in GitLab Generic Packages.

Pflicht-Variablen in GitLab CI/CD:

- `TAURI_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- optional: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Hinweis:

- Fuer echte In-App-Updates muss der Update-Endpunkt fuer Clients erreichbar sein.
- Bei privaten GitLab-Projekten ist ein zusaetzliches Konzept fuer authentifizierten Download noetig.
- Release-Uploads in GitLab Generic Packages sind robust gegen Duplikate (bestehende Dateien fuehren nicht mehr zu hartem Job-Abbruch).

## Doku-Pflicht fuer Features/Fixes

Ab sofort gilt verbindlich:

- Jede Feature- oder Fix-Aenderung am produktiven Code muss `README.md` und `CHANGELOG.md` mit aktualisieren.
- GitLab CI prueft das automatisch ueber `scripts/ci/check-doc-sync.sh`.
- Ohne diese beiden Doku-Updates faellt die Pipeline im `verify`-Stage.

## Beleg-Workflow (Anzahlung / Archiv / Dokumentablage)

- Anzahlung ist optional und kann in Angebot **und** Auftrag im Editor aktiv/deaktiviert werden.
- Bei `Auftrag -> Rechnung` wird der bestehende Auftrag automatisch auf Status `archiviert` gesetzt (Belegnummer bleibt unveraendert).
- Beim Klick auf `PDF speichern` wird die generierte Druckvorlage automatisch als Kundendokument abgelegt (Kategorie nach Belegtyp).
