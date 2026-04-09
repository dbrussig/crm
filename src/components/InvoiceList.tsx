/**
 * InvoiceList Component
 * Liste aller Belege (Angebot, Auftrag, Rechnung)
 * Mit Filter, Sortierung und Export
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowRight, Check, Eye, FileText, Mail, Pencil, Send, Trash2 } from 'lucide-react';
import { Invoice, InvoiceItem, InvoiceType, InvoiceState, Customer, MailTransportSettings } from '../types';
import {
  fetchAllInvoices,
  fetchInvoicesByType,
  fetchInvoicesByState,
  removeInvoice,
} from '../services/invoiceService';
import { openInvoicePreview, saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { openInvoiceCompose, type EmailSendResult } from '../services/invoiceEmailService';
import { getInvoiceItems, getPaymentsByInvoice } from '../services/sqliteService';
import { getDefaultInvoiceLayoutId, getInvoiceLayout } from '../config/invoiceLayouts';
import ConfirmModal from './ConfirmModal';

interface InvoiceListProps {
  customers?: Customer[];
  mailTransportSettings?: MailTransportSettings;
  onCreate?: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete?: (invoiceId: string) => void;
  onSend?: (invoiceId: string) => void;
  onMarkSent?: (invoiceId: string) => void;
  onMarkAccepted?: (invoiceId: string) => void;
  onConvertToOrder?: (invoiceId: string) => void;
  onConvertToInvoice?: (invoiceId: string) => void;
  reloadTrigger?: number;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  customers = [],
  mailTransportSettings,
  onCreate,
  onEdit,
  onDelete,
  onSend,
  onMarkSent,
  onMarkAccepted,
  onConvertToOrder,
  onConvertToInvoice,
  reloadTrigger,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [amountByInvoiceId, setAmountByInvoiceId] = useState<Record<string, number>>({});
  const [paymentTotalByInvoiceId, setPaymentTotalByInvoiceId] = useState<Record<string, number>>({});
  const [paymentCountByInvoiceId, setPaymentCountByInvoiceId] = useState<Record<string, number>>({});

  // Filter
  const [filterType, setFilterType] = useState<InvoiceType | 'alle'>('alle');
  const [filterState, setFilterState] = useState<InvoiceState | 'alle'>('alle');
  const [searchTerm, setSearchTerm] = useState('');

  // Sortierung
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'schnell' | 'erweitert'>('schnell');
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; no: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const showError = (text: string) => setNotice({ tone: 'error', text });
  const showInfo = (text: string) => setNotice({ tone: 'info', text });

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

  // Load invoices
  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      try {
        const loaded = await fetchAllInvoices();
        setInvoices(loaded);
      } catch (error) {
        console.error('Failed to load invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    void loadInvoices();
  }, [reloadTrigger]);

  // Filter & Sort invoices
  useEffect(() => {
    let filtered = [...invoices];

    // Filter by type
    if (filterType !== 'alle') {
      filtered = filtered.filter((inv) => inv.invoiceType === filterType);
    }

    // Filter by state
    if (filterState !== 'alle') {
      filtered = filtered.filter((inv) => inv.state === filterState);
    }

    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((inv) =>
        inv.invoiceNo.toLowerCase().includes(search) ||
        inv.buyerName.toLowerCase().includes(search) ||
        inv.buyerAddress.toLowerCase().includes(search)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'date') {
        comparison = a.invoiceDate - b.invoiceDate;
      } else if (sortBy === 'number') {
        comparison = a.invoiceNo.localeCompare(b.invoiceNo);
      } else if (sortBy === 'amount') {
        // TODO: Calculate amount from items
        comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredInvoices(filtered);
  }, [invoices, filterType, filterState, searchTerm, sortBy, sortOrder]);

  const requestDelete = (invoiceId: string, invoiceNo: string) => {
    setDeleteConfirm({ id: invoiceId, no: invoiceNo });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await removeInvoice(id);

      // Reload
      const loaded = await fetchAllInvoices();
      setInvoices(loaded);

      if (onDelete) {
        onDelete(id);
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      const message = error instanceof Error ? error.message : String(error || 'Unbekannter Fehler');
      showError(`Löschen fehlgeschlagen: ${message}`);
    }
  };

  // Status Badge
  const getStatusBadge = (state: InvoiceState) => {
    const badges = {
      entwurf: 'bg-gray-100 text-gray-800',
      gesendet: 'bg-blue-100 text-blue-800',
      angenommen: 'bg-green-100 text-green-800',
      storniert: 'bg-red-100 text-red-800',
      archiviert: 'bg-slate-200 text-slate-800',
    };

    const labels = {
      entwurf: 'Entwurf',
      gesendet: 'Gesendet',
      angenommen: 'Angenommen',
      storniert: 'Storniert',
      archiviert: 'Archiviert',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badges[state]}`}>
        {labels[state]}
      </span>
    );
  };

  // Type Badge
  const getTypeBadge = (type: InvoiceType) => {
    const badges = {
      Angebot: 'bg-green-100 text-green-800',
      Auftrag: 'bg-purple-100 text-purple-800',
      Rechnung: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badges[type]}`}>
        {type}
      </span>
    );
  };

  const computeGrandTotal = (invoice: Invoice, items: InvoiceItem[]) => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const up = Number(it.unitPrice) || 0;
      const line = qty * up;
      subtotal += line;
      tax += line * ((Number(it.taxPercent) || 0) / 100);
    }
    const total = subtotal + tax;

    const layout = getInvoiceLayout(invoice.layoutId || getDefaultInvoiceLayoutId(invoice.invoiceType));
    const d = layout.defaultsByType[invoice.invoiceType];
    const depositPercent = typeof invoice.depositPercent === 'number' ? invoice.depositPercent : (d.depositPercent || 0);
    const depositText = String(invoice.depositText || '').trim();
    const depositEnabled = Boolean(invoice.depositEnabled) && (invoice.invoiceType === 'Angebot' || invoice.invoiceType === 'Auftrag');
    const depositAmount =
      depositEnabled && depositText && depositPercent > 0
        ? Math.round((total * (depositPercent / 100)) * 100) / 100
        : 0;

    // Match PDF/export behavior: deposit is included in Gesamtbetrag.
    return Math.round((total + depositAmount) * 100) / 100;
  };

  // Precompute invoice amounts for list display (async, cached in state)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextMap: Record<string, number> = {};
      const all = invoices.slice();
      const concurrency = 8;
      for (let i = 0; i < all.length; i += concurrency) {
        const batch = all.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (inv) => {
            const items = await getInvoiceItems(inv.id);
            return { id: inv.id, amount: computeGrandTotal(inv, items) };
          })
        );
        if (cancelled) return;
        for (const r of results) nextMap[r.id] = r.amount;
      }
      if (cancelled) return;
      setAmountByInvoiceId(nextMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoices]);

  // Precompute linked payments per invoice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const totalMap: Record<string, number> = {};
      const countMap: Record<string, number> = {};
      const all = invoices.slice();
      const concurrency = 8;
      for (let i = 0; i < all.length; i += concurrency) {
        const batch = all.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (inv) => {
            const payments = await getPaymentsByInvoice(inv.id);
            const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            return { id: inv.id, count: payments.length, total };
          })
        );
        if (cancelled) return;
        for (const r of results) {
          totalMap[r.id] = r.total;
          countMap[r.id] = r.count;
        }
      }
      if (cancelled) return;
      setPaymentTotalByInvoiceId(totalMap);
      setPaymentCountByInvoiceId(countMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoices]);

  // Export CSV
  const handleExportCSV = async () => {
    const headers = ['Beleg-Nr', 'Typ', 'Datum', 'Kunde', 'Betrag', 'Status'];
    const rows = await Promise.all(
      filteredInvoices.map(async (inv) => {
        const items = await getInvoiceItems(inv.id);
        const amount = computeGrandTotal(inv, items);
        return [
          inv.invoiceNo,
          inv.invoiceType,
          new Date(inv.invoiceDate).toLocaleDateString('de-DE'),
          inv.buyerName,
          amount.toFixed(2) + ' €',
          inv.state,
        ];
      })
    );

    const csv = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belege_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summe aller angezeigten Belege
  const totalSum = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => {
      const v = amountByInvoiceId[inv.id];
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
  }, [filteredInvoices, amountByInvoiceId]);

  const actionButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  const runAction = async (key: string, action: () => Promise<void> | void) => {
    if (busyActionKey) return;
    setBusyActionKey(key);
    try {
      await Promise.resolve(action());
    } finally {
      setBusyActionKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
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

      {notice && (
        <div
          className={[
            'mb-4 rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-white text-slate-800',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>{notice.text}</div>
            <button
              className="text-slate-600 hover:text-slate-900"
              onClick={() => setNotice(null)}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('schnell')}
              className={['px-3 py-1.5 text-xs', viewMode === 'schnell' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
            >
              Schnell
            </button>
            <button
              type="button"
              onClick={() => setViewMode('erweitert')}
              className={['px-3 py-1.5 text-xs border-l border-slate-200', viewMode === 'erweitert' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
            >
              Erweitert
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={['mb-6 grid gap-4', viewMode === 'erweitert' ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'].join(' ')}>
        {/* Type Filter */}
        <div>
          <label htmlFor="filter-type" className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as InvoiceType | 'alle')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="alle">Alle</option>
            <option value="Angebot">Angebot</option>
            <option value="Auftrag">Auftrag</option>
            <option value="Rechnung">Rechnung</option>
          </select>
        </div>

        {/* State Filter */}
        <div>
          <label htmlFor="filter-state" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            id="filter-state"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as InvoiceState | 'alle')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="alle">Alle</option>
            <option value="entwurf">Entwurf</option>
            <option value="gesendet">Gesendet</option>
            <option value="angenommen">Angenommen</option>
            <option value="storniert">Storniert</option>
            <option value="archiviert">Archiviert</option>
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Suche</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nr., Kunde..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* Sort */}
        {viewMode === 'erweitert' && (
          <div>
            <label htmlFor="filter-sort" className="block text-sm font-medium text-gray-700 mb-1">Sortierung</label>
            <select
              id="filter-sort"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                setSortBy(sort);
                setSortOrder(order);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="date-desc">Datum (neueste zuerst)</option>
              <option value="date-asc">Datum (älteste zuerst)</option>
              <option value="number-asc">Nr. (aufsteigend)</option>
              <option value="number-desc">Nr. (absteigend)</option>
            </select>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {filteredInvoices.length} Belege
          {totalSum > 0 && ` • Summe: ${totalSum.toFixed(2)} €`}
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
          title="Tabelle als CSV exportieren"
        >
          <FileText size={14} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nr.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kunde
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Betrag
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zahlungen
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    <div className="space-y-2">
                      <div>Keine Belege gefunden.</div>
                      <div className="text-xs text-slate-500">
                        Starte mit einem neuen Angebot und führe es danach zu Auftrag/Rechnung.
                      </div>
                      {onCreate ? (
                        <button
                          type="button"
                          onClick={onCreate}
                          className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800"
                        >
                          Jetzt Beleg erstellen
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {invoice.invoiceNo}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getTypeBadge(invoice.invoiceType)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(invoice.invoiceDate).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {invoice.buyerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {typeof amountByInvoiceId[invoice.id] === 'number'
                        ? `${amountByInvoiceId[invoice.id].toFixed(2)} €`
                        : '…'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(paymentCountByInvoiceId[invoice.id] || 0) > 0 ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-emerald-700">
                            {(paymentTotalByInvoiceId[invoice.id] || 0).toFixed(2)} €
                          </span>
                          <span className="text-xs text-gray-500">
                            {paymentCountByInvoiceId[invoice.id]} Eintrag{paymentCountByInvoiceId[invoice.id] === 1 ? '' : 'e'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(invoice.state)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => void runAction(`edit:${invoice.id}`, () => onEdit(invoice))}
                          className={actionButtonClass}
                          disabled={Boolean(busyActionKey)}
                          title="Bearbeiten"
                          aria-label={`Beleg ${invoice.invoiceNo} bearbeiten`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>

                        {/* PDF */}
                        <button
                          onClick={() => void runAction(`preview:${invoice.id}`, async () => { await openInvoicePreview(invoice); })}
                          className={actionButtonClass}
                          disabled={Boolean(busyActionKey)}
                          title="PDF ansehen"
                          aria-label={`Beleg ${invoice.invoiceNo} PDF ansehen`}
                        >
                          <Eye size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => void runAction(`pdf:${invoice.id}`, async () => { await saveInvoicePdfViaPrintDialog(invoice); })}
                          className={actionButtonClass}
                          disabled={Boolean(busyActionKey)}
                          title="PDF speichern (Printdialog)"
                          aria-label={`Beleg ${invoice.invoiceNo} PDF speichern`}
                        >
                          <FileText size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => void runAction(`mail:${invoice.id}`, async () => {
                            const c = customers.find((x) => x.id === invoice.companyId);
                            const toEmail = (c?.email || '').trim();
                            if (!toEmail) {
                              showError('Keine Kunden-E-Mail hinterlegt.');
                              return;
                            }
                            const result = await openInvoiceCompose({
                              invoice,
                              toEmail,
                              customerName: `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || invoice.buyerName,
                              preferGmail: true,
                              mailTransportSettings,
                            });
                            if (result.type === 'sent') {
                              showInfo(result.message);
                            } else if (result.type === 'warning') {
                              showInfo(result.message);
                            } else if (result.type === 'fallback') {
                              const ok = await requestConfirm({
                                title: 'SMTP-Versand fehlgeschlagen',
                                message: `${result.error}\n\nStattdessen Entwurf im Browser öffnen?`,
                                confirmLabel: 'Browser öffnen',
                                cancelLabel: 'Abbrechen',
                              });
                              if (ok) {
                                const url = result.preferGmail === false ? result.links.mailtoUrl : result.links.gmailUrl;
                                const win = window.open(url, '_blank');
                                if (!win) window.location.href = url;
                              }
                            }
                          })}
                          className={actionButtonClass}
                          disabled={Boolean(busyActionKey)}
                          title="Mail an Kunde (Gmail Entwurf)"
                          aria-label={`Beleg ${invoice.invoiceNo} per Mail an Kunden senden`}
                        >
                          <Mail size={14} aria-hidden="true" />
                        </button>

                        {/* Senden */}
                        {onSend && invoice.state === 'entwurf' && (
                          <button
                            onClick={() => void runAction(`send:${invoice.id}`, async () => { await onSend(invoice.id); })}
                            className={actionButtonClass}
                            disabled={Boolean(busyActionKey)}
                            title="Senden"
                            aria-label={`Beleg ${invoice.invoiceNo} senden`}
                          >
                            <Send size={14} aria-hidden="true" />
                          </button>
                        )}

                        {/* Auftrag manuell als angenommen markieren */}
                        {invoice.invoiceType === 'Auftrag' &&
                          onMarkAccepted &&
                          (invoice.state === 'entwurf' || invoice.state === 'gesendet') && (
                            <button
                              onClick={() =>
                                void runAction(`accept:${invoice.id}`, async () => {
                                  await onMarkAccepted(invoice.id);
                                })
                              }
                              className={actionButtonClass}
                              disabled={Boolean(busyActionKey)}
                              title="Auftrag als angenommen markieren"
                              aria-label={`Auftrag ${invoice.invoiceNo} als angenommen markieren`}
                            >
                              <Check size={14} aria-hidden="true" />
                            </button>
                          )}

                        {/* Auftrag manuell als gesendet markieren */}
                        {invoice.invoiceType === 'Auftrag' &&
                          onMarkSent &&
                          invoice.state === 'entwurf' && (
                            <button
                              onClick={() =>
                                void runAction(`markSent:${invoice.id}`, async () => {
                                  await onMarkSent(invoice.id);
                                })
                              }
                              className={actionButtonClass}
                              disabled={Boolean(busyActionKey)}
                              title="Auftrag als gesendet markieren"
                              aria-label={`Auftrag ${invoice.invoiceNo} als gesendet markieren`}
                            >
                              <Send size={14} aria-hidden="true" />
                            </button>
                          )}

                        {/* Konvertieren */}
                        {invoice.invoiceType === 'Angebot' && onConvertToOrder && (
                          <button
                            onClick={() => void runAction(`toOrder:${invoice.id}`, async () => { await onConvertToOrder(invoice.id); })}
                            className={actionButtonClass}
                            disabled={Boolean(busyActionKey)}
                            title="Zu Auftrag konvertieren"
                            aria-label={`Angebot ${invoice.invoiceNo} zu Auftrag konvertieren`}
                          >
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        )}

                        {invoice.invoiceType === 'Auftrag' && onConvertToInvoice && (
                          <button
                            onClick={() => void runAction(`orderToInvoice:${invoice.id}`, async () => { await onConvertToInvoice(invoice.id); })}
                            className={actionButtonClass}
                            disabled={Boolean(busyActionKey)}
                            title="Zu Rechnung konvertieren"
                            aria-label={`Auftrag ${invoice.invoiceNo} zu Rechnung konvertieren`}
                          >
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        )}

                        {/* Löschen */}
                        <button
                          onClick={() => requestDelete(invoice.id, invoice.invoiceNo)}
                          className={actionButtonClass}
                          disabled={Boolean(busyActionKey)}
                          title="Löschen"
                          aria-label={`Beleg ${invoice.invoiceNo} loeschen`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {deleteConfirm && (
        <ConfirmModal
          title="Beleg löschen"
          message={`Beleg ${deleteConfirm.no} wirklich unwiderruflich löschen?`}
          confirmLabel="Endgültig löschen"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};
