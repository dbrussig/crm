import { useEffect, useMemo, useState } from 'react';
import type { Customer } from '../types';
import type { GmailThreadSummary } from '../services/googleGmailService';
import { getMessageAttachmentDataWithClientId, getThread, listThreadSummariesByQueryWithClientId } from '../services/googleGmailService';
import { addCustomerDocumentBlob, getMessagesByCustomer } from '../services/sqliteService';
import { loadJson, saveJson } from '../services/_storage';

const CACHE_VERSION = 1 as const;

function parseFromHeader(fromHeader?: string): { name?: string; email?: string } {
  if (!fromHeader) return {};
  const m = /(.*?)(?:<([^>]+)>)?$/.exec(fromHeader.trim());
  const nameRaw = (m?.[1] || '').trim().replace(/^"|"$/g, '');
  const emailRaw = (m?.[2] || '').trim();
  const email = /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(emailRaw || fromHeader)?.[0];
  const name = nameRaw && nameRaw !== email ? nameRaw : undefined;
  return { name, email: email || undefined };
}

function isUsEmail(email?: string) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@mietpark-saar-pfalz.com') || e.endsWith('@mietpark-saar-pfalz.de');
}

type CacheV1 = {
  version: typeof CACHE_VERSION;
  savedAt: number;
  threads: GmailThreadSummary[];
  nextPageToken?: string;
  selectedThreadId?: string | null;
  selectedThread?: any | null;
  threadDetailsById: Record<string, any>;
};

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function sanitizeThreadForCache(thread: any) {
  if (!thread || typeof thread !== 'object') return thread;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const tail = messages.slice(Math.max(0, messages.length - 12)).map((m: any) => ({
    id: m?.id,
    from: m?.from,
    date: m?.date,
    body: typeof m?.body === 'string' ? truncateText(m.body, 25_000) : '',
    attachments: Array.isArray(m?.attachments) ? m.attachments : [],
  }));
  return {
    id: thread.id,
    subject: thread.subject,
    from: thread.from,
    date: thread.date,
    messages: tail,
  };
}

