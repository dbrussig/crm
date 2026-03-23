import React, { useMemo, useState } from 'react';
import { importFromSubTotalFile, type SubTotalImportReport } from '../services/subtotalImportService';

export default function SubTotalImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SubTotalImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [importCustomers, setImportCustomers] = useState(true);
  const [importInvoices, setImportInvoices] = useState(true);
  const [importRentals, setImportRentals] = useState(true);

  const canImport = useMemo(() => Boolean(file) && !busy, [file, busy]);

  return (
    <div className="border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">SubTotal Import</p>
          <p className="text-xs text-slate-500">
            Importiert Kunden/Belege aus der SubTotal Datenbank. Unterstuetzt `.st` (gzip) und `.sqlite`. Hinweis: Kunden werden aus den Belegen (BuyerName/BuyerAddress) abgeleitet.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <input
          type="file"
          // Some SubTotal exports come without extension; allow generic binary selection.
          accept=".st,.sqlite,.db,.txt,application/octet-stream,*/*"
          id="subtotal-import-file"
          aria-label="SubTotal Datei"
          onChange={(e) => {
            setError(null);
            setReport(null);
            setFile(e.target.files?.[0] || null);
          }}
        />

        <div className="grid grid-cols-3 gap-2 text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={importCustomers} onChange={(e) => setImportCustomers(e.target.checked)} />
            Kunden
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={importInvoices} onChange={(e) => setImportInvoices(e.target.checked)} />
            Belege
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={importRentals} onChange={(e) => setImportRentals(e.target.checked)} />
            Vorgänge (aus Mietzeitraum)
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canImport}
            onClick={async () => {
              if (!file) return;
              const ok = confirm(
                'SubTotal Import starten?\n\nHinweis: Duplikate werden (best-effort) uebersprungen.\nNach dem Import ggf. Seite neu laden.'
              );
              if (!ok) return;
              setBusy(true);
              setError(null);
              setReport(null);
              try {
                const r = await importFromSubTotalFile(file, { importCustomers, importInvoices, importRentals, dryRun: false });
                setReport(r);
              } catch (e: any) {
                setError(e?.message || String(e));
              } finally {
                setBusy(false);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              canImport ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {busy ? 'Import laeuft...' : 'Import starten'}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm border border-slate-200 hover:bg-slate-50"
            onClick={() => window.location.reload()}
          >
            Seite neu laden
          </button>
        </div>

        {error && (
          <div
            className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200"
            role="status"
            aria-live="polite"
          >
            ❌ {error}
          </div>
        )}

        {report && (
          <div
            className="text-xs bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg border border-emerald-200 space-y-1"
            role="status"
            aria-live="polite"
          >
            <div>
              <strong>DB:</strong> {report.db.invoiceTypes} Typen, {report.db.invoices} Belege, {report.db.invoiceItems} Positionen
            </div>
            <div>
              <strong>Import:</strong> {report.imported.customers} Kunden, {report.imported.invoices} Belege, {report.imported.invoiceItems} Positionen, {report.imported.rentals} Vorgänge
            </div>
            <div>
              <strong>Uebersprungen:</strong> {report.skipped.customers} Kunden (Duplikat), {report.skipped.invoices} Belege (Duplikat)
            </div>
            <div>
              <strong>Firmenprofil:</strong> {report.companyProfileUpdated ? 'uebernommen' : 'nicht geaendert'}
            </div>
            <div>
              <strong>Belegtypen:</strong> {report.invoiceTypeProfilesUpdated ? 'uebernommen (Labels/Spalten)' : 'nicht geaendert'}
            </div>
            {report.warnings.length > 0 && (
              <div className="text-amber-800">
                <strong>Hinweise:</strong> {report.warnings.join(' | ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
