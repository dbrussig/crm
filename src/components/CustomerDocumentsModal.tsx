import { useEffect, useRef, useState } from 'react';
import type { Customer, CustomerDocument, DocumentCategory, Invoice } from '../types';
import {
  deleteCustomerDocument,
  getCustomerDocumentPayload,
  getDocumentsByCustomer,
  updateCustomerDocumentMeta,
  addCustomerDocumentBlob,
  getAllInvoices,
} from '../services/sqliteService';
import ConfirmModal from './ConfirmModal';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dokument konnte nicht für die Vorschau gelesen werden.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATE_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  bezahlt: 'Bezahlt',
  storniert: 'Storniert',
  archiviert: 'Archiviert',
};

export default function CustomerDocumentsModal(props: {
  customer: Customer;
  onClose: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}) {
  const [docs, setDocs] = useState<CustomerDocument[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; mime: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [d, allInvoices] = await Promise.all([
        getDocumentsByCustomer(props.customer.id),
        getAllInvoices(),
      ]);
      setDocs(d);
      // Filter Angebote + Auftraege for this customer
      setInvoices(
        allInvoices.filter(
          (inv) =>
            inv.companyId === props.customer.id &&
            (inv.invoiceType === 'Angebot' || inv.invoiceType === 'Auftrag')
        )
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [props.customer.id]);

  const title = `${props.customer.firstName} ${props.customer.lastName}`.trim() || props.customer.email || 'Kunde';

  const categories: DocumentCategory[] = ['Angebot', 'Auftrag', 'Rechnung', 'Ausweis', 'Sonstiges'];

  async function handleUpload() {
    const input = fileInputRef.current;
    if (!input || !input.files || input.files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(input.files)) {
        const doc: CustomerDocument = {
          id: crypto.randomUUID(),
          customerId: props.customer.id,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          category: 'Sonstiges',
          source: 'manual',
          createdAt: Date.now(),
        };
        await addCustomerDocumentBlob(doc, file);
      }
      // Reset file input
      input.value = '';
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">Dokumente</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{title}</div>
            <div className="text-xs text-slate-500 truncate">{props.customer.email}</div>
            {docs.length > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {docs.length} Dokument(e)
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={() => void handleUpload()}
            />
            <button
              className="px-3 py-2 rounded-md border border-green-300 bg-green-50 text-green-800 text-sm hover:bg-green-100 disabled:opacity-60"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Lade hoch...' : 'Hochladen'}
            </button>
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void load()}
              disabled={loading}
            >
              Neu laden
            </button>
            <button
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
              onClick={() => {
                props.onClose();
              }}
            >
              Schließen
            </button>
          </div>
        </div>

        {error && <div className="p-3 text-sm text-red-700 bg-red-50 shrink-0">{error}</div>}

        {/* Scrollable content */}
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-sm text-slate-600">Lade Dokumente…</div>
          ) : (
            <>
              {/* ---- Angebote & Aufträge section ---- */}
              {invoices.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Angebote & Aufträge</h3>
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className={`rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3 ${props.onOpenInvoice ? 'cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-colors' : ''}`}
                        onClick={() => props.onOpenInvoice?.(inv.id)}
                        role={props.onOpenInvoice ? 'button' : undefined}
                        tabIndex={props.onOpenInvoice ? 0 : undefined}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">
                            {inv.invoiceNo}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {inv.invoiceType}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDate(inv.invoiceDate)}
                            {' – '}
                            {STATE_LABELS[inv.state] || inv.state}
                            {inv.buyerName ? ` | ${inv.buyerName}` : ''}
                          </div>
                        </div>
                        {props.onOpenInvoice && (
                          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Dokumente section ---- */}
              {docs.length === 0 && invoices.length === 0 ? (
                <div className="text-sm text-slate-600">Noch keine Dokumente abgelegt.</div>
              ) : docs.length === 0 && invoices.length > 0 ? (
                <div className="text-sm text-slate-600">Keine Dokumente abgelegt.</div>
              ) : (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Dokumente</h3>
                  <div className="space-y-2">
                    {docs.map((d) => (
                      <div key={d.id} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{d.filename}</div>
                          <div className="text-xs text-slate-500">
                            {d.source === 'gmail' ? 'Gmail' : 'Hochgeladen'}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-[11px] text-slate-500" htmlFor={`doc-category-${d.id}`}>Kategorie</label>
                            <select
                              id={`doc-category-${d.id}`}
                              className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white"
                              value={(d.category as any) || 'Sonstiges'}
                              disabled={busyId === d.id}
                              onChange={async (e) => {
                                const next = e.target.value as DocumentCategory;
                                setBusyId(d.id);
                                setError(null);
                                try {
                                  await updateCustomerDocumentMeta(d.id, { category: next });
                                  await load();
                                } catch (err: any) {
                                  setError(err?.message || String(err));
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            className="px-3 py-2 rounded-md border border-blue-200 text-blue-700 text-sm hover:bg-blue-50 disabled:opacity-60"
                            disabled={busyId === d.id}
                            onClick={async () => {
                              setBusyId(d.id);
                              setError(null);
                              try {
                                const payload = await getCustomerDocumentPayload(d.id);
                                if (!payload) throw new Error('Payload nicht gefunden');

                                const mime = d.mimeType || 'application/octet-stream';
                                const blob =
                                  payload instanceof Blob
                                    ? payload
                                    : typeof payload === 'string'
                                    ? base64ToBlob(payload, mime)
                                    : null;
                                if (!blob) throw new Error('Unbekanntes Payload-Format');

                                const isPreviewable =
                                  mime.startsWith('application/pdf') ||
                                  mime.startsWith('image/');
                                if (isPreviewable) {
                                  const src = await blobToDataUrl(blob);
                                  setPreview({ src, mime, filename: d.filename || 'Dokument' });
                                } else {
                                  downloadBlob(blob, d.filename || 'dokument.bin');
                                }
                              } catch (e: any) {
                                setError(e?.message || String(e));
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Öffnen
                          </button>
                          <button
                            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                            disabled={busyId === d.id}
                            onClick={async () => {
                              setBusyId(d.id);
                              setError(null);
                              try {
                                const payload = await getCustomerDocumentPayload(d.id);
                                if (!payload) throw new Error('Payload nicht gefunden');
                                if (payload instanceof Blob) {
                                  downloadBlob(payload, d.filename || 'dokument.pdf');
                                } else if (typeof payload === 'string') {
                                  const blob = base64ToBlob(payload, d.mimeType || 'application/octet-stream');
                                  downloadBlob(blob, d.filename || 'dokument.pdf');
                                } else {
                                  throw new Error('Unbekanntes Payload-Format');
                                }
                              } catch (e: any) {
                                setError(e?.message || String(e));
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Download
                          </button>
                          <button
                            className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                            disabled={busyId === d.id}
                            onClick={async () => {
                              const ok = await requestConfirm({
                                title: 'Löschen bestätigen',
                                message: `Dokument wirklich loeschen?\n\n${d.filename}`,
                                confirmLabel: 'Löschen',
                                cancelLabel: 'Abbrechen',
                                danger: true,
                              });
                              if (!ok) return;
                              setBusyId(d.id);
                              try {
                                await deleteCustomerDocument(d.id);
                                await load();
                              } catch (e: any) {
                                setError(e?.message || String(e));
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
              <div className="text-sm font-medium text-slate-800 truncate pr-3">{preview.filename}</div>
              <button
                className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
                onClick={() => setPreview(null)}
              >
                Schließen
              </button>
            </div>
            <div className="flex-1 bg-slate-100">
              {preview.mime.startsWith('image/') ? (
                <div className="w-full h-full overflow-auto p-4 flex items-start justify-center">
                  <img src={preview.src} alt={preview.filename} className="max-w-full h-auto shadow-md rounded" />
                </div>
              ) : (
                <iframe title={preview.filename} src={preview.src} className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
