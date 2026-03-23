# Mietpark CRM Mac

Separater macOS-Container fuer die bestehende React-Oberflaeche aus `../mietpark-crm`.

## Ziel

- nahezu identische UI zur Web-App
- lokaler Betrieb als macOS-App
- native Dienste fuer Dateiablage, Keychain und spaeter iCloud/CloudKit

## Ablauf

1. Web-App in `../mietpark-crm` bauen
2. `scripts/sync-web-build.sh` ausfuehren
3. Xcode-Projekt baut die Mac-App mit eingebettetem `Resources/WebApp`

## Status

Aktuell ist dies ein Startgeruest fuer Architektur, Bridge-Vertrag und Build-Sync. Das eigentliche `.xcodeproj` wird im naechsten Schritt in Xcode erzeugt und an diese Struktur angeschlossen.
