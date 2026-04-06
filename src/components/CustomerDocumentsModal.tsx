import { useEffect, useMemo, useState } from 'react';
import type { Customer, CustomerDocument, DocumentCategory } from '../types';
import { deleteCustomerDocument, getCustomerDocumentPayload, getDocumentsByCustomer, updateCustomerDocumentMeta } from '../services/sqliteService';

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

function openBlobPreview(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Vorschau wurde vom Browser blockiert. Bitte Pop-ups erlauben.');
  }
  // Keep URL alive for the opened tab long enough.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function CustomerDocumentsModal(props: { customer: Customer; onClose: () => void }) {
  const [docs, setDocs] = useState<CustomerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDocs(await getDocumentsByCustomer(props.customer.id));
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
  const totalBytes = useMemo(() => docs.reduce((sum, d) => sum + (typeof d.sizeBytes === 'number' ? d.sizeBytes : 0), 0), [docs]);
  const totalKb = Math.round(totalBytes / 1024);

  const categories: DocumentCategory[] = ['Angebot', 'Auftrag', 'Rechnung', 'Ausweis', 'Sonstiges'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">Dokumente</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{title}</div>
            <div className="text-xs text-slate-500 truncate">{props.customer.email}</div>
            {docs.length > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {docs.length} Dokument(e){totalBytes ? ` | ca. ${totalKb} KB` : ''}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => load()}
              disabled={loading}
            >
              Neu laden
            </button>
            <button
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
              onClick={props.onClose}
            >
              Schliessen
            </button>
          </div>
        </div>

        {error && <div className="p-3 text-sm text-red-700 bg-red-50">{error}</div>}

        <div className="p-4">
          {loading ? (
            <div className="text-sm text-slate-600">Lade Dokumente…</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-slate-600">Noch keine Dokumente abgelegt.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{d.filename}</div>
                    <div className="text-xs text-slate-500">
                      {d.mimeType}
                      {typeof d.sizeBytes === 'number' ? ` | ${Math.round(d.sizeBytes / 1024)} KB` : ''}
                      {d.source === 'gmail' ? ' | Gmail' : ''}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] text-slate-500">Kategorie</label>
                      <select
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
                            openBlobPreview(blob);
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
                      Oeffnen
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
                        if (!confirm(`Dokument wirklich loeschen?\n\n${d.filename}`)) return;
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
                      Loeschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
