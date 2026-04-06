# Finanz-Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tests für `dashboardService.ts` schreiben und `daysOverdue`-Feld zur Überfällig-Anzeige ergänzen.

**Architecture:** Der Service `src/services/dashboardService.ts` ist bereits vollständig implementiert
(KPI-Widgets, Überfällige Rechnungen, App.tsx-Integration). Was fehlt: Unit-Tests und die
Anzeige "X Tage überfällig" im UI.

**Tech Stack:** Vitest, vi.mock, React, TypeScript

---

## Kontext: Was bereits fertig ist

Nicht nochmal bauen — diese Teile existieren bereits:

- `src/services/dashboardService.ts` — `getDashboardFinancials()`, `calcInvoiceGross()`, `sumPaymentsForInvoice()`
- `src/App.tsx` — State `dashboardFinancials`, Laden in `loadDashboardData()`, KPI-Grid (6 Tiles), "Überfällige Rechnungen"-Liste
- Typen `DashboardFinancials`, `UeberfaelligeRechnung` in `dashboardService.ts`

---

## Task 1: Tests für `dashboardService.ts`

**Files:**
- Create: `src/services/dashboardService.test.ts`

### Schritt 1: Mock-Setup schreiben

Erstelle `src/services/dashboardService.test.ts` mit folgendem Inhalt:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, InvoiceItem, Payment } from '../types';

// ---- Hoisted mocks ----
const {
  fetchAllInvoicesMock,
  getAllPaymentsMock,
  getInvoiceItemsMock,
} = vi.hoisted(() => ({
  fetchAllInvoicesMock: vi.fn(),
  getAllPaymentsMock: vi.fn(),
  getInvoiceItemsMock: vi.fn(),
}));

vi.mock('./invoiceService', () => ({
  fetchAllInvoices: fetchAllInvoicesMock,
}));

vi.mock('./sqliteService', () => ({
  getAllPayments: getAllPaymentsMock,
  getInvoiceItems: getInvoiceItemsMock,
}));

import { getDashboardFinancials } from './dashboardService';

// ---- Helpers ----
function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_001',
    invoiceType: 'Rechnung',
    invoiceNo: 'RE202601',
    invoiceDate: Date.now(),
    dueDate: undefined,
    state: 'gesendet',
    currency: 'EUR',
    companyId: 'cust_001',
    buyerName: 'Test Kunde',
    buyerAddress: 'Teststraße 1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Invoice;
}

function makeItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'item_001',
    invoiceId: 'inv_001',
    orderIndex: 0,
    name: 'Dachbox XL',
    unit: 'Stk.',
    unitPrice: 100,
    quantity: 1,
    taxPercent: 19,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_001',
    rentalRequestId: 'vrg_001',
    invoiceId: 'inv_001',
    kind: 'Zahlung',
    method: 'PayPal',
    amount: 50,
    currency: 'EUR',
    receivedAt: Date.now(),
    source: 'manual',
    createdAt: Date.now(),
    ...overrides,
  } as Payment;
}

beforeEach(() => {
  vi.clearAllMocks();
});
```

### Schritt 2: Test — Brutto-Berechnung (mit MwSt.)

Ergänze in der Datei:

```typescript
describe('getDashboardFinancials', () => {
  it('berechnet offeneForderungen korrekt aus Items mit MwSt.', async () => {
    fetchAllInvoicesMock.mockResolvedValue([makeInvoice()]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 100, quantity: 1, taxPercent: 19 }), // 119,00 €
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(119);
  });
```

### Schritt 3: Tests ausführen — sicherstellen dass sie laufen

```bash
npx vitest run src/services/dashboardService.test.ts
```

Erwartete Ausgabe: `1 passed`

### Schritt 4: Test — Bezahlte Rechnungen abziehen

```typescript
  it('zieht erfasste Zahlungen von offeneForderungen ab', async () => {
    fetchAllInvoicesMock.mockResolvedValue([makeInvoice()]);
    getAllPaymentsMock.mockResolvedValue([makePayment({ amount: 50 })]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 100, quantity: 1, taxPercent: 19 }), // 119,00 €
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(69); // 119 - 50
  });