function toTs(thread: GmailThreadSummary): number {
  const internal = (thread as any).lastInternalDate;
  if (typeof internal === 'number' && Number.isFinite(internal)) return internal;
  const raw = (thread as any).lastDate || thread.date;
  const parsed = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CustomerEmailHistoryModal(props: {
  customer: Customer;
  clientId: string;
  onClose: () => void;
  onUpdateCustomer?: (id: string, patch: Partial<Customer>) => void;
}) {
  const email = props.customer.email?.trim();
  const cacheKey = useMemo(() => `mietpark_crm_customer_email_cache_v1:${email?.toLowerCase() || props.customer.id}`, [email, props.customer.id]);

  const [threads, setThreads] = useState<GmailThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [threadDetailsById, setThreadDetailsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crmMessages, setCrmMessages] = useState<any[]>([]);
  const [importBusyKey, setImportBusyKey] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const canUse = Boolean(props.clientId?.trim() && email);

  const customerLabel = useMemo(() => {
    const full = `${(props.customer.firstName || '').trim()} ${(props.customer.lastName || '').trim()}`.trim();
    return full || props.customer.email || 'Kunde';
  }, [props.customer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // CRM messages are local, independent from Gmail availability.
      const msgs = await getMessagesByCustomer(props.customer.id);
      if (cancelled) return;
      setCrmMessages(msgs || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.customer.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadJson<CacheV1 | null>(cacheKey, null);
      if (cancelled) return;
      if (cached?.version === CACHE_VERSION) {
        setThreads(cached.threads || []);
        setNextPageToken(cached.nextPageToken);
        setSelectedThreadId(cached.selectedThreadId ?? null);
        setSelectedThread(cached.selectedThread ?? null);
        setThreadDetailsById(cached.threadDetailsById || {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    const cache: CacheV1 = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      threads: threads.slice(0, 200),
      nextPageToken,
      selectedThreadId,
      selectedThread: selectedThread ? sanitizeThreadForCache(selectedThread) : selectedThread,
      threadDetailsById,
    };
    void saveJson(cacheKey, cache);
  }, [cacheKey, threads, nextPageToken, selectedThreadId, selectedThread, threadDetailsById]);

  const threadsSorted = useMemo(() => {
    const arr = [...threads];
    arr.sort((a, b) => toTs(b) - toTs(a));
    return arr;
  }, [threads]);

  const sortedConversationMessages = useMemo(() => {
    const msgs = Array.isArray(selectedThread?.messages) ? [...selectedThread.messages] : [];
    const toMs = (d: any) => {
      if (!d) return 0;
      if (typeof d === 'number') return d;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    };
    msgs.sort((a: any, b: any) => toMs(b?.date) - toMs(a?.date));
    return msgs;
  }, [selectedThread]);

  const attachments = useMemo(() => {
    const msgs = Array.isArray(selectedThread?.messages) ? selectedThread.messages : [];
    const out: Array<{ key: string; messageId: string; attachmentId: string; filename?: string; mimeType?: string; sizeBytes?: number }> = [];
    for (const m of msgs) {
      const arr = Array.isArray(m?.attachments) ? m.attachments : [];
      for (const a of arr) {
        if (!a?.messageId || !a?.attachmentId) continue;
        out.push({
          key: `${a.messageId}:${a.attachmentId}`,
          messageId: a.messageId,
          attachmentId: a.attachmentId,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        });
      }
    }
    return out;
  }, [selectedThread]);

  const importAsRoofRailPhoto = async (a: { key: string; messageId: string; attachmentId: string; filename?: string; mimeType?: string }) => {
    if (!canUse) return;
    setImportInfo(null);
    setImportBusyKey(a.key);
    try {
      const { dataBase64 } = await getMessageAttachmentDataWithClientId({
        clientId: props.clientId,
        messageId: a.messageId,
        attachmentId: a.attachmentId,
      });
      const mime = (a.mimeType || 'image/jpeg').toLowerCase();
      const dataUrl = `data:${mime};base64,${dataBase64}`;

      // Reuse the same sizing strategy as CustomerForm (keep it reasonable for local storage).
      const img = new Image();
      img.decoding = 'async';
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, 1600 / Math.max(w || 1, h || 1));
      const tw = Math.max(1, Math.round((w || 1) * scale));
      const th = Math.max(1, Math.round((h || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas nicht verfuegbar');
      ctx.drawImage(img, 0, 0, tw, th);
      const normalized = canvas.toDataURL('image/jpeg', 0.85);

      const current = Array.isArray((props.customer as any).roofRailPhotoDataUrls)
        ? (props.customer as any).roofRailPhotoDataUrls.filter(Boolean)
        : (props.customer as any).roofRailPhotoDataUrl ? [String((props.customer as any).roofRailPhotoDataUrl)] : [];
      const next = [...current, normalized].slice(0, 12);
      props.onUpdateCustomer?.(props.customer.id, {
        roofRailPhotoDataUrls: next.length ? next : undefined,
        roofRailPhotoDataUrl: next[0] || undefined,
      } as any);
      setImportInfo('Reling-Foto wurde im Kundenstamm gespeichert (hinzugefuegt).');
    } catch (e: any) {
      setImportInfo(`Import fehlgeschlagen: ${e?.message || String(e)}`);
    } finally {
      setImportBusyKey(null);
    }
  };

  const importAsPdfDocument = async (a: { key: string; messageId: string; attachmentId: string; filename?: string; mimeType?: string; sizeBytes?: number }) => {
    if (!canUse) return;
    setImportInfo(null);
    setImportBusyKey(a.key);
    try {
      const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
      const knownSize = typeof a.sizeBytes === 'number' ? a.sizeBytes : undefined;
      if (knownSize !== undefined && knownSize > MAX_PDF_BYTES) {
        throw new Error(`PDF ist zu gross (${Math.round(knownSize / 1024 / 1024)} MB). Limit: 10 MB.`);
      }

      const { dataBase64, sizeBytes } = await getMessageAttachmentDataWithClientId({
        clientId: props.clientId,
        messageId: a.messageId,
        attachmentId: a.attachmentId,
      });

      const effectiveSize = (a.sizeBytes || sizeBytes);
      if (typeof effectiveSize === 'number' && effectiveSize > MAX_PDF_BYTES) {
        throw new Error(`PDF ist zu gross (${Math.round(effectiveSize / 1024 / 1024)} MB). Limit: 10 MB.`);
      }

      const now = Date.now();
      const id =
        (globalThis as any).crypto?.randomUUID?.() ||
        `doc_${now}_${Math.random().toString(16).slice(2)}`;
      const filename = a.filename?.trim() || `dokument_${now}.pdf`;

      // Convert base64 -> Blob and store as Blob in IndexedDB (no base64 storage overhead).
      const bin = atob(dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: a.mimeType || 'application/pdf' });

      await addCustomerDocumentBlob(
        {
          id,
          customerId: props.customer.id,
          filename,
          mimeType: a.mimeType || 'application/pdf',
          sizeBytes: a.sizeBytes || sizeBytes,
          category: 'Sonstiges',
          source: 'gmail',
          gmailThreadId: selectedThreadId || undefined,
          gmailMessageId: a.messageId,
          gmailAttachmentId: a.attachmentId,
          createdAt: now,
        },
        blob
      );

      setImportInfo('PDF wurde als Dokument beim Kunden abgelegt.');
    } catch (e: any) {
      setImportInfo(`Import fehlgeschlagen: ${e?.message || String(e)}`);
    } finally {
      setImportBusyKey(null);
    }
  };

  async function loadThreads(more = false) {
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      const q = `from:${email} OR to:${email}`;
      const resp = await listThreadSummariesByQueryWithClientId({
        clientId: props.clientId,
        q,
        maxResults: 20,
        pageToken: more ? nextPageToken : undefined,
      });
      setThreads((prev) => {
        const next = more ? [...prev, ...resp.threads] : resp.threads;
        const seen = new Set<string>();
        return next.filter((t) => {
          if (!t?.id) return false;
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
      });
      setNextPageToken(resp.nextPageToken);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openThread(threadId: string) {
    if (!canUse) return;
    setSelectedThreadId(threadId);
    const cached = threadDetailsById[threadId];
    if (cached) setSelectedThread(cached);
    else setSelectedThread(null);

    setLoading(true);
    setError(null);
    try {
      const t = await getThread({ clientId: props.clientId, threadId });
      setSelectedThread(t);
      setThreadDetailsById((prev) => ({ ...prev, [threadId]: sanitizeThreadForCache(t) }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">E-Mail Historie</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{customerLabel}</div>
            <div className="text-xs text-slate-500 truncate">{email}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
              onClick={() => loadThreads(false)}
              disabled={!canUse || loading}
            >
              Threads laden
            </button>
            <button className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50" onClick={props.onClose}>
              Schließen
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Threads</div>
              <div className="text-xs text-slate-500">{threads.length}</div>
            </div>

            {(!props.clientId?.trim() || !email) && (
              <div className="p-3 text-sm text-red-700 bg-red-50">
                Gmail kann nicht geladen werden. Client-ID oder Kunden-E-Mail fehlt.
              </div>
            )}

            {error && <div className="p-3 text-sm text-red-700 bg-red-50">{error}</div>}

            <div className="max-h-[55vh] overflow-auto p-2 space-y-2">
              {threadsSorted.map((t) => {
                const lastDate = (t as any).lastDate || t.date;
                const dateStr = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
                const timeStr = lastDate ? new Date(lastDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                const last = parseFromHeader((t as any).lastFrom);
                const needsReply = last.email ? !isUsEmail(last.email) : false;
                return (
                  <button
                    key={t.id}
                    className={[
                      'w-full text-left p-3 rounded-lg border transition',
                      selectedThreadId === t.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => openThread(t.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                          {(t as any).isUnread ? <span className="w-2 h-2 rounded-full bg-blue-600" title="Ungelesen" /> : null}
                          {needsReply ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-800" title="Kunde zuletzt">
                              Antwort
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-50 border-blue-200 text-blue-700" title="Wir zuletzt">
                              Wir
                            </span>
                          )}
                          <span className="truncate">{t.subject || '(kein Betreff)'}</span>
                        </div>
                        <div className="text-xs text-slate-600 truncate">{t.snippet}</div>
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0 text-right">
                        <div>{dateStr}</div>
                        <div>{timeStr}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {nextPageToken && (
                <button
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => loadThreads(true)}
                  disabled={loading}
                >
                  Mehr laden
                </button>
              )}
              {!threadsSorted.length && (
                <div className="p-4 text-sm text-slate-600">
                  Noch keine Threads geladen. Klicke oben auf <strong>Threads laden</strong>.
                </div>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Konversation</div>
              <div className="text-xs text-slate-500">
                {selectedThreadId ? selectedThreadId : '—'}
              </div>
            </div>

            {!selectedThread && (
              <div className="p-4 text-sm text-slate-600">Wähle links einen Thread.</div>
            )}

            {selectedThread && (
              <div className="p-3 space-y-3">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                  <div><strong>Betreff:</strong> {selectedThread.subject || '-'}</div>
                  <div><strong>Von:</strong> {selectedThread.from || '-'}</div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">Anhaenge</div>
                    <div className="text-xs text-slate-500">{attachments.length}</div>
                  </div>
                  {importInfo && (
                    <div className="mt-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2">
                      {importInfo}
                    </div>
                  )}
                  {!attachments.length ? (
                    <div className="mt-2 text-sm text-slate-600">Keine Anhaenge im Thread gefunden.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {attachments.map((a) => {
                        const mt = (a.mimeType || '').toLowerCase();
                        const name = a.filename || '(ohne Dateiname)';
                        const isPdf = mt === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
                        const isImage = mt.startsWith('image/');
                        return (
                          <div key={a.key} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">{name}</div>
                              <div className="text-xs text-slate-500">
                                {a.mimeType || 'unknown'}
                                {typeof a.sizeBytes === 'number' ? ` | ${Math.round(a.sizeBytes / 1024)} KB` : ''}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {isPdf && (
                                <button
                                  className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                                  disabled={importBusyKey === a.key}
                                  onClick={() => importAsPdfDocument(a)}
                                  title="PDF als Dokument beim Kunden speichern"
                                >
                                  Als Dokument
                                </button>
                              )}
                              {isImage && (
                                <button
                                  className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                                  disabled={importBusyKey === a.key}
                                  onClick={() => importAsRoofRailPhoto(a)}
                                  title="Bild als Reling-Foto im Kundenstamm speichern (ersetzt ggf. vorhandenes Foto)"
                                >
                                  Als Reling-Foto
                                </button>
                              )}
                              {!isPdf && !isImage && (
                                <span className="text-xs text-slate-400">Nicht unterstuetzt</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="max-h-[40vh] overflow-auto rounded-lg border border-slate-200 p-3 space-y-3">
                  {sortedConversationMessages.map((m: any, idx: number) => {
                    const parsed = parseFromHeader(m.from);
                    const label = parsed.name || parsed.email || 'Unbekannt';
                    const isUs = isUsEmail(parsed.email);
                    const body = String(m.body || '');
                    const preview = body.length > 600 ? body.slice(0, 600).trimEnd() + '…' : body;
                    return (
                      <div key={idx} className={isUs ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                          className={[
                            'max-w-[92%] rounded-lg px-3 py-2 border text-sm',
                            isUs ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200',
                          ].join(' ')}
                        >
                          <div className="text-[11px] text-slate-500 flex items-center justify-between gap-3">
                            <span className="font-medium">{label}</span>
                            <span className="shrink-0">{m.date ? new Date(m.date).toLocaleString('de-DE') : ''}</span>
                          </div>
                          <div className="mt-2 text-slate-800 whitespace-pre-wrap text-xs">{preview}</div>
                          {body.length > 600 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-slate-600 select-none">
                                Ganze Nachricht anzeigen
                              </summary>
                              <div className="mt-2 text-slate-800 whitespace-pre-wrap text-xs">{body}</div>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedThreadId && (
                  <a
                    className="text-sm text-blue-700 underline"
                    href={`https://mail.google.com/mail/u/0/#all/${selectedThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    In Gmail öffnen
                  </a>
                )}
              </div>
            )}

            <div className="border-t border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-800">CRM Notizen/Importe</div>
              <div className="text-xs text-slate-500">Lokal gespeicherte Nachrichten (aus Import/Nachrichtenbox).</div>
              <div className="mt-2 max-h-[22vh] overflow-auto space-y-2">
                {crmMessages.map((m: any) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-[11px] text-slate-500 flex items-center justify-between gap-3">
                      <span className="font-medium">{m.channel || '—'}</span>
                      <span className="shrink-0">{new Date(m.receivedAt || m.createdAt || Date.now()).toLocaleString('de-DE')}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-800 whitespace-pre-wrap">
                      {String(m.message || '').slice(0, 800)}
                      {String(m.message || '').length > 800 ? '…' : ''}
                    </div>
                  </div>
                ))}
                {!crmMessages.length && (
                  <div className="text-sm text-slate-600">Noch keine lokalen Nachrichten gespeichert.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
