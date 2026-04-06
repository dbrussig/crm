# Design: Finanz-Dashboard

**Datum:** 2026-04-06
**Status:** Approved
**Scope:** Dashboard-Erweiterung um finanzielle KPIs und überfällige Rechnungen

---

## Problem

Das Dashboard zeigt aktuell nur Anzahlen (offene Vorgänge, Belege im Entwurf, gesendete Belege,
aktiv ausgegebene Ressourcen). Es gibt keine einzige Euro-Zahl. Für ein Mietgeschäft sind das
die wichtigsten Daily-Driver-Informationen:

- Wie viel Geld steht noch aus?
- Wie viel wurde diesen Monat eingenommen?
- Welche Rechnungen sind überfällig?

---

## Ziel

Zwei neue Finanz-KPIs im Dashboard-Grid sowie eine „Überfällige Rechnungen"-Liste, die den User
direkt auf ausstehende Zahlungen aufmerksam macht — ohne den bestehenden Aufbau zu verändern.

---

## Design

### 1. Neue KPI-Widgets

Zwei neue Kacheln ergänzen das bestehende 4er-Grid (wird zu 6 Spalten auf lg, bleibt 2 auf sm):

| Widget | Wert | Farbe |
|---|---|---|
| Offene Forderungen € | Summe (Brutto Rechnung – erfasste Zahlungen) für state=`gesendet`/`angenommen` | Rose wenn > 0, Slate wenn = 0 |
| Monatsumsatz € | Summe aller Zahlungseingänge mit `receivedAt` im laufenden Monat | Emerald |

### 2. Überfällige Rechnungen

Neue Liste rechts neben „Nächste Mietvorgänge" (ersetzt den statischen „Heute im Fokus"-Block
oder wird als dritte Karte darunter eingefügt):

- Zeigt alle Rechnungen mit `dueDate < Date.now()` und `offenerBetrag > 0`
- Sortiert nach `dueDate` aufsteigend (älteste zuerst)
- Jede Zeile: Belegnummer, Kunde, offener Betrag, Tage überfällig
- Click → wechselt zu Belege-View und öffnet den Beleg
- Leer-Zustand: „Keine überfälligen Rechnungen ✓" (grün)

### 3. Neue Service-Funktion

**Neue Datei:** `src/services/dashboardService.ts`

```typescript
export interface DashboardFinancials {
  offeneForderungen: number;          // € offen über alle aktiven Rechnungen
  monatsumsatz: number;               // € eingegangen im laufenden Monat
  ueberfaelligeRechnungen: OverdueInvoice[];
}

export interface OverdueInvoice {
  invoice: Invoice;
  totalGross: number;   // Bruttosumme aus Items berechnet
  paidAmount: number;   // Summe erfasster Zahlungen für diese Rechnung
  offenerBetrag: number; // totalGross - paidAmount
  daysOverdue: number;  // Math.floor((now - dueDate) / 86400000)
}

export async function getDashboardFinancials(): Promise<DashboardFinancials>
```

**Interne Logik:**

```
1. fetchAllInvoices() → filter: invoiceType='Rechnung', state in ['gesendet','angenommen']
2. getAllPayments() → einmal laden, dann per invoiceId gruppieren
3. Pro Rechnung:
   a. getInvoiceItems(invoice.id) → Brutto = Σ (unitPrice × quantity × (1 + taxPercent/100))
   b. paidAmount = Σ payments where payment.invoiceId === invoice.id
   c. offenerBetrag = Brutto - paidAmount
4. offeneForderungen = Σ offenerBetrag (alle aktiven Rechnungen)
5. monatsumsatz = Σ payment.amount where receivedAt im laufenden Kalendermonat
6. ueberfaelligeRechnungen = Rechnungen mit dueDate < now && offenerBetrag > 0
```

**Edge Cases:**
- Rechnung ohne Items → totalGross = 0, wird in ueberfaelligeRechnungen ignoriert
- Rechnung ohne dueDate → nicht als überfällig gewertet
- Payment ohne invoiceId → fließt in Monatsumsatz ein, aber nicht in Rechnungs-Abgleich
- Stornierte/archivierte Rechnungen → explizit ausgeschlossen

---

## Datenfluss

```
App.tsx: loadDashboardData()
  ├── fetchAllRentalRequests()          (bereits vorhanden)
  ├── fetchAllInvoices()                (bereits vorhanden)
  ├── fetchResources()                  (bereits vorhanden)
  └── getDashboardFinancials()          (neu)
        ├── fetchAllInvoices()
        ├── getAllPayments()
        └── getInvoiceItems(id)         (pro Rechnung, parallel via Promise.all)
```

`getDashboardFinancials()` lädt Invoices intern nochmal — das ist eine bewusste Entscheidung für
Isolation des Service. Performance-Impact minimal (SQLite lokal, ~100 Datensätze max).

---

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/services/dashboardService.ts` | NEU — `getDashboardFinancials()` |
| `src/App.tsx` | State + loadDashboardData() erweitern, Dashboard-JSX anpassen |
| `src/services/dashboardService.test.ts` | NEU — Tests für Finanz-Berechnungen |

**Kein Schema-Change.** Alle nötigen Daten sind in bestehenden Tabellen vorhanden.

---

## Out of Scope

- Quick-Action „Zahlung direkt vom Dashboard erfassen" (späterer Schritt)
- Monatsumsatz-Chart/Verlauf über mehrere Monate
- Export als CSV/PDF