```

Ausführen: `npx vitest run src/services/dashboardService.test.ts`
Erwartete Ausgabe: `2 passed`

### Schritt 5: Test — vollständig bezahlte Rechnung

```typescript
  it('zeigt 0 offeneForderungen wenn Rechnung vollständig bezahlt', async () => {
    fetchAllInvoicesMock.mockResolvedValue([makeInvoice()]);
    getAllPaymentsMock.mockResolvedValue([makePayment({ amount: 119 })]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 100, quantity: 1, taxPercent: 19 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
  });
```

### Schritt 6: Test — nur Rechnungen zählen (keine Angebote/Aufträge)

```typescript
  it('ignoriert Angebote und Aufträge für offeneForderungen', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_angebot', invoiceType: 'Angebot', state: 'gesendet' }),
      makeInvoice({ id: 'inv_auftrag', invoiceType: 'Auftrag', state: 'angenommen' }),
    ]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
    expect(getInvoiceItemsMock).not.toHaveBeenCalled();
  });
```

### Schritt 7: Test — archivierte/stornierte Rechnungen ignorieren

```typescript
  it('ignoriert stornierte und archivierte Rechnungen', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_storno', invoiceType: 'Rechnung', state: 'storniert' }),
      makeInvoice({ id: 'inv_arch', invoiceType: 'Rechnung', state: 'archiviert' }),
    ]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
  });
```

### Schritt 8: Test — Monatsumsatz nur im laufenden Monat

```typescript
  it('zählt nur Zahlungen im laufenden Monat zum Monatsumsatz', async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime();

    fetchAllInvoicesMock.mockResolvedValue([]);
    getAllPaymentsMock.mockResolvedValue([
      makePayment({ id: 'p1', receivedAt: thisMonth, amount: 200 }),
      makePayment({ id: 'p2', receivedAt: lastMonth, amount: 100 }),
    ]);
    getInvoiceItemsMock.mockResolvedValue([]);

    const result = await getDashboardFinancials();

    expect(result.monatsumsatz).toBe(200);
  });
```

### Schritt 9: Test — Überfällige Rechnungen

```typescript
  it('listet Rechnungen als überfällig wenn dueDate in der Vergangenheit und Betrag offen', async () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 5); // 5 Tage überfällig
    const dueDate = new Date(pastDue.getFullYear(), pastDue.getMonth(), pastDue.getDate()).getTime();

    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_faellig', dueDate }),
    ]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 100, quantity: 1, taxPercent: 0 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.ueberfaelligeRechnungen).toHaveLength(1);
    expect(result.ueberfaelligeRechnungen[0].invoice.id).toBe('inv_faellig');
    expect(result.ueberfaelligeRechnungen[0].offenBetrag).toBe(100);
  });

  it('zeigt KEINE überfälligen Rechnungen wenn dueDate in der Zukunft', async () => {
    const futureDue = new Date();
    futureDue.setDate(futureDue.getDate() + 7);

    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_futur', dueDate: futureDue.getTime() }),
    ]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 100, quantity: 1, taxPercent: 0 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.ueberfaelligeRechnungen).toHaveLength(0);
  });
});
```

### Schritt 10: Alle Tests ausführen und sicherstellen dass sie grün sind

```bash
npx vitest run src/services/dashboardService.test.ts
```

Erwartete Ausgabe: `8 passed`

### Schritt 11: Commit

```bash
git add src/services/dashboardService.test.ts
git commit -m "test(dashboard): add unit tests for getDashboardFinancials"
```

---

## Task 2: `daysOverdue`-Feld zu `UeberfaelligeRechnung` ergänzen

**Files:**
- Modify: `src/services/dashboardService.ts`
- Modify: `src/App.tsx` (Dashboard-UI, Überfällige Rechnungen Karte)

### Schritt 1: Typ erweitern

In `src/services/dashboardService.ts` — `UeberfaelligeRechnung` Interface:

**Alt:**
```typescript
export type UeberfaelligeRechnung = {
  invoice: Invoice;
  offenBetrag: number;
  gesamtBetrag: number;
};
```

**Neu:**
```typescript
export type UeberfaelligeRechnung = {
  invoice: Invoice;
  offenBetrag: number;
  gesamtBetrag: number;
  daysOverdue: number;
};
```

### Schritt 2: Berechnung in `getDashboardFinancials()` ergänzen

In `getDashboardFinancials()` — die Stelle wo `ueberfaelligeRechnungen.push(...)` aufgerufen wird:

**Alt:**
```typescript
      ueberfaelligeRechnungen.push({
        invoice: inv,
        offenBetrag: open,
        gesamtBetrag: gross,
      });
