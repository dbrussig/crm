import type { Customer, CustomerDocument, Invoice, InvoiceItem, Message, Payment, RentalRequest, Resource } from '../types';
import { deleteKey, loadJson, saveJson } from './_storage';
import JSZip from 'jszip';
import {
  addInvoice,
  addPayment,
  addRentalRequest,
  addResource,
  createCustomer,
  createMessage,
  deleteAllCustomerDocuments,
  getAllCustomerDocuments,
  getAllCustomers,
  getAllInvoices,
  getAllMessages,
  getAllPayments,
  getAllRentalRequests,
  getAllResources,
  getCustomerDocumentPayload,
  getInvoiceItems,
  setCustomerDocumentPayload,
  updateCustomer,
  updateInvoice,
  updateRentalRequest,
  updateResource,
  upsertCustomerDocumentMeta,
} from './sqliteService';
import { isDesktopApp } from '../platform/runtime';

const KEY_BACKUPS = 'mietpark_crm_backups_v1';

export interface BackupMetadata {
  id: string;
  name: string;
  timestamp: number;
  customerCount: number;
  fileSize: number;
}

interface BackupPayload {
  customers: Customer[];
  rentals: RentalRequest[];
  messages: Message[];
  payments: Payment[];
  resources: Resource[];
  customerDocs: CustomerDocument[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}

async function snapshot(): Promise<BackupPayload> {
  const [customers, rentals, messages, payments, resources, customerDocs, invoices] = await Promise.all([
    getAllCustomers(),
    getAllRentalRequests(),
    getAllMessages(),
    getAllPayments(),
    getAllResources(),
    getAllCustomerDocuments(),
    getAllInvoices(),
  ]);

  const invoiceItems: InvoiceItem[] = [];
  for (const invoice of invoices) {
    const items = await getInvoiceItems(invoice.id);
    invoiceItems.push(...items);
  }

  return { customers, rentals, messages, payments, resources, customerDocs, invoices, invoiceItems };
}

async function restore(payload: BackupPayload) {
  const desktop = isDesktopApp();
  const [existingCustomers, existingRentals, existingMessages, existingResources, existingInvoices] =
    await Promise.all([
      getAllCustomers(),
      getAllRentalRequests(),
      getAllMessages(),
      getAllResources(),
      getAllInvoices(),
    ]);

  const customerById = new Map(existingCustomers.map((item) => [item.id, item]));
  for (const customer of payload.customers || []) {
    if (customerById.has(customer.id)) await updateCustomer(customer);
    else await createCustomer(customer);
  }

  const rentalById = new Map(existingRentals.map((item) => [item.id, item]));
  for (const rental of payload.rentals || []) {
    if (rentalById.has(rental.id)) await updateRentalRequest(rental.id, rental);
    else await addRentalRequest(rental);
  }

  const messageById = new Map(existingMessages.map((item) => [item.id, item]));
  for (const message of payload.messages || []) {
    if (!desktop && messageById.has(message.id)) continue;
    await createMessage(message);
  }

  for (const payment of payload.payments || []) {
    await addPayment(payment);
  }

  const resourceById = new Map(existingResources.map((item) => [item.id, item]));
  for (const resource of payload.resources || []) {
    if (resourceById.has(resource.id)) await updateResource(resource.id, resource);
    else await addResource(resource);
  }

  const invoiceById = new Map(existingInvoices.map((item) => [item.id, item]));
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of payload.invoiceItems || []) {
    const bucket = itemsByInvoice.get(item.invoiceId) || [];
    bucket.push(item);
    itemsByInvoice.set(item.invoiceId, bucket);
  }

  for (const invoice of payload.invoices || []) {
    const items = itemsByInvoice.get(invoice.id) || [];
    if (invoiceById.has(invoice.id)) {
      await updateInvoice(invoice.id, invoice, items);
    } else {
      await addInvoice(invoice, items);
    }
  }

  // Restore document metadata first. Payload bytes are imported separately in ZIP flow.
  for (const doc of payload.customerDocs || []) {
    await upsertCustomerDocumentMeta(doc);
  }
}

export async function getAllBackups(): Promise<BackupMetadata[]> {
  return (await loadJson<BackupMetadata[]>(KEY_BACKUPS, [])).sort((a, b) => b.timestamp - a.timestamp);
}

export async function createBackup(name: string): Promise<BackupMetadata> {
  const payload = await snapshot();
  const timestamp = Date.now();
  const id = `backup_${timestamp}`;
  const raw = JSON.stringify(payload);

  // Store payload (can be large) via storage wrapper (IndexedDB preferred + migration).
  await saveJson(`mietpark_crm_backup_payload_${id}`, payload);

  const meta: BackupMetadata = {
    id,
    name,
    timestamp,
    customerCount: payload.customers.length,
    fileSize: raw.length,
  };

  const all = await getAllBackups();
  all.push(meta);
  await saveJson(KEY_BACKUPS, all);
  return meta;
}

