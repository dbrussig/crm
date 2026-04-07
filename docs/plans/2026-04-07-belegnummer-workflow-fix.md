# Belegnummer-Format, Workflow-Logik & Delete-Modal

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Drei Fixes: Belegnummern korrekt mit Bindestrichen erzeugen, direkten Angebot→Rechnung-Pfad sperren, Lösch-Bestätigung als React-Modal (window.confirm ist in Tauri deaktiviert).

**Architecture:** Alle Fixes in-place. Keine neuen Services. Neues `ConfirmModal`-Component in `src/components/ConfirmModal.tsx`, genutzt von `InvoiceList.tsx`. Belegnummer-Fix in `invoiceService.ts`. Workflow-Fix in `InvoiceList.tsx`.

**Tech Stack:** TypeScript, React, Vitest

---

## Kontext

### Problem 1: Belegnummer-Format falsch
`genInvoiceNo()` erzeugt `AB2026001` (kein Bindestrich, falsches Format).
- Scan-Regex `^${prefix}${yyyy}(\d+)$` findet KEINE bestehenden Einträge mit Bindestrich-Format (z.B. `AN-2026-034`) → maxSeq bleibt 0 → neue Rechnung bekommt immer `RE2026001`
- User erwartet `RE-2026-034`

**Fix:**
1. `genInvoiceNo()` output: `AB-2026-001` (mit Bindestrichen)
2. `genInvoiceNo()` scan-Regex: auch `AB-2026-001` und `AN-2026-001` erkennen
3. Beim Scan für Angebote: auch `AN`-Prefix berücksichtigen (Altdaten)

### Problem 2: Angebot → direkt Rechnung möglich
`InvoiceList.tsx` Zeile 612–622 zeigt für Angebote einen "Zu Rechnung"-Button.
Korrekter Workflow: **Angebot → Auftrag → Rechnung** (kein Überspringen).

**Fix:** Button für `Angebot → Rechnung` aus InvoiceList entfernen.

### Problem 3: Delete-Confirmation fehlt in Tauri
`capabilities/default.json` hat `"dialog": false` → `window.confirm()` wird blockiert.
Bestehender `confirm()`-Aufruf in `handleDelete` (Zeile 121) funktioniert nicht.

**Fix:** Neues `ConfirmModal`-Component, `handleDelete` nutzt React-State statt `confirm()`.

---

## Task 1: Belegnummer-Format fixen

**Files:**
- Modify: `src/services/invoiceService.ts` (Zeilen 76–97)
- Modify: `src/services/invoiceService.test.ts`

### Schritt 1: `genInvoiceNo()` fixen

In `src/services/invoiceService.ts`, Funktion `genInvoiceNo()` (Zeile 76–97):

**Alt:**
```typescript
async function genInvoiceNo(type: InvoiceType, now = new Date()): Promise<string> {
  const yyyy = now.getFullYear();
  const prefix = getInvoicePrefix(type);
  const all = await getAllInvoices();
  const re = new RegExp(`^${prefix}${yyyy}(\\d+)$`);
  let maxSeq = 0;

  for (const inv of all) {
    const no = String(inv.invoiceNo || '').trim();
    const m = re.exec(no);
    if (!m?.[1]) continue;
    const seq = Number(m[1]);
    if (Number.isFinite(seq)) {
      maxSeq = Math.max(maxSeq, seq);
    }
  }

  const next = maxSeq + 1;
  return `${prefix}${yyyy}${String(next).padStart(3, '0')}`;
}
```

**Neu:**
```typescript
async function genInvoiceNo(type: InvoiceType, now = new Date()): Promise<string> {
  const yyyy = now.getFullYear();
  const prefix = getInvoicePrefix(type);
  const all = await getAllInvoices();

  // Scan-Prefixe: AB und AN für Angebote (Altdaten-Kompatibilität), sonst nur aktueller Prefix.
  const scanPrefixes = type === 'Angebot' ? ['AB', 'AN'] : [prefix];

  // Matcht kompakt (AB2026034) und mit Bindestrich (AB-2026-034 oder AN-2026-034).
  const reList = scanPrefixes.map(
    (p) => new RegExp(`^${p}[-_]?${yyyy}[-_]?(\\d+)$`)
  );

  let maxSeq = 0;
  for (const inv of all) {
    const no = String(inv.invoiceNo || '').trim().toUpperCase();
    for (const re of reList) {
      const m = re.exec(no);
      if (!m?.[1]) continue;
      const seq = Number(m[1]);
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
    }
  }

  const next = maxSeq + 1;
  return `${prefix}-${yyyy}-${String(next).padStart(3, '0')}`;
}
```

### Schritt 2: Tests anpassen

In `src/services/invoiceService.test.ts` — der Test für Fallback (Zeile 70) erwartet `/^AU\d{4}\d{3,}$/`:

**Alt:**
```typescript
expect(newInvoice.invoiceNo).toMatch(/^AU\d{4}\d{3,}$/);
```

**Neu:**
```typescript
// Format mit Bindestrich: AU-2026-001
expect(newInvoice.invoiceNo).toMatch(/^AU-\d{4}-\d{3,}$/);
```

### Schritt 3: Tests ausführen

```bash
npx vitest run src/services/invoiceService.test.ts
```

Erwartete Ausgabe: `3 passed`

### Schritt 4: Typecheck

```bash
npm run typecheck
```

### Schritt 5: Commit