```

**Neu:**
```typescript
      const daysOverdue = Math.floor((todayDayStart - dueDate) / 86_400_000);
      ueberfaelligeRechnungen.push({
        invoice: inv,
        offenBetrag: open,
        gesamtBetrag: gross,
        daysOverdue,
      });
```

### Schritt 3: Test für `daysOverdue` ergänzen

In `src/services/dashboardService.test.ts` — nach dem überfälligen Test ergänzen:

```typescript
  it('berechnet daysOverdue korrekt', async () => {
    const today = new Date();
    const threeDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3).getTime();

    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_3days', dueDate: threeDaysAgo }),
    ]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([
      makeItem({ unitPrice: 50, quantity: 1, taxPercent: 0 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.ueberfaelligeRechnungen[0].daysOverdue).toBe(3);
  });
```

### Schritt 4: Tests ausführen

```bash
npx vitest run src/services/dashboardService.test.ts
```

Erwartete Ausgabe: `9 passed`

### Schritt 5: UI in `src/App.tsx` — `daysOverdue` anzeigen

In `src/App.tsx` — im "Überfällige Rechnungen"-Block die `row`-Button-Karte:

**Alt:**
```tsx
                        <div className="text-xs text-rose-800 mt-0.5">
                          Fällig: {row.invoice.dueDate ? new Date(row.invoice.dueDate).toLocaleDateString('de-DE') : '-'} · Offen: {formatCurrency(row.offenBetrag)}
                        </div>
```

**Neu:**
```tsx
                        <div className="text-xs text-rose-800 mt-0.5">
                          Fällig: {row.invoice.dueDate ? new Date(row.invoice.dueDate).toLocaleDateString('de-DE') : '-'} · Offen: {formatCurrency(row.offenBetrag)}
                          {row.daysOverdue > 0 && (
                            <span className="ml-2 font-semibold">({row.daysOverdue} {row.daysOverdue === 1 ? 'Tag' : 'Tage'} überfällig)</span>
                          )}
                        </div>
```

### Schritt 6: Typecheck

```bash
npm run typecheck
```

Erwartete Ausgabe: keine Fehler

### Schritt 7: Commit

```bash
git add src/services/dashboardService.ts src/App.tsx src/services/dashboardService.test.ts
git commit -m "feat(dashboard): add daysOverdue field to overdue invoices"
```

---

## Task 3: Abschluss-Typecheck und finaler Test-Run

### Schritt 1: Alle Tests ausführen

```bash
npx vitest run
```

Erwartete Ausgabe: alle bestehenden Tests grün, `dashboardService.test.ts` mit 9 Tests grün

### Schritt 2: Typecheck

```bash
npm run typecheck
```

Erwartete Ausgabe: keine Fehler

### Schritt 3: Finaler Commit falls nötig

Falls noch unstaged changes vorhanden:

```bash
git status
git add -p
git commit -m "chore(dashboard): final cleanup"
```
