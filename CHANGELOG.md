# Changelog

Alle relevanten Aenderungen an Features und Fixes werden hier dokumentiert.

## [Unreleased]

### Added
- Automatischer Desktop-Updatefluss (Tauri Updater + Process Plugin) integriert.
- GitLab CI Release-Job fuer `latest.json` und macOS Bundle-Artefakte.
- Lokaler Update-Check beim App-Start fuer Desktop-Builds.

### Changed
- Projektregeln verschaerft: Feature-/Fix-PRs muessen `README.md` und `CHANGELOG.md` aktualisieren (CI-Guard).

### Fixed
- Repository-Hygiene verbessert: lokale DB- und nicht-projektbezogene Artefakte bleiben ausserhalb von GitLab.
- GitLab macOS Release-Job gehaertet: Package-Uploads loggen HTTP-Status sauber und brechen bei bereits vorhandenen Dateien nicht mehr mit Exit 1 ab.
