# Changelog

Alle relevanten Aenderungen an Features und Fixes werden hier dokumentiert.

## [Unreleased]

### Added
- Automatischer Desktop-Updatefluss (Tauri Updater + Process Plugin) integriert.
- GitLab CI Release-Job fuer `latest.json` und macOS Bundle-Artefakte.
- Lokaler Update-Check beim App-Start fuer Desktop-Builds.
- Inbox-Composer erweitert: Direktversand (SMTP/App-Passwort), Vorlagen, lokale Anhaenge und optionales `Verarbeitet` nach Versand.
- Einstellungen erweitert: `Anhaenge-Test senden` prueft die lokale Mail-Bridge inkl. Attachment-Payload.
- Finanz-Dashboard (Option A): KPIs `Offene Forderungen €` und `Monatsumsatz €` sowie Liste `Überfällige Rechnungen` mit Direkt-Öffnen des Belegs.
- iCloud-Backup-Provider im Tauri-Backend inkl. Commands `create_icloud_backup` und `list_icloud_backups`.
- macOS Entitlements-Datei für iCloud-Container (`src-tauri/Entitlements.plist`) und Einbindung in `tauri.conf.json`.
- Backup-UI erweitert: in der Kunden-Backup-Verwaltung kann nun zusätzlich ein iCloud-Backup erstellt und die iCloud-Backupliste angezeigt/aktualisiert werden (Desktop).

### Changed
- Projektregeln verschaerft: Feature-/Fix-PRs muessen `README.md` und `CHANGELOG.md` aktualisieren (CI-Guard).
- Belegeditor erweitert: Anzahlung ist jetzt in Angebot und Auftrag optional aktivierbar (persistentes Toggle `depositEnabled`).
- Folgebeleg-Logik angepasst: Bei `Auftrag -> Rechnung` wird der Ausgangsauftrag archiviert, die Auftragsnummer bleibt unveraendert.
- Build-Chunks fuer Desktop gezielt aufgeteilt (`Inbox`, `Belege-Workflow`, `PDF-Service`, Vendor-Segmente), um den Main-Chunk deutlich zu verkleinern.
- Dashboard-Datenfluss erweitert: `loadDashboardData()` lädt zusätzlich Finanzkennzahlen über `getDashboardFinancials()`.
- Überfällige Rechnungen im Dashboard zeigen jetzt zusätzlich die Anzahl Tage überfällig (`daysOverdue`) pro Eintrag.
- Datenpfade im Desktop-Backend sind iCloud-fähig: DB und Dokumente nutzen bevorzugt den iCloud-Container, mit Fallback auf `AppData`.
- Dokumentablage speichert `file_path` jetzt relativ (statt absolut) und löst den absoluten Pfad zur Laufzeit auf (inkl. Legacy-Fallback für Altdaten).
- SQLite-Verbindungen setzen jetzt WAL + `busy_timeout` global für robustere Dateizugriffe.

### Fixed
- Repository-Hygiene verbessert: lokale DB- und nicht-projektbezogene Artefakte bleiben ausserhalb von GitLab.
- Google OAuth Desktop: Browser-Öffnung unter macOS App Sandbox stabilisiert und Token-Tausch liefert jetzt aussagekräftige Fehlerdetails (z.B. `invalid_grant`).
- GitLab macOS Release-Job gehaertet: Package-Uploads loggen HTTP-Status sauber und brechen bei bereits vorhandenen Dateien nicht mehr mit Exit 1 ab.
- Belegablage verbessert: `PDF speichern` legt jetzt echte PDF-Dateien als Kundendokument in der DB ab.
- PDF-Duplikat-Schutz eingefuehrt: identische Inhalte (SHA-256) werden pro Kunde nicht mehrfach gespeichert.
- PDF-Dateinamen vereinheitlicht auf `{Belegtyp}_{Belegnummer}_{YYYY-MM-DD}.pdf`.
- PDF-Rendering fuer Speicherung auf layoutnahe HTML->PDF-Generierung umgestellt (mehrseitig), damit gespeicherte Datei der Vorschau entspricht.
- PDF-Seitenumbrueche gehaertet: Umbrueche werden auf visuell ruhige Linien verschoben, um abgeschnittene Tabellenzeilen/Text zu reduzieren.
- Dashboard-Logik fuer `Offene Vorgänge` und `Aktiv ausgegeben` auf tagesbasierte Datumsbewertung umgestellt (robuster bei UTC-Importdaten/Zeitzonen).
- Release-Version auf `0.1.1` angehoben, damit Desktop-Auto-Update die aktuellen Fixes ausliefert.
- Workflow-Konvertierung gehaertet: Angebot wird bei `Angebot -> Auftrag` archiviert; Rollback + User-Hinweis bei Status-Sync-Fehlern in allen Konvertierungspfaden.
- `RentalRequestDetail`: `Angebot überarbeiten` auch im Status `angebot_gesendet`; Preisfreigabe basiert auf echter Rechnungs-Existenz statt Statusannahme.
- Seed-Daten bereinigt: veraltete localStorage-Belegzaehler entfernt.
- Mail-Bridge-Fallback verbessert: wenn Attachment-Payload nicht unterstuetzt wird, erfolgt automatischer Retry ohne Anhaenge mit klarer Meldung.
- Finanz-Dashboard regressionssicher gemacht: neue Unit-Tests für Bruttopreis, Zahlungsabzug, Monatsumsatz, Overdue-Filter und `daysOverdue`-Berechnung.
- Backup-Snapshot/Restore nutzt jetzt die SQLite-Service-Schicht statt Legacy-IndexedDB-Keys.
- Restore-Härtung: Dokument-Metadaten werden beim Restore wieder angelegt; Web-Fallback vermeidet doppelte Nachrichten anhand `id`.
- CI-Release-Signing ist robust konfigurierbar: `APPLE_SIGNING_IDENTITY` wird bei gesetzter Variable automatisch in `tauri.conf.json` injiziert.
- Dokumentenarchiv verbessert: PDF/Bild-Dateien können jetzt über `Öffnen` direkt als Vorschau im neuen Tab angezeigt werden; Download-Trigger ist browser-kompatibler.
- Legacy-Dachträger-Schlüssel bereinigt: Werte im Muster `FIREBASE-*` werden als ungültige Altimporte behandelt und nicht mehr als aktive Dachträger-Zuordnung verwendet.
