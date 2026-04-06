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
- Wichtig fuer echte Updates: `src-tauri/tauri.conf.json` Version muss pro Release hochgezaehlt werden (nur hoehere Semver-Versionen werden installiert).

## iCloud Sync (Desktop)

- Desktop-Backend unterstützt jetzt iCloud-Drive-Pfade für DB und Dokumente:
  - DB: `~/Library/Mobile Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/data/mietpark-crm.db`
  - Dokumente: `~/Library/Mobile Documents/iCloud~com~serverraum247~mietparkcrm~desktop/Documents/documents/`
- Fallback bleibt aktiv: wenn iCloud lokal nicht verfügbar ist, wird weiterhin `AppData` genutzt.
- Beim App-Start läuft eine sichere Einmal-Migration (best effort) von `AppData` nach iCloud:
  - bestehende Altdaten bleiben als Backup erhalten
  - nur fehlende Zieldateien werden kopiert
- SQLite-Verbindungen laufen mit `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;`.
- Dokument-Metadaten speichern relative Dateinamen statt absolute Pfade; Legacy absolute Pfade werden weiterhin gelesen.

### iCloud Signing Voraussetzung (macOS)

- Für echte iCloud-Container-Synchronisierung muss die App mit Apple Developer Zertifikat signiert werden.
- `src-tauri/Entitlements.plist` ist hinterlegt und in `tauri.conf.json` unter `bundle.macOS.entitlements` eingetragen.
- `bundle.macOS.signingIdentity` bleibt bis zur Zertifikat-Konfiguration auf `null`.
- Für CI-Releases kann die Signatur-Identität über `APPLE_SIGNING_IDENTITY` gesetzt werden
  (wird im Release-Script automatisch in `tauri.conf.json` übernommen).

### iCloud Backups (Dateibasiert)

- Neuer Rust-Provider erstellt DB-Backups im iCloud-Container:
  - Ziel: `.../Documents/backups/mietpark-crm_YYYYMMDD_HHMMSS.db`
- Verfügbare Tauri-Commands:
  - `create_icloud_backup`
  - `list_icloud_backups`
- UI-Anbindung vorhanden:
  - `Kundenverwaltung -> Backups` zeigt Desktop-seitig iCloud-Aktionen
  - Button `iCloud-Backup erstellen`
  - Liste der gefundenen iCloud-Backups inkl. Zeitstempel/Größe

## Backup Restore (SQLite-first)

- `snapshot()` und `restore()` arbeiten auf SQLite-Service-Funktionen statt Legacy-IndexedDB-Keys.
- Restore legt Dokument-Metadaten wieder an; Dokument-Payloads werden wie bisher im ZIP-Importpfad eingespielt.
- Web-Fallback vermeidet doppelte Nachrichten beim Restore über `message.id`.

## Doku-Pflicht fuer Features/Fixes

Ab sofort gilt verbindlich:

- Jede Feature- oder Fix-Aenderung am produktiven Code muss `README.md` und `CHANGELOG.md` mit aktualisieren.
- GitLab CI prueft das automatisch ueber `scripts/ci/check-doc-sync.sh`.
- Ohne diese beiden Doku-Updates faellt die Pipeline im `verify`-Stage.

## Beleg-Workflow (Anzahlung / Archiv / Dokumentablage)

- Anzahlung ist optional und kann in Angebot **und** Auftrag im Editor aktiv/deaktiviert werden.
- Bei `Auftrag -> Rechnung` wird der bestehende Auftrag automatisch auf Status `archiviert` gesetzt (Belegnummer bleibt unveraendert).
- Beim Klick auf `PDF speichern` wird die generierte Druckvorlage automatisch als Kundendokument abgelegt (Kategorie nach Belegtyp).
- PDF-Ablage verwendet echte `application/pdf` Dateien (nicht mehr HTML) mit Standardname:
  - `{Belegtyp}_{Belegnummer}_{YYYY-MM-DD}.pdf`
- Duplikat-Schutz aktiv: identische PDFs (SHA-256) werden pro Kunde nur einmal gespeichert.
- PDF-Inhalt wird layoutnah aus derselben Beleg-HTML gerendert (mehrseitig), damit Vorschau und gespeicherte Datei visuell uebereinstimmen.
- Seitenumbrueche werden beim Rendern automatisch an visuell ruhige Zeilen gelegt, um harte Schnitte in Tabellen/Text zu minimieren.
- Dashboard-Kennzahlen `Offene Vorgänge` und `Aktiv ausgegeben` bewerten Mietdaten tagesbasiert (lokaler Tagesanfang), um UTC/Zeitzonen-Importe korrekt abzubilden.

## Inbox + Mail-Versand (Desktop)

- Inbox bietet einen zentralen Composer mit:
  - Vorlagen (Eingangsbestaetigung, Terminabstimmung, Nicht verfuegbar, Reling/Fixpunkte-Ablehnung)
  - lokalen Anhaengen
  - Direktversand ueber SMTP/App-Passwort (wenn Mail-Bridge konfiguriert)
- Nach Direktversand kann eine Konversation direkt als `Verarbeitet` markiert werden.
- Falls die lokale Mail-Bridge Anhaenge nicht unterstuetzt, wird automatisch ohne Anhaenge erneut gesendet und ein klarer Hinweis angezeigt.
- In den Einstellungen steht `Anhaenge-Test senden` zur Verfuegung, um die Bridge-Attachment-Unterstuetzung mit einer Testmail zu verifizieren.

## Build-Performance

- Vite-Build ist in funktionsbezogene Chunks aufgeteilt (`inbox`, `belege-workflow`, `pdf-service`, dedizierte Vendor-Chunks fuer PDF/React/DnD/Date).
- Dadurch ist der Main-Entry-Chunk deutlich kleiner und Releases laden stabiler in Desktop-Umgebungen.

## Finanz-Dashboard (Option A)

- Dashboard zeigt zusaetzlich zwei finanzielle Kernkennzahlen:
  - `Offene Forderungen €` (gesendete/angenommene Rechnungen minus erfasste Zahlungen)
  - `Monatsumsatz €` (Zahlungseingaenge im laufenden Monat)
- Neue Liste `Überfällige Rechnungen`:
  - Kriterien: `dueDate < heute` und `offener Betrag > 0`
  - Zeigt zusätzlich `X Tag(e) überfällig` je Rechnung
  - Klick oeffnet den zugehoerigen Beleg direkt im Editor
  - Leerzustand: `Keine überfälligen Rechnungen ✓`
- Technischer Einstiegspunkt:
  - `src/services/dashboardService.ts` (`getDashboardFinancials()`)
  - Unit-Tests in `src/services/dashboardService.test.ts` (Brutto, Payments, Monatsumsatz, Overdue inkl. `daysOverdue`)
  - Verwendung in `loadDashboardData()` in `src/App.tsx`
