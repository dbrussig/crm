import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importFromSubTotalFile, type SubTotalImportReport } from '../services/subtotalImportService';
import {
  getSubTotalInvoiceTypeProfiles,
  saveSubTotalInvoiceTypeProfiles,
  isSubTotalInvoiceTypeProfilesEnabled,
  setSubTotalInvoiceTypeProfilesEnabled,
  getSubTotalInvoiceTypeMapping,
  saveSubTotalInvoiceTypeMapping,
} from '../services/subtotalInvoiceTypeProfileService';
import type { SubTotalInvoiceTypeProfile, InvoiceType } from '../types';
import ConfirmModal from './ConfirmModal';

type Tab = 'import' | 'belegtypen' | 'mapping';

const INVOICE_TYPE_OPTIONS: { value: InvoiceType; label: string }[] = [
  { value: 'Angebot', label: 'Angebot' },
  { value: 'Auftrag', label: 'Auftrag' },
  { value: 'Rechnung', label: 'Rechnung' },
];

export default function SubTotalImportPanel() {
  // ─── Tabs ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('import');

  // ─── Import State ──────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SubTotalImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importCustomers, setImportCustomers] = useState(true);
  const [importInvoices, setImportInvoices] = useState(true);
  const [importRentals, setImportRentals] = useState(true);

  // ─── Belegtypen State ───────────────────────────────────────────
  const [profiles, setProfiles] = useState<SubTotalInvoiceTypeProfile[]>([]);
  const [profilesEnabled, setProfilesEnabled] = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<SubTotalInvoiceTypeProfile | null>(null);

  // ─── Mapping State ──────────────────────────────────────────────
  const [mapping, setMapping] = useState<Record<InvoiceType, number | null>>({
    Angebot: null,
    Auftrag: null,
    Rechnung: null,
  });
  const [mappingDirty, setMappingDirty] = useState(false);

  // ─── Confirm Modal ─────────────────────────────────────────────
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } | null>(null);

  const requestConfirm = (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }) => {
    setConfirmModal(opts);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  };

  // ─── Load Data ───────────────────────────────────────────────────
  const loadProfiles = useCallback(() => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const loaded = getSubTotalInvoiceTypeProfiles();
      setProfiles(loaded);
      setProfilesEnabled(isSubTotalInvoiceTypeProfilesEnabled());
      setMapping(getSubTotalInvoiceTypeMapping());
    } catch (e: any) {
      setProfilesError(e?.message || 'Fehler beim Laden der Belegtypen');
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'belegtypen' || activeTab === 'mapping') {
      loadProfiles();
    }
  }, [activeTab, loadProfiles]);

  const canImport = useMemo(() => Boolean(file) && !busy, [file, busy]);

  // ─── Save Handlers ───────────────────────────────────────────────
  const handleSaveProfiles = async () => {
    const ok = await requestConfirm({
      title: 'Belegtypen speichern',
      message: 'Aenderungen an Belegtypen speichern?\n\nDies ueberschreibt die aktuellen Einstellungen.',
      confirmLabel: 'Speichern',
      cancelLabel: 'Abbrechen',
    });
    if (!ok) return;

    try {
      saveSubTotalInvoiceTypeProfiles(profiles);
      setSubTotalInvoiceTypeProfilesEnabled(profilesEnabled);
      setProfilesError(null);
      // eslint-disable-next-line no-alert
      alert('✅ Belegtypen gespeichert!');
    } catch (e: any) {
      setProfilesError(e?.message || 'Fehler beim Speichern');
    }
  };

  const handleSaveMapping = () => {
    try {
      saveSubTotalInvoiceTypeMapping(mapping);
      setMappingDirty(false);
      // eslint-disable-next-line no-alert
      alert('✅ Mapping gespeichert!');
    } catch (e: any) {
      setProfilesError(e?.message || 'Fehler beim Speichern des Mappings');
    }
  };

  const handleReload = () => {
    if (mappingDirty || editingProfile) {
      requestConfirm({
        title: 'Neu laden',
        message: 'Ungespeicherte Aenderungen gehen verloren. Trotzdem neu laden?',
        confirmLabel: 'Neu laden',
        cancelLabel: 'Abbrechen',
        danger: true,
      }).then((ok) => {
        if (ok) loadProfiles();
      });
    } else {
      loadProfiles();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="border-t border-slate-200 pt-3">
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          danger={confirmModal.danger}
          onConfirm={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(true);
          }}
          onCancel={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(false);
          }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">SubTotal Import & Belegtypen</p>
          <p className="text-xs text-slate-500">
            Importiert Kunden/Belege aus der SubTotal Datenbank. Verwaltet Belegtypen (Labels/Spalten) und Mapping.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'import', label: 'Import' },
            { id: 'belegtypen', label: 'Belegtypen' },
            { id: 'mapping', label: 'Mapping' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Import */}
      {activeTab === 'import' && (
        <div className="mt-3 space-y-2">
          <input
            type="file"
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
                const ok = await requestConfirm({
                  title: 'SubTotal Import',
                  message: 'SubTotal Import starten?\n\nHinweis: Duplikate werden (best-effort) uebersprungen.\nNach dem Import ggf. Seite neu laden.',
                  confirmLabel: 'Import starten',
                  cancelLabel: 'Abbrechen',
                  danger: false,
                });
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
            <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200" role="status" aria-live="polite">
              ❌ {error}
            </div>
          )}

          {report && (
            <div className="text-xs bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg border border-emerald-200 space-y-1" role="status" aria-live="polite">
              <div><strong>DB:</strong> {report.db.invoiceTypes} Typen, {report.db.invoices} Belege, {report.db.invoiceItems} Positionen</div>
              <div><strong>Import:</strong> {report.imported.customers} Kunden, {report.imported.invoices} Belege, {report.imported.invoiceItems} Positionen, {report.imported.rentals} Vorgänge</div>
              <div><strong>Uebersprungen:</strong> {report.skipped.customers} Kunden (Duplikat), {report.skipped.invoices} Belege (Duplikat)</div>
              <div><strong>Firmenprofil:</strong> {report.companyProfileUpdated ? 'uebernommen' : 'nicht geaendert'}</div>
              <div><strong>Belegtypen:</strong> {report.invoiceTypeProfilesUpdated ? 'uebernommen (Labels/Spalten)' : 'nicht geaendert'}</div>
              {report.warnings.length > 0 && <div className="text-amber-800"><strong>Hinweise:</strong> {report.warnings.join(' | ')}</div>}
            </div>
          )}
        </div>
      )}

      {/* Tab: Belegtypen */}
      {activeTab === 'belegtypen' && (
        <div className="mt-3 space-y-3">
          {profilesError && (
            <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
              ❌ {profilesError}
            </div>
          )}

          {profilesLoading && (
            <div className="text-sm text-slate-600">Lade Belegtypen...</div>
          )}

          {!profilesLoading && profiles.length === 0 && (
            <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg">
              Noch keine SubTotal InvoiceTypes gespeichert. Führe zuerst einen Import aus.
            </div>
          )}

          {!profilesLoading && profiles.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={profilesEnabled}
                    onChange={(e) => setProfilesEnabled(e.target.checked)}
                  />
                  <span className={profilesEnabled ? 'font-medium text-slate-900' : 'text-slate-500'}>
                    SubTotal-Belegtypen aktiv verwenden
                  </span>
                </label>
                <span className="text-xs text-slate-500">
                  {profilesEnabled ? '(sonst Standard-Labels/Spalten)' : '(Standard-Labels aktiv)'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">ID</th>
                      <th className="px-3 py-2 text-left font-medium">Label (Beleg)</th>
                      <th className="px-3 py-2 text-left font-medium">Label (Liste)</th>
                      <th className="px-3 py-2 text-center font-medium">Menge</th>
                      <th className="px-3 py-2 text-center font-medium">Einheit</th>
                      <th className="px-3 py-2 text-center font-medium">EP</th>
                      <th className="px-3 py-2 text-center font-medium">USt.</th>
                      <th className="px-3 py-2 text-center font-medium">Summe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {profiles.map((profile) => (
                      <tr
                        key={profile.invoiceTypeId}
                        className={editingProfile?.invoiceTypeId === profile.invoiceTypeId ? 'bg-blue-50' : 'hover:bg-slate-50'}
                        onClick={() => setEditingProfile(profile)}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{profile.invoiceTypeId}</td>
                        <td className="px-3 py-2">{profile.name || '-'}</td>
                        <td className="px-3 py-2">{profile.heading || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          {profile.show?.quantity ? '✓' : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {profile.show?.unit ? '✓' : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {profile.show?.unitPrice ? '✓' : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {profile.show?.tax ? '✓' : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {profile.show?.lineTotal ? '✓' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editingProfile && (
                <div className="bg-slate-50 p-3 rounded-lg space-y-2">
                  <h4 className="text-sm font-medium text-slate-800">
                    Bearbeiten: {editingProfile.invoiceTypeId} - {editingProfile.name}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-slate-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={editingProfile.name || ''}
                        onChange={(e) => setEditingProfile({
                          ...editingProfile,
                          name: e.target.value,
                        })}
                        className="w-full px-2 py-1 border border-slate-300 rounded"
                        title="Name des Belegtyps"
                        placeholder="z.B. Angebot"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Überschrift (Heading)</label>
                      <input
                        type="text"
                        value={editingProfile.heading || ''}
                        onChange={(e) => setEditingProfile({
                          ...editingProfile,
                          heading: e.target.value,
                        })}
                        className="w-full px-2 py-1 border border-slate-300 rounded"
                        title="Überschrift für den Beleg"
                        placeholder="z.B. ANGEBOT"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    {[
                      { key: 'quantity', label: 'Menge' },
                      { key: 'unit', label: 'Einheit' },
                      { key: 'unitPrice', label: 'EP' },
                      { key: 'tax', label: 'USt.' },
                      { key: 'lineTotal', label: 'Summe' },
                    ].map(({ key, label }) => (
                      <label key={key} className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editingProfile.show?.[key as keyof typeof editingProfile.show] ?? true}
                          onChange={(e) => setEditingProfile({
                            ...editingProfile,
                            show: { ...editingProfile.show, [key]: e.target.checked },
                          })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfiles(profiles.map((p) =>
                          p.invoiceTypeId === editingProfile.invoiceTypeId ? editingProfile : p
                        ));
                        setEditingProfile(null);
                      }}
                      className="px-3 py-1 bg-slate-900 text-white text-xs rounded hover:bg-slate-800"
                    >
                      Übernehmen
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(null)}
                      className="px-3 py-1 border border-slate-300 text-xs rounded hover:bg-slate-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveProfiles}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-200 hover:bg-slate-50"
                >
                  Neu laden
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Mapping */}
      {activeTab === 'mapping' && (
        <div className="mt-3 space-y-3">
          {profilesError && (
            <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
              ❌ {profilesError}
            </div>
          )}

          {profilesLoading && (
            <div className="text-sm text-slate-600">Lade Daten...</div>
          )}

          {!profilesLoading && profiles.length === 0 && (
            <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg">
              Noch keine SubTotal InvoiceTypes gespeichert. Führe zuerst einen Import aus.
            </div>
          )}

          {!profilesLoading && profiles.length > 0 && (
            <>
              <p className="text-sm text-slate-600">
                Mappe SubTotal-Belegtypen auf CRM-Typen. Tipp: Wenn du in SubTotal z.B. "Rechnung mit Verrechnung" nutzt, kannst du das hier explizit auf "Rechnung" mappen.
              </p>

              <div className="space-y-2">
                {INVOICE_TYPE_OPTIONS.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium text-slate-700 w-24">{label}</span>
                    <span className="text-slate-400">→</span>
                    <select
                      value={mapping[value] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((m) => ({
                          ...m,
                          [value]: val ? Number(val) : null,
                        }));
                        setMappingDirty(true);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                      aria-label={`SubTotal Typ für ${label} auswählen`}
                      title={`SubTotal Typ für ${label}`}
                    >
                      <option value="">(nicht gemappt)</option>
                      {profiles.map((p) => (
                        <option key={p.invoiceTypeId} value={p.invoiceTypeId}>
                          {p.invoiceTypeId}: {p.name || 'Unbenannt'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {mappingDirty && (
                <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200">
                  ⚠️ Ungespeicherte Änderungen am Mapping
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveMapping}
                  disabled={!mappingDirty}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    mappingDirty
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-200 hover:bg-slate-50"
                >
                  Neu laden
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