export async function restoreBackup(backupId: string): Promise<number> {
  const key = `mietpark_crm_backup_payload_${backupId}`;
  const payload = await loadJson<BackupPayload | null>(key, null);
  if (!payload) throw new Error('Backup payload not found');
  await restore(payload);
  return payload.customers.length;
}

export async function deleteBackup(backupId: string): Promise<boolean> {
  try {
    const key = `mietpark_crm_backup_payload_${backupId}`;
    await deleteKey(key);
    const all = (await getAllBackups()).filter((b) => b.id !== backupId);
    await saveJson(KEY_BACKUPS, all);
    return true;
  } catch {
    return false;
  }
}

export async function downloadBackup(backupId: string): Promise<void> {
  const key = `mietpark_crm_backup_payload_${backupId}`;
  const payload = await loadJson<BackupPayload | null>(key, null);
  if (!payload) {
    throw new Error('Backup nicht gefunden');
  }
  const raw = JSON.stringify(payload);
  const meta = (await getAllBackups()).find((b) => b.id === backupId);
  const filename = meta ? `${meta.id}.json` : `${backupId}.json`;
  const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return (name || 'dokument')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type BackupBundleResult = { type: 'success' } | { type: 'warning'; missing: string[] };

export async function downloadBackupBundle(backupId: string): Promise<BackupBundleResult> {
  const key = `mietpark_crm_backup_payload_${backupId}`;
  const payload = await loadJson<BackupPayload | null>(key, null);
  if (!payload) {
    throw new Error('Backup nicht gefunden');
  }

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload, null, 2));

  const docs = Array.isArray(payload.customerDocs) ? payload.customerDocs : [];
  const manifest: Array<{ docId: string; path: string }> = [];
  const missing: string[] = [];

  for (const d of docs) {
    const filename = sanitizeFilename(d.filename || `${d.id}.bin`);
    const path = `documents/${d.id}_${filename}`;
    try {
      const p = await getCustomerDocumentPayload(d.id);
      if (!p) {
        missing.push(d.filename || d.id);
        continue;
      }
      if (p instanceof Blob) {
        zip.file(path, p);
      } else if (typeof p === 'string') {
        zip.file(path, base64ToBytes(p));
      } else {
        missing.push(d.filename || d.id);
        continue;
      }
      manifest.push({ docId: d.id, path });
    } catch {
      missing.push(d.filename || d.id);
    }
  }

  zip.file('documents/manifest.json', JSON.stringify({ version: 1, manifest }, null, 2));

  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(out, `${backupId}.zip`);
  if (missing.length) {
    return { type: 'warning', missing };
  }
  return { type: 'success' };
}

export async function importBackupBundleFromFile(file: File): Promise<{ customerCount: number; docCount: number; docImported: number }> {
  const zip = await JSZip.loadAsync(file);
  const backupRaw = await zip.file('backup.json')?.async('string');
  if (!backupRaw) throw new Error('backup.json fehlt im ZIP');
  const payload = JSON.parse(backupRaw) as BackupPayload;

  // Clear existing docs + payloads first to avoid orphaned blobs.
  await deleteAllCustomerDocuments();

  // Restore JSON payload (includes doc metadata).
  await restore(payload);

  const docs = Array.isArray(payload.customerDocs) ? payload.customerDocs : [];
  let imported = 0;

  // Prefer manifest mapping (stable even with weird filenames).
  let manifest: Array<{ docId: string; path: string }> = [];
  try {
    const mraw = await zip.file('documents/manifest.json')?.async('string');
    if (mraw) {
      const parsed = JSON.parse(mraw);
      if (Array.isArray(parsed?.manifest)) manifest = parsed.manifest;
    }
  } catch {
    // ignore
  }

  const byId = new Map(manifest.map((m) => [m.docId, m.path]));

  for (const d of docs) {
    const path = byId.get(d.id) || `documents/${d.id}_${sanitizeFilename(d.filename || `${d.id}.bin`)}`;
    const entry = zip.file(path);
    if (!entry) continue;
    const blob = await entry.async('blob');
    await setCustomerDocumentPayload(d.id, new Blob([blob], { type: d.mimeType || blob.type || 'application/octet-stream' }));
    imported += 1;
  }

  return { customerCount: (payload.customers || []).length, docCount: docs.length, docImported: imported };
}

export async function getBackupStats(): Promise<{ count: number }> {
  return { count: (await getAllBackups()).length };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function formatBackupDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('de-DE');
}

export async function importSQLiteFromFile(_file: File): Promise<void> {
  // Kept for API compatibility; the reconstruction does not import real sqlite files.
  throw new Error('SQLite-Import ist in dieser Version nicht verfuegbar.');
}
