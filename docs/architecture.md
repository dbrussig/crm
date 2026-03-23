# Architektur

## Leitlinie

Die bestehende React-Oberflaeche bleibt die UI-Referenz. Die macOS-App kapselt diese UI in einer `WKWebView` und stellt native Dienste per Bridge bereit.

## Bausteine

- `WebHost/`: Laden und Hosten der gebauten React-App
- `Bridge/`: Nachrichtenkanal zwischen JavaScript und Swift
- `Persistence/`: lokale Datenspeicherung im App-Container
- `Security/`: Keychain-Zugriff fuer Tokens und sensible Einstellungen
- `Sync/`: spaetere CloudKit-Synchronisation

## Reihenfolge

1. React-Build lokal im App-Bundle laden
2. Storage-Bridge fuer CRM-Daten
3. Dateioperationen und Export
4. Keychain fuer OAuth-/API-Daten
5. CloudKit nur nach stabiler lokaler Speicherung