```bash
git add src/services/invoiceService.ts src/services/invoiceService.test.ts
git commit -m "fix(invoices): generate hyphenated invoice numbers (RE-2026-001), fix seq scan for legacy formats"
```

---

## Task 2: Angebot → direkt Rechnung sperren

**Files:**
- Modify: `src/components/InvoiceList.tsx` (Zeilen 612–622)

### Schritt 1: Button entfernen

In `src/components/InvoiceList.tsx` — den Block für `Angebot → Rechnung` entfernen:

**Entfernen (Zeilen 612–622):**
```tsx
{invoice.invoiceType === 'Angebot' && onConvertToInvoice && (
  <button
    onClick={() => void runAction(`toInvoice:${invoice.id}`, async () => { await onConvertToInvoice(invoice.id); })}
    className={actionButtonClass}
    disabled={Boolean(busyActionKey)}
    title="Zu Rechnung konvertieren"
    aria-label={`Angebot ${invoice.invoiceNo} zu Rechnung konvertieren`}
  >
    🧾
  </button>
)}
```

Nur der Block für `Auftrag → Rechnung` (Zeilen 624–634) bleibt bestehen.

### Schritt 2: Typecheck

```bash
npm run typecheck
```

Erwartete Ausgabe: keine Fehler

### Schritt 3: Commit

```bash
git add src/components/InvoiceList.tsx
git commit -m "fix(workflow): remove direct Angebot→Rechnung conversion, enforce AN→AU→RE path"
```

---

## Task 3: Delete-Confirmation als React-Modal

**Problem:** `window.confirm()` ist in Tauri durch `"dialog": false` in `capabilities/default.json` blockiert. Lösch-Dialog erscheint nicht.

**Files:**
- Create: `src/components/ConfirmModal.tsx`
- Modify: `src/components/InvoiceList.tsx`

### Schritt 1: `ConfirmModal.tsx` erstellen

Erstelle `src/components/ConfirmModal.tsx`:

```tsx
import React from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="text-base font-semibold text-slate-900 mb-2">{title}</div>
        <div className="text-sm text-slate-600 mb-6">{message}</div>
        <div className="flex items-center justify-end gap-3">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Schritt 2: `InvoiceList.tsx` anpassen

**Import hinzufügen** (oben in der Datei):
```typescript
import ConfirmModal from './ConfirmModal';
```

**State hinzufügen** (am Anfang des Komponenten-Körpers, nach den anderen useState):
```typescript
const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; no: string } | null>(null);
```

**`handleDelete` ersetzen** (Zeilen 120–140):

**Alt:**
```typescript
const handleDelete = async (invoiceId: string, invoiceNo: string) => {
  if (!confirm(`Beleg ${invoiceNo} wirklich löschen?`)) {
    return;
  }
  try {
    await removeInvoice(invoiceId);
    const loaded = await fetchAllInvoices();
    setInvoices(loaded);
    if (onDelete) onDelete(invoiceId);
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    const message = error instanceof Error ? error.message : String(error || 'Unbekannter Fehler');
    alert(`Löschen fehlgeschlagen: ${message}`);
  }
};
```

**Neu — zwei Funktionen:**
```typescript
// Öffnet das Confirm-Modal (kein window.confirm — in Tauri blockiert)
const requestDelete = (invoiceId: string, invoiceNo: string) => {
  setDeleteConfirm({ id: invoiceId, no: invoiceNo });
};

const confirmDelete = async () => {
  if (!deleteConfirm) return;
  const { id, no } = deleteConfirm;
  setDeleteConfirm(null);
  try {
    await removeInvoice(id);
    const loaded = await fetchAllInvoices();
    setInvoices(loaded);
    if (onDelete) onDelete(id);
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    const message = error instanceof Error ? error.message : String(error || 'Unbekannter Fehler');
    alert(`Löschen fehlgeschlagen: ${message}`);
  }
};
```

**Delete-Button anpassen** (Zeile 638):

**Alt:**
```tsx
onClick={() => void runAction(`delete:${invoice.id}`, async () => { await handleDelete(invoice.id, invoice.invoiceNo); })}
```

**Neu:**
```tsx
onClick={() => requestDelete(invoice.id, invoice.invoiceNo)}
```

(kein `runAction` nötig — Modal öffnet sofort synchron)

**ConfirmModal ins JSX einbinden** (am Ende des Return, direkt vor dem schließenden `</div>` der Komponente):
```tsx
{deleteConfirm && (
  <ConfirmModal
    title="Beleg löschen"
    message={`Beleg ${deleteConfirm.no} wirklich unwiderruflich löschen?`}
    confirmLabel="Endgültig löschen"
    onConfirm={() => void confirmDelete()}
    onCancel={() => setDeleteConfirm(null)}
  />
)}
```

### Schritt 3: Typecheck

```bash
npm run typecheck
```

Erwartete Ausgabe: keine Fehler

### Schritt 4: Commit

```bash
git add src/components/ConfirmModal.tsx src/components/InvoiceList.tsx
git commit -m "fix(ui): replace window.confirm with React modal for invoice delete (Tauri compat)"
```

---

## Abschluss

### Alle Tests + Typecheck

```bash
npx vitest run src/services/invoiceService.test.ts
npm run typecheck
```

Erwartete Ausgabe: alle Tests grün, kein Typecheck-Fehler.

### .app bauen

```bash
npm run tauri:build
```
