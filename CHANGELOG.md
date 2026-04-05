# Changelog

Alle relevanten Aenderungen an Features und Fixes werden hier dokumentiert.

## [Unreleased]

### Added
- Automatischer Desktop-Updatefluss (Tauri Updater + Process Plugin) integriert.
- GitLab CI Release-Job fuer `latest.json` und macOS Bundle-Artefakte.
- Lokaler Update-Check beim App-Start fuer Desktop-Builds.

### Changed
- Projektregeln verschaerft: Feature-/Fix-PRs muessen `README.md` und `CHANGELOG.md` aktualisieren (CI-Guard).
- Belegeditor erweitert: Anzahlung ist jetzt in Angebot und Auftrag optional aktivierbar (persistentes Toggle `depositEnabled`).
- Folgebeleg-Logik angepasst: Bei `Auftrag -> Rechnung` wird der Ausgangsauftrag archiviert, die Auftragsnummer bleibt unveraendert.

### Fixed
- Repository-Hygiene verbessert: lokale DB- und nicht-projektbezogene Artefakte bleiben ausserhalb von GitLab.
- GitLab macOS Release-Job gehaertet: Package-Uploads loggen HTTP-Status sauber und brechen bei bereits vorhandenen Dateien nicht mehr mit Exit 1 ab.
- Belegablage verbessert: `PDF speichern` legt jetzt echte PDF-Dateien als Kundendokument in der DB ab.
- PDF-Duplikat-Schutz eingefuehrt: identische Inhalte (SHA-256) werden pro Kunde nicht mehrfach gespeichert.
- PDF-Dateinamen vereinheitlicht auf `{Belegtyp}_{Belegnummer}_{YYYY-MM-DD}.pdf`.
- PDF-Rendering fuer Speicherung auf layoutnahe HTML->PDF-Generierung umgestellt (mehrseitig), damit gespeicherte Datei der Vorschau entspricht.
- PDF-Seitenumbrueche gehaertet: Umbrueche werden auf visuell ruhige Linien verschoben, um abgeschnittene Tabellenzeilen/Text zu reduzieren.
- Dashboard-Logik fuer `Offene Vorgänge` und `Aktiv ausgegeben` auf tagesbasierte Datumsbewertung umgestellt (robuster bei UTC-Importdaten/Zeitzonen).
- Release-Version auf `0.1.1` angehoben, damit Desktop-Auto-Update die aktuellen Fixes ausliefert.
