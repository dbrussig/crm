import React, { useMemo, useState } from 'react';
import type { InvoiceType, SubTotalInvoiceTypeProfile } from '../types';
import {
  getSubTotalInvoiceTypeProfiles,
  getSubTotalInvoiceTypeMapping,
  isSubTotalInvoiceTypeProfilesEnabled,
  saveSubTotalInvoiceTypeMapping,
  saveSubTotalInvoiceTypeProfiles,
  setSubTotalInvoiceTypeProfilesEnabled,
} from '../services/subtotalInvoiceTypeProfileService';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function labelRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <div className="text-xs text-slate-600">{props.label}</div>
      <input
        className="col-span-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder || ''}
      />
    </div>
  );
}

function showToggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

export default function SubTotalInvoiceTypeProfilePanel() {
  const [enabled, setEnabled] = useState<boolean>(() => isSubTotalInvoiceTypeProfilesEnabled());
  const [profiles, setProfiles] = useState<SubTotalInvoiceTypeProfile[]>(() => getSubTotalInvoiceTypeProfiles());
  const [mapping, setMapping] = useState<Record<InvoiceType, number | null>>(() => getSubTotalInvoiceTypeMapping());

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const profileOptions = useMemo(
    () =>
      profiles
        .slice()
        .sort((a, b) => a.invoiceTypeId - b.invoiceTypeId)
        .map((p) => ({ id: p.invoiceTypeId, label: `${p.invoiceTypeId}: ${p.name}` })),
    [profiles]
  );

  const updateProfile = (invoiceTypeId: number, next: SubTotalInvoiceTypeProfile) => {
    setDirty(true);
    setProfiles((cur) => cur.map((p) => (p.invoiceTypeId === invoiceTypeId ? next : p)));
  };

  const persist = () => {
    saveSubTotalInvoiceTypeProfiles(profiles);
    saveSubTotalInvoiceTypeMapping(mapping);
    setSubTotalInvoiceTypeProfilesEnabled(enabled);
    setDirty(false);
  };

  const reloadFromStorage = () => {
    setProfiles(getSubTotalInvoiceTypeProfiles());
    setMapping(getSubTotalInvoiceTypeMapping());
    setEnabled(isSubTotalInvoiceTypeProfilesEnabled());
    setDirty(false);
  };

  return (
    <div className="border-t border-slate-200 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Belegtypen (SubTotal)</p>
          <p className="text-xs text-slate-500">
            Verwaltung der aus SubTotal importierten InvoiceTypes: Labels und Spaltensteuerung fuer Editor und PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50"
            onClick={reloadFromStorage}
          >
            Neu laden
          </button>
          <button
            type="button"
            disabled={!dirty}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              dirty ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700' : 'bg-slate-200 text-slate-500 border-slate-200'
            }`}
            onClick={() => persist()}
          >
            Speichern
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setDirty(true);
              setEnabled(e.target.checked);
            }}
          />
          SubTotal-Belegtypen aktiv verwenden (sonst Standard-Labels/Spalten)
        </label>

        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
          <p className="text-xs font-semibold text-slate-700 mb-2">Mapping (welcher SubTotal-Typ steuert welchen CRM-Typ)</p>
          <div className="grid grid-cols-3 gap-2">
            {(['Angebot', 'Auftrag', 'Rechnung'] as InvoiceType[]).map((t) => (
              <div key={t} className="space-y-1">
                <label className="text-xs font-medium text-slate-700" htmlFor={`subtotal-map-${t}`}>
                  {t}
                </label>
                <select
                  id={`subtotal-map-${t}`}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={mapping[t] ?? ''}
                  onChange={(e) => {
                    setDirty(true);
                    const v = e.target.value ? Number(e.target.value) : null;
                    setMapping((cur) => ({ ...cur, [t]: v }));
                  }}
                >
                  <option value="">Auto</option>
                  {profileOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Tipp: Wenn du in SubTotal z.B. "Rechnung mit Verrechnung" nutzt, kannst du das hier explizit auf "Rechnung" mappen.
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="text-xs text-slate-600">Noch keine SubTotal InvoiceTypes gespeichert. Erst Import ausfuehren.</div>
        ) : (
          <div className="space-y-2">
            {profiles
              .slice()
              .sort((a, b) => a.invoiceTypeId - b.invoiceTypeId)
              .map((p) => {
                const isOpen = expandedId === p.invoiceTypeId;
                const color = p.color || '#669C35';
                return (
                  <div key={p.invoiceTypeId} className="rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-slate-50"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedId((cur) => (cur === p.invoiceTypeId ? null : p.invoiceTypeId))}
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} aria-hidden="true" />
                        <span className="text-sm font-medium text-slate-800">
                          {p.invoiceTypeId}: {p.name}
                        </span>
                        {p.heading && <span className="text-xs text-slate-500">({p.heading})</span>}
                      </div>
                      <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
                    </button>

                    {isOpen && (
                      <div className="p-3 bg-white space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          {labelRow({
                            label: 'Name',
                            value: p.name,
                            onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, name: v }),
                          })}
                          {labelRow({
                            label: 'Heading',
                            value: p.heading || '',
                            onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, heading: v || undefined }),
                          })}
                          {labelRow({
                            label: 'Farbe',
                            value: p.color || '',
                            onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, color: v || undefined }),
                            placeholder: '#669C35',
                          })}
                          {labelRow({
                            label: 'Sprache',
                            value: p.language || '',
                            onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, language: v || undefined }),
                            placeholder: 'de-DE',
                          })}
                        </div>

                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Labels</p>
                          <div className="space-y-2">
                            {labelRow({
                              label: 'Nr.',
                              value: p.labels.invoiceNo || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, invoiceNo: v || undefined } }),
                              placeholder: 'Angebotsnummer',
                            })}
                            {labelRow({
                              label: 'Datum',
                              value: p.labels.invoiceDate || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, invoiceDate: v || undefined } }),
                              placeholder: 'Angebotsdatum',
                            })}
                            {labelRow({
                              label: 'Faellig',
                              value: p.labels.dueDate || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, dueDate: v || undefined } }),
                              placeholder: 'Faelligkeitsdatum',
                            })}
                            {labelRow({
                              label: 'Gesamt',
                              value: p.labels.totalSum || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, totalSum: v || undefined } }),
                              placeholder: 'Gesamtbetrag',
                            })}
                            {labelRow({
                              label: 'Beschreibung',
                              value: p.labels.description || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, description: v || undefined } }),
                            })}
                            {labelRow({
                              label: 'Menge',
                              value: p.labels.quantity || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, quantity: v || undefined } }),
                            })}
                            {labelRow({
                              label: 'Einheit',
                              value: p.labels.unit || '',
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, unit: v || undefined } }),
                            })}
                            {labelRow({
                              label: 'Einzelpreis',
                              value: p.labels.unitPrice || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, unitPrice: v || undefined } }),
                            })}
                            {labelRow({
                              label: 'USt.',
                              value: p.labels.tax || '',
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, tax: v || undefined } }),
                            })}
                            {labelRow({
                              label: 'Betrag',
                              value: p.labels.lineTotal || '',
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, labels: { ...p.labels, lineTotal: v || undefined } }),
                            })}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Spalten anzeigen</p>
                          <div className="flex flex-wrap gap-3">
                            {showToggle({
                              label: 'Beschreibung',
                              checked: p.show.description ?? true,
                              onChange: (v) =>
                                updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, description: v } }),
                            })}
                            {showToggle({
                              label: 'Menge',
                              checked: p.show.quantity ?? true,
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, quantity: v } }),
                            })}
                            {showToggle({
                              label: 'Einheit',
                              checked: p.show.unit ?? true,
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, unit: v } }),
                            })}
                            {showToggle({
                              label: 'Einzelpreis',
                              checked: p.show.unitPrice ?? true,
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, unitPrice: v } }),
                            })}
                            {showToggle({
                              label: 'USt.',
                              checked: p.show.tax ?? false,
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, tax: v } }),
                            })}
                            {showToggle({
                              label: 'Betrag',
                              checked: p.show.lineTotal ?? true,
                              onChange: (v) => updateProfile(p.invoiceTypeId, { ...p, show: { ...p.show, lineTotal: v } }),
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg text-xs border border-slate-200 hover:bg-slate-50"
                            onClick={() => {
                              const ok = confirm(`Profil ${p.invoiceTypeId}: ${p.name} wirklich loeschen?`);
                              if (!ok) return;
                              setDirty(true);
                              setProfiles((cur) => cur.filter((x) => x.invoiceTypeId !== p.invoiceTypeId));
                              setExpandedId(null);
                              // Clean mapping if pointing to deleted profile
                              setMapping((cur) => {
                                const next = { ...cur };
                                (Object.keys(next) as InvoiceType[]).forEach((k) => {
                                  if (next[k] === p.invoiceTypeId) next[k] = null;
                                });
                                return next;
                              });
                            }}
                          >
                            Loeschen
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => {
                              // Force a deep clone to trigger state updates in nested objects.
                              updateProfile(p.invoiceTypeId, clone(p));
                            }}
                          >
                            Aenderungen uebernehmen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

