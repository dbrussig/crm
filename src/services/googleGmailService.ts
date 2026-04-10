import type { GmailAttachmentSummary, GmailThread, GmailThreadFormatted } from '../types';
import { googleFetchJson } from './googleAuthService';
import { requireScope, getValidAccessToken } from './googleOAuthService';

const DEFAULT_PROCESSED_LABEL_NAME = 'Mietpark CRM/Verarbeitet';

function isScopeInsufficientError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return (
    msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    msg.includes('insufficientPermissions') ||
    msg.includes('Request had insufficient authentication scopes') ||
    msg.includes('PERMISSION_DENIED')
  );
}

async function getGmailToken(clientId: string, opts?: { force?: boolean }) {
  if (opts?.force) {
    return requireScope(clientId, 'gmail');
  }
  return getValidAccessToken(clientId);
}

function getDefaultClientId(): string {
  return (
    localStorage.getItem('mietpark_google_oauth_client_id') ||
    (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    ''
  );
}

type ListThreadsResponse = {
  threads?: Array<{ id: string; snippet?: string }>;
  nextPageToken?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  partId?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  snippet?: string;
  payload?: GmailMessagePart & { headers?: Array<{ name: string; value: string }> };
  internalDate?: string;
  labelIds?: string[];
};

type ThreadResponse = {
  id: string;
  snippet?: string;
  messages?: GmailMessage[];
};

export type GmailThreadSummary = GmailThread & {
  subject?: string;
  from?: string;
  date?: string;
  lastFrom?: string;
  lastDate?: string;
  messageCount?: number;
  isUnread?: boolean;
  lastInternalDate?: number;
};

type Label = {
  id: string;
  name: string;
  type?: 'system' | 'user';
};

type ListLabelsResponse = {
  labels?: Label[];
};

function b64UrlDecode(data: string): string {
  // Gmail uses base64url (RFC 4648) without padding sometimes.
  const pad = '='.repeat((4 - (data.length % 4)) % 4);
  const base64 = (data + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base64);
  // Convert binary string to UTF-8
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function findHeader(msg: GmailMessage, name: string): string | undefined {
  const headers = msg.payload?.headers || [];
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html: string): string {
  try {
    // DOMParser approach avoids leaking <style> content into the extracted text.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head,noscript').forEach((n) => n.remove());
    return normalizeText(doc.body?.textContent || '');
  } catch {
    // Fallback: remove style/script blocks then strip tags.
    const withoutStyle = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ');
    return normalizeText(withoutStyle.replace(/<[^>]+>/g, ' '));
  }
}

function extractPlainText(part?: GmailMessagePart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return normalizeText(b64UrlDecode(part.body.data));
  if (part.mimeType === 'text/html' && part.body?.data) {
    const html = b64UrlDecode(part.body.data);
    return htmlToText(html);
  }
  const parts = part.parts || [];
  for (const p of parts) {
    const t = extractPlainText(p);
    if (t.trim()) return t;
  }
  return '';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  const worker = async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  const pool = new Array(poolSize).fill(0).map(() => worker());
  await Promise.all(pool);
  return results;
}

function collectAttachments(messageId: string, part?: GmailMessagePart): GmailAttachmentSummary[] {
  if (!part) return [];
  const out: GmailAttachmentSummary[] = [];
  const walk = (p?: GmailMessagePart) => {
    if (!p) return;
    const attachmentId = p.body?.attachmentId;
    if (attachmentId) {
      out.push({
        messageId,
        attachmentId,
        filename: p.filename || undefined,
        mimeType: p.mimeType || undefined,
        sizeBytes: p.body?.size,
      });
    }
    (p.parts || []).forEach(walk);
  };
  walk(part);
  return out;
}

export async function isGmailAuthenticated(_clientId?: string): Promise<boolean> {
  try {
    const clientId = (_clientId || getDefaultClientId()).trim();
    if (!clientId) return false;
    const token = await getValidAccessToken(clientId);
    return Boolean(token);
  } catch {
    return false;
  }
}

export async function listInboxThreads(opts: {
  clientId: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ threads: GmailThread[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  params.set('labelIds', 'INBOX');
  params.set('maxResults', String(opts.maxResults ?? 20));
  // Basic noise reduction: ignore own domain (adjust later if needed).
  params.set('q', '-from:mietpark-saar-pfalz.com');
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`;
  try {
    const token = await getGmailToken(opts.clientId);
    const resp = await googleFetchJson<ListThreadsResponse>({ url, token });
    return {
      threads: (resp.threads || []).map((t) => ({ id: t.id, snippet: t.snippet || '' })),
      nextPageToken: resp.nextPageToken,
    };
  } catch (e) {
    // If the user previously consented to basic scopes only, GIS can return a token without gmail scopes.
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    const resp = await googleFetchJson<ListThreadsResponse>({ url, token });
    return {
      threads: (resp.threads || []).map((t) => ({ id: t.id, snippet: t.snippet || '' })),
      nextPageToken: resp.nextPageToken,
    };
  }
}

export async function getThreadMetadata(opts: { clientId: string; threadId: string }): Promise<GmailThreadSummary> {
  const params = new URLSearchParams();
  params.set('format', 'metadata');
  params.append('metadataHeaders', 'Subject');
  params.append('metadataHeaders', 'From');
  params.append('metadataHeaders', 'Date');
  // Keep response small but include labelIds/internalDate for smarter UI (unread + robust sorting).
  params.set('fields', 'id,snippet,messages(id,internalDate,labelIds,payload(headers(name,value)))');

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(opts.threadId)}?${params.toString()}`;
  let resp: ThreadResponse;
  try {
    const token = await getGmailToken(opts.clientId);
    resp = await googleFetchJson<ThreadResponse>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    resp = await googleFetchJson<ThreadResponse>({ url, token });
  }

  const first = resp.messages?.[0];
  const last = resp.messages?.[Math.max(0, (resp.messages?.length || 1) - 1)];
  const isUnread = (resp.messages || []).some((m) => Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD'));
  const lastInternalDate = last?.internalDate ? Number(last.internalDate) : undefined;
  return {
    id: resp.id,
    snippet: resp.snippet || '',
    subject: first ? findHeader(first, 'Subject') : undefined,
    from: first ? findHeader(first, 'From') : undefined,
    date: first ? findHeader(first, 'Date') : undefined,
    lastFrom: last ? findHeader(last, 'From') : undefined,
    lastDate: last ? findHeader(last, 'Date') : undefined,
    messageCount: resp.messages?.length || 0,
    isUnread,
    lastInternalDate: Number.isFinite(lastInternalDate as any) ? lastInternalDate : undefined,
  };
}

export async function listInboxThreadSummaries(opts: {
  clientId: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ threads: GmailThreadSummary[]; nextPageToken?: string }> {
  const base = await listInboxThreads(opts);
  const metas = await mapWithConcurrency(base.threads, 6, async (t) => {
    try {
      const meta = await getThreadMetadata({ clientId: opts.clientId, threadId: t.id });
      return { ...t, ...meta, snippet: t.snippet || meta.snippet || '' };
    } catch {
      return { ...t };
    }
  });
  return { threads: metas, nextPageToken: base.nextPageToken };
}

export async function listThreadsByQueryWithClientId(opts: {
  clientId: string;
  q: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}): Promise<{ threads: GmailThread[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  params.set('maxResults', String(opts.maxResults ?? 20));
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  (opts.labelIds || []).filter(Boolean).forEach((l) => params.append('labelIds', l));

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`;
  let resp: ListThreadsResponse;
  try {
    const token = await getGmailToken(opts.clientId);
    resp = await googleFetchJson<ListThreadsResponse>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    resp = await googleFetchJson<ListThreadsResponse>({ url, token });
  }
  return {
    threads: (resp.threads || []).map((t) => ({ id: t.id, snippet: t.snippet || '' })),
    nextPageToken: resp.nextPageToken,
  };
}

export async function listThreadSummariesByQueryWithClientId(opts: {
  clientId: string;
  q: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}): Promise<{ threads: GmailThreadSummary[]; nextPageToken?: string }> {
  const base = await listThreadsByQueryWithClientId(opts);
  const metas = await mapWithConcurrency(base.threads, 6, async (t) => {
    try {
      const meta = await getThreadMetadata({ clientId: opts.clientId, threadId: t.id });
      return { ...t, ...meta, snippet: t.snippet || meta.snippet || '' };
    } catch {
      return { ...t };
    }
  });
  return { threads: metas, nextPageToken: base.nextPageToken };
}

export async function getThread(opts: { clientId: string; threadId: string }): Promise<GmailThreadFormatted> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(opts.threadId)}?format=full`;
  let resp: ThreadResponse;
  try {
    const token = await getGmailToken(opts.clientId);
    resp = await googleFetchJson<ThreadResponse>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    resp = await googleFetchJson<ThreadResponse>({ url, token });
  }

  const first = resp.messages?.[0];
  const subject = first ? findHeader(first, 'Subject') : undefined;
  const from = first ? findHeader(first, 'From') : undefined;
  const date = first ? findHeader(first, 'Date') : undefined;

  const messages = (resp.messages || []).map((m) => ({
    id: m.id,
    from: findHeader(m, 'From'),
    date: findHeader(m, 'Date'),
    body: extractPlainText(m.payload),
    attachments: collectAttachments(m.id, m.payload),
  }));

  return {
    id: resp.id,
    subject,
    from,
    date,
    messages,
  };
}

function base64UrlToBase64(data: string): string {
  const pad = '='.repeat((4 - (data.length % 4)) % 4);
  return (data + pad).replace(/-/g, '+').replace(/_/g, '/');
}

export async function getMessageAttachmentDataWithClientId(opts: {
  clientId: string;
  messageId: string;
  attachmentId: string;
}): Promise<{ dataBase64: string; sizeBytes?: number }> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(opts.messageId)}/attachments/${encodeURIComponent(opts.attachmentId)}`;
  type Resp = { data?: string; size?: number };
  let resp: Resp;
  try {
    const token = await getGmailToken(opts.clientId);
    resp = await googleFetchJson<Resp>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    resp = await googleFetchJson<Resp>({ url, token });
  }
  const base64url = resp?.data || '';
  if (!base64url) throw new Error('Attachment hat keine Daten (leer)');
  return { dataBase64: base64UrlToBase64(base64url), sizeBytes: resp?.size };
}

export function formatGmailThread(thread: GmailThread): GmailThreadFormatted {
  // Legacy adapter; prefer getThread().
  return { id: thread.id, subject: undefined, from: undefined, date: undefined, messages: [] };
}

export async function searchByEmailWithClientId(clientId: string, email: string, limit = 10): Promise<GmailThread[]> {
  const params = new URLSearchParams();
  params.set('labelIds', 'INBOX');
  params.set('maxResults', String(limit));
  params.set('q', `from:${email}`);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`;
  let resp: ListThreadsResponse;
  try {
    const token = await getGmailToken(clientId);
    resp = await googleFetchJson<ListThreadsResponse>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(clientId, { force: true });
    resp = await googleFetchJson<ListThreadsResponse>({ url, token });
  }
  return (resp.threads || []).map((t) => ({ id: t.id, snippet: t.snippet || '' }));
}

// Legacy signature used by components: searchByEmail(email, limit)
export async function searchByEmail(email: string, limit = 10): Promise<GmailThread[]> {
  const clientId = getDefaultClientId();
  if (!clientId) return [];
  return searchByEmailWithClientId(clientId, email, limit);
}

export async function listLabelsWithClientId(opts: { clientId: string }): Promise<Label[]> {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/labels';
  let resp: ListLabelsResponse;
  try {
    const token = await getGmailToken(opts.clientId);
    resp = await googleFetchJson<ListLabelsResponse>({ url, token });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    resp = await googleFetchJson<ListLabelsResponse>({ url, token });
  }
  return resp.labels || [];
}

export async function getOrCreateLabelIdWithClientId(opts: {
  clientId: string;
  labelName: string;
}): Promise<string> {
  const labelName = opts.labelName.trim();
  if (!labelName) throw new Error('Label name is empty');

  const existing = await listLabelsWithClientId({ clientId: opts.clientId });
  const found = existing.find((l) => l.name === labelName);
  if (found?.id) return found.id;

  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/labels';
  let created: Label;
  try {
    const token = await getGmailToken(opts.clientId);
    created = await googleFetchJson<Label>({
      url,
      method: 'POST',
      token,
      body: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        type: 'user',
      },
    });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    created = await googleFetchJson<Label>({
      url,
      method: 'POST',
      token,
      body: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        type: 'user',
      },
    });
  }
  if (!created?.id) throw new Error('Failed to create label (no id returned)');
  return created.id;
}

export async function modifyThreadLabelsWithClientId(opts: {
  clientId: string;
  threadId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}): Promise<void> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(opts.threadId)}/modify`;
  const body = {
    addLabelIds: (opts.addLabelIds || []).filter(Boolean),
    removeLabelIds: (opts.removeLabelIds || []).filter(Boolean),
  };
  try {
    const token = await getGmailToken(opts.clientId);
    await googleFetchJson<any>({ url, method: 'POST', token, body });
  } catch (e) {
    if (!isScopeInsufficientError(e)) throw e;
    const token = await getGmailToken(opts.clientId, { force: true });
    await googleFetchJson<any>({ url, method: 'POST', token, body });
  }
}

export async function markThreadProcessedWithClientId(opts: {
  clientId: string;
  threadId: string;
  labelName?: string;
  archive?: boolean;
}): Promise<void> {
  const labelId = await getOrCreateLabelIdWithClientId({
    clientId: opts.clientId,
    labelName: opts.labelName || DEFAULT_PROCESSED_LABEL_NAME,
  });
  await modifyThreadLabelsWithClientId({
    clientId: opts.clientId,
    threadId: opts.threadId,
    addLabelIds: [labelId],
    removeLabelIds: opts.archive ? ['INBOX'] : [],
  });
}
