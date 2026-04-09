/**
 * Local persistence layer.
 *
 * The original project used sql.js + IndexedDB. For reconstruction we keep the
 * public API but back it with localStorage so the UI can run again.
 */

import type { Customer, CustomerDocument, RentalRequest, Message, Resource, Invoice, InvoiceItem, Payment, DocumentCategory, RentalAccessory, Expense } from '../types';
import { deleteKey, loadJson, saveJson } from './_storage';
import { idbGet, idbSet } from './idbKv';
import { invokeDesktopCommand, isDesktopApp } from '../platform/runtime';

const KEY_CUSTOMERS = 'mietpark_crm_customers_v1';
const KEY_RENTALS = 'mietpark_crm_rentals_v1';
const KEY_MESSAGES = 'mietpark_crm_messages_v1';
const KEY_PAYMENTS = 'mietpark_crm_payments_v1';
const KEY_RESOURCES = 'mietpark_crm_resources_v1';
const KEY_ACCESSORIES = 'mietpark_crm_accessories_v1';
const KEY_INVOICES = 'mietpark_crm_invoices_v1';
const KEY_INVOICE_ITEMS = 'mietpark_crm_invoice_items_v1';
const KEY_CUSTOMER_DOCS = 'mietpark_crm_customer_docs_v1';
const KEY_CUSTOMER_DOC_PAYLOAD_PREFIX = 'mietpark_crm_customer_doc_payload_v1:';

function normalizeRoofRackInventoryKey(raw?: string): string | undefined {
  const v = String(raw || '').trim();
  if (!v) return undefined;
  if (/^FIREBASE-[A-Z0-9]+$/i.test(v)) return undefined;
  return v;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadCustomers(): Promise<Customer[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Customer[]>('list_customers');
  }
  const raw = await loadJson<Customer[]>(KEY_CUSTOMERS, []);
  // Normalize roof-rail photo storage (legacy single photo -> array; keep primary field in sync).
  return raw.map((c) => {
    const urls = Array.isArray((c as any).roofRailPhotoDataUrls)
      ? (c as any).roofRailPhotoDataUrls.filter(Boolean)
      : [];
    const legacy = (c as any).roofRailPhotoDataUrl ? [String((c as any).roofRailPhotoDataUrl)] : [];
    const nextUrls = urls.length ? urls : legacy;
    const primary = nextUrls[0] || undefined;
    return {
      ...c,
      roofRailPhotoDataUrls: nextUrls.length ? nextUrls : undefined,
      roofRailPhotoDataUrl: primary,
      assignedRoofRackInventoryKey: normalizeRoofRackInventoryKey((c as any).assignedRoofRackInventoryKey),
    } as Customer;
  });
}
async function saveCustomers(customers: Customer[]) {
  if (isDesktopApp()) {
    for (const customer of customers) {
      await invokeDesktopCommand('upsert_customer', { customer });
    }
    return;
  }
  // Ensure the legacy primary field stays consistent.
  const normalized = customers.map((c) => {
    const urls = Array.isArray((c as any).roofRailPhotoDataUrls) ? (c as any).roofRailPhotoDataUrls.filter(Boolean) : [];
    const primary = urls[0] || (c as any).roofRailPhotoDataUrl || undefined;
    const nextUrls = urls.length ? urls : (primary ? [primary] : []);
    return {
      ...c,
      roofRailPhotoDataUrls: nextUrls.length ? nextUrls : undefined,
      roofRailPhotoDataUrl: primary,
    } as Customer;
  });
  await saveJson(KEY_CUSTOMERS, normalized);
}

async function loadRentals(): Promise<RentalRequest[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<RentalRequest[]>('list_rental_requests');
  }
  const raw = await loadJson<RentalRequest[]>(KEY_RENTALS, []);
  // Normalize defaults for older data:
  // - Deposit: Heckbox + Dachboxen => 150 EUR (if not set)
  return raw.map((r) => {
    const needsDefaultDeposit =
      (r.productType === 'Heckbox' || r.productType === 'Dachbox XL' || r.productType === 'Dachbox L' || r.productType === 'Dachbox M') &&
      (r.deposit === undefined || r.deposit === null || Number.isNaN(Number(r.deposit)));
    return {
      ...r,
      deposit: needsDefaultDeposit ? 150 : r.deposit,
      roofRackInventoryKey: normalizeRoofRackInventoryKey((r as any).roofRackInventoryKey),
    } as RentalRequest;
  });
}
async function saveRentals(rentals: RentalRequest[]) {
  if (isDesktopApp()) {
    for (const rental of rentals) {
      await invokeDesktopCommand('upsert_rental_request', { rental });
    }
    return;
  }
  await saveJson(KEY_RENTALS, rentals);
}

async function loadMessages(): Promise<Message[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Message[]>('list_messages');
  }
  return loadJson<Message[]>(KEY_MESSAGES, []);
}
async function saveMessages(messages: Message[]) {
  if (isDesktopApp()) {
    for (const message of messages) {
      await invokeDesktopCommand('upsert_message', { message });
    }
    return;
  }
  await saveJson(KEY_MESSAGES, messages);
}

async function loadPayments(): Promise<Payment[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Payment[]>('list_payments');
  }
  return loadJson<Payment[]>(KEY_PAYMENTS, []);
}
async function savePayments(payments: Payment[]) {
  if (isDesktopApp()) {
    for (const payment of payments) {
      await invokeDesktopCommand('upsert_payment', { payment });
    }
    return;
  }
  await saveJson(KEY_PAYMENTS, payments);
}

async function loadResources(): Promise<Resource[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Resource[]>('list_resources');
  }
  return loadJson<Resource[]>(KEY_RESOURCES, []);
}
async function saveResources(resources: Resource[]) {
  if (isDesktopApp()) {
    for (const resource of resources) {
      await invokeDesktopCommand('upsert_resource', { resource });
    }
    return;
  }
  await saveJson(KEY_RESOURCES, resources);
}

async function loadAccessories(): Promise<RentalAccessory[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<RentalAccessory[]>('list_accessories');
  }
  return loadJson<RentalAccessory[]>(KEY_ACCESSORIES, []);
}
async function saveAccessories(accessories: RentalAccessory[]) {
  if (isDesktopApp()) {
    for (const accessory of accessories) {
      await invokeDesktopCommand('upsert_accessory', { accessory });
    }
    return;
  }
  await saveJson(KEY_ACCESSORIES, accessories);
}

async function loadInvoices(): Promise<Invoice[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Invoice[]>('list_invoices');
  }
  return loadJson<Invoice[]>(KEY_INVOICES, []);
}
async function saveInvoices(invoices: Invoice[]) {
  if (isDesktopApp()) {
    for (const invoice of invoices) {
      await invokeDesktopCommand('upsert_invoice', { invoice });
    }
    return;
  }
  await saveJson(KEY_INVOICES, invoices);
}

async function loadInvoiceItems(): Promise<InvoiceItem[]> {
  return loadJson<InvoiceItem[]>(KEY_INVOICE_ITEMS, []);
}
async function saveInvoiceItems(items: InvoiceItem[]) {
  if (isDesktopApp()) {
    const grouped = new Map<string, InvoiceItem[]>();
    for (const item of items) {
      const bucket = grouped.get(item.invoiceId) || [];
      bucket.push(item);
      grouped.set(item.invoiceId, bucket);
    }

    for (const [invoiceId, invoiceItems] of grouped.entries()) {
      await invokeDesktopCommand('replace_invoice_items', { invoiceId, items: invoiceItems });
    }
    return;
  }
  await saveJson(KEY_INVOICE_ITEMS, items);
}

async function loadCustomerDocs(): Promise<CustomerDocument[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<CustomerDocument[]>('list_customer_documents');
  }
  const raw = await loadJson<CustomerDocument[]>(KEY_CUSTOMER_DOCS, []);
  // Normalize legacy categories (older builds used 'Anfrage'/'Anleitung').
  const normalizeCategory = (c: any): DocumentCategory | undefined => {
    const v = String(c || '').trim();
    if (!v) return undefined;
    if (v === 'Angebot' || v === 'Auftrag' || v === 'Rechnung' || v === 'Ausweis' || v === 'Sonstiges') return v as any;
    if (v === 'Anfrage') return 'Sonstiges';
    if (v === 'Anleitung') return 'Sonstiges';
    return 'Sonstiges';
  };
  const next = raw.map((d) => ({ ...d, category: normalizeCategory((d as any).category) })) as CustomerDocument[];
  return next;
}
async function saveCustomerDocs(docs: CustomerDocument[]) {
  if (isDesktopApp()) {
    for (const doc of docs) {
      await invokeDesktopCommand('upsert_customer_document', { doc });
    }
    return;
  }
  await saveJson(KEY_CUSTOMER_DOCS, docs);
}

export async function getAllCustomerDocuments(): Promise<CustomerDocument[]> {
  return (await loadCustomerDocs()).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function updateCustomerDocumentMeta(docId: string, patch: Partial<CustomerDocument>): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('update_customer_document_meta', { docId, patch });
    return;
  }
  const docs = await loadCustomerDocs();
  const idx = docs.findIndex((d) => d.id === docId);
  if (idx === -1) throw new Error('Document not found');
  docs[idx] = { ...docs[idx], ...patch };
  await saveCustomerDocs(docs);
}

export async function upsertCustomerDocumentMeta(doc: CustomerDocument): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_customer_document', { doc });
    return;
  }
  const docs = await loadCustomerDocs();
  const idx = docs.findIndex((item) => item.id === doc.id);
  if (idx >= 0) docs[idx] = { ...docs[idx], ...doc };
  else docs.push(doc);
  await saveCustomerDocs(docs);
}

export async function deleteAllCustomerDocuments(): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_all_customer_documents');
    return;
  }
  const docs = await loadCustomerDocs();
  await saveCustomerDocs([]);
  for (const d of docs) {
    await deleteKey(`${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${d.id}`);
  }
}

export async function setCustomerDocumentPayload(docId: string, payload: Blob | string): Promise<void> {
  if (isDesktopApp()) {
    const payloadBase64 = payload instanceof Blob ? await blobToBase64(payload) : payload;
    await invokeDesktopCommand('set_customer_document_payload', { docId, payloadBase64 });
    return;
  }
  const key = `${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${docId}`;
  if (payload instanceof Blob) {
    await idbSet(key, payload);
  } else {
    await saveJson(key, payload);
  }
}

// Customers
export async function getAllCustomers(): Promise<Customer[]> {
  return (await loadCustomers()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  if (isDesktopApp()) {
    return (await invokeDesktopCommand<Customer | null>('get_customer_by_id', { id })) ?? null;
  }
  return (await loadCustomers()).find((c) => c.id === id) ?? null;
}

export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (isDesktopApp()) {
    return (await invokeDesktopCommand<Customer | null>('find_customer_by_email', { email: normalized })) ?? null;
  }
  return (await loadCustomers()).find((c) => c.email?.trim().toLowerCase() === normalized) ?? null;
}

export async function createCustomer(customer: Customer): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_customer', { customer });
    return;
  }
  const customers = await loadCustomers();
  customers.push(customer);
  await saveCustomers(customers);
}

export async function updateCustomer(customer: Customer): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_customer', { customer });
    return;
  }
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === customer.id);
  if (idx === -1) throw new Error('Customer not found');
  customers[idx] = customer;
  await saveCustomers(customers);
}

export async function deleteCustomer(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_customer', { id });
    return;
  }
  const customers = (await loadCustomers()).filter((c) => c.id !== id);
  await saveCustomers(customers);
}

// Customer documents (PDFs etc.)
export async function getDocumentsByCustomer(customerId: string): Promise<CustomerDocument[]> {
  return (await loadCustomerDocs())
    .filter((d) => d.customerId === customerId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function addCustomerDocument(doc: CustomerDocument, payloadBase64: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_customer_document', { doc, payloadBase64 });
    return;
  }
  const docs = await loadCustomerDocs();
  docs.push(doc);
  await saveCustomerDocs(docs);
  await saveJson(`${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${doc.id}`, payloadBase64);
}

export async function addCustomerDocumentBlob(doc: CustomerDocument, payload: Blob): Promise<void> {
  if (isDesktopApp()) {
    const payloadBase64 = await blobToBase64(payload);
    await invokeDesktopCommand('upsert_customer_document', { doc, payloadBase64 });
    return;
  }
  const docs = await loadCustomerDocs();
  docs.push(doc);
  await saveCustomerDocs(docs);
  try {
    // Store binary payload as Blob in IndexedDB (no base64 overhead).
    await idbSet(`${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${doc.id}`, payload);
  } catch (e) {
    // Roll back metadata entry if payload cannot be stored.
    await saveCustomerDocs(docs.filter((d) => d.id !== doc.id));
    throw e;
  }
}

export async function getCustomerDocumentPayload(docId: string): Promise<Blob | string | null> {
  if (isDesktopApp()) {
    const response = await invokeDesktopCommand<{ dataBase64: string } | null>('get_customer_document_payload', { docId });
    return response?.dataBase64 ?? null;
  }
  const key = `${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${docId}`;
  try {
    const v = await idbGet<any>(key);
    if (v instanceof Blob) return v;
    if (typeof v === 'string') return v; // legacy base64
    if (v !== undefined && v !== null) return v as any;
  } catch {
    // Fall back to legacy JSON loader below.
  }
  return loadJson<any>(key, null);
}

export async function deleteCustomerDocument(docId: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_customer_document', { docId });
    return;
  }
  await saveCustomerDocs((await loadCustomerDocs()).filter((d) => d.id !== docId));
  await deleteKey(`${KEY_CUSTOMER_DOC_PAYLOAD_PREFIX}${docId}`);
}

// Rentals
export async function addRentalRequest(rental: RentalRequest): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_rental_request', { rental });
    return;
  }
  const rentals = await loadRentals();
  rentals.push(rental);
  await saveRentals(rentals);
}

export async function getRentalRequest(id: string): Promise<RentalRequest | null> {
  if (isDesktopApp()) {
    return (await invokeDesktopCommand<RentalRequest | null>('get_rental_request', { id })) ?? null;
  }
  return (await loadRentals()).find((r) => r.id === id) ?? null;
}

export async function getAllRentalRequests(): Promise<RentalRequest[]> {
  return (await loadRentals()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateRentalRequest(id: string, updates: Partial<RentalRequest>): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('update_rental_request', { id, updates });
    return;
  }
  const rentals = await loadRentals();
  const idx = rentals.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error('Rental not found');
  rentals[idx] = { ...rentals[idx], ...updates, updatedAt: Date.now() };
  await saveRentals(rentals);
}

export async function getRentalRequestsByStatus(status: RentalRequest['status']): Promise<RentalRequest[]> {
  return (await loadRentals()).filter((r) => r.status === status);
}

// Messages
export async function createMessage(message: Message): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_message', { message });
    return;
  }
  const messages = await loadMessages();
  messages.push(message);
  await saveMessages(messages);
}

export async function getMessagesByRental(rentalRequestId: string): Promise<Message[]> {
  return (await loadMessages()).filter((m) => m.rentalRequestId === rentalRequestId);
}

export async function getMessagesByCustomer(customerId: string): Promise<Message[]> {
  return (await loadMessages())
    .filter((m) => m.customerId === customerId)
    .sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

export async function getAllMessages(): Promise<Message[]> {
  return (await loadMessages()).sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

// Payments
export async function addPayment(payment: Payment): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_payment', { payment });
    return;
  }
  const payments = await loadPayments();
  const idx = payments.findIndex((p) => p.id === payment.id);
  if (idx >= 0) {
    payments[idx] = { ...payments[idx], ...payment };
  } else {
    payments.push(payment);
  }
  await savePayments(payments);
}

export async function getPaymentsByRental(rentalRequestId: string): Promise<Payment[]> {
  return (await loadPayments())
    .filter((p) => p.rentalRequestId === rentalRequestId)
    .sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

export async function getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
  return (await loadPayments())
    .filter((p) => String(p.invoiceId || '') === String(invoiceId || ''))
    .sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

export async function getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
  return (await loadPayments())
    .filter((p) => p.customerId === customerId)
    .sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

export async function getAllPayments(): Promise<Payment[]> {
  return (await loadPayments()).sort((a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0));
}

export async function assignPaymentToInvoice(paymentId: string, invoiceId?: string): Promise<void> {
  const all = await loadPayments();
  const current = all.find((p) => p.id === paymentId);
  if (!current) throw new Error('Zahlung nicht gefunden');
  await addPayment({
    ...current,
    invoiceId: invoiceId || undefined,
  });
}

export async function deletePayment(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_payment', { id });
    return;
  }
  await savePayments((await loadPayments()).filter((p) => p.id !== id));
}

// Resources
export async function getAllResources(): Promise<Resource[]> {
  return (await loadResources()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function addResource(resource: Resource): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_resource', { resource });
    return;
  }
  const resources = await loadResources();
  resources.push(resource);
  await saveResources(resources);
}

export async function updateResource(id: string, updates: Partial<Resource>): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('update_resource', { id, updates });
    return;
  }
  const resources = await loadResources();
  const idx = resources.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error('Resource not found');
  resources[idx] = { ...resources[idx], ...updates };
  await saveResources(resources);
}

export async function deleteResource(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_resource', { id });
    return;
  }
  await saveResources((await loadResources()).filter((r) => r.id !== id));
}

// Accessories
export async function getAllAccessories(): Promise<RentalAccessory[]> {
  return (await loadAccessories()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function addAccessory(accessory: RentalAccessory): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_accessory', { accessory });
    return;
  }
  const accessories = await loadAccessories();
  accessories.push(accessory);
  await saveAccessories(accessories);
}

export async function updateAccessory(id: string, updates: Partial<RentalAccessory>): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('update_accessory', { id, updates });
    return;
  }
  const accessories = await loadAccessories();
  const idx = accessories.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Accessory not found');
  accessories[idx] = { ...accessories[idx], ...updates, updatedAt: Date.now() };
  await saveAccessories(accessories);
}

export async function deleteAccessory(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_accessory', { id });
    return;
  }
  await saveAccessories((await loadAccessories()).filter((a) => a.id !== id));
}

// Invoices
export async function getAllInvoices(): Promise<Invoice[]> {
  return (await loadInvoices()).sort((a, b) => b.invoiceDate - a.invoiceDate);
}

export async function addInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_invoice', { invoice });
    await invokeDesktopCommand('replace_invoice_items', { invoiceId: invoice.id, items });
    return;
  }
  const invoices = await loadInvoices();
  invoices.push(invoice);
  await saveInvoices(invoices);

  const allItems = await loadInvoiceItems();
  allItems.push(...items.map((it) => ({ ...it, invoiceId: invoice.id })));
  await saveInvoiceItems(allItems);
}

export async function updateInvoice(id: string, updates: Partial<Invoice>, items?: InvoiceItem[]): Promise<void> {
  if (isDesktopApp()) {
    const invoices = await loadInvoices();
    const current = invoices.find((invoice) => invoice.id === id);
    if (!current) throw new Error('Invoice not found');
    const next = { ...current, ...updates, updatedAt: Date.now() };
    await invokeDesktopCommand('upsert_invoice', { invoice: next });
    if (items) {
      await invokeDesktopCommand('replace_invoice_items', { invoiceId: id, items });
    }
    return;
  }
  const invoices = await loadInvoices();
  const idx = invoices.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('Invoice not found');
  invoices[idx] = { ...invoices[idx], ...updates, updatedAt: Date.now() };
  await saveInvoices(invoices);

  if (items) {
    const allItems = (await loadInvoiceItems()).filter((it) => it.invoiceId !== id);
    allItems.push(...items.map((it) => ({ ...it, invoiceId: id })));
    await saveInvoiceItems(allItems);
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_invoice', { id });
    return;
  }
  await saveInvoices((await loadInvoices()).filter((i) => i.id !== id));
  await saveInvoiceItems((await loadInvoiceItems()).filter((it) => it.invoiceId !== id));
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<InvoiceItem[]>('list_invoice_items', { invoiceId });
  }
  return (await loadInvoiceItems())
    .filter((it) => it.invoiceId === invoiceId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

const KEY_EXPENSES = 'mietpark_crm_expenses_v1';

export async function getAllExpenses(): Promise<Expense[]> {
  if (isDesktopApp()) {
    return await invokeDesktopCommand<Expense[]>('list_expenses', {});
  }
  return loadJson<Expense[]>(KEY_EXPENSES, []);
}

export async function createExpense(data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now();
  const expense: Expense = { ...data, id: `expense_${now}`, createdAt: now, updatedAt: now };
  if (isDesktopApp()) {
    await invokeDesktopCommand('upsert_expense', { expense });
    return expense.id;
  }
  const all = await getAllExpenses();
  all.push(expense);
  await saveJson(KEY_EXPENSES, all);
  return expense.id;
}

export async function updateExpense(id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>): Promise<void> {
  const now = Date.now();
  if (isDesktopApp()) {
    const all = await getAllExpenses();
    const current = all.find((e) => e.id === id);
    if (!current) throw new Error('Ausgabe nicht gefunden');
    const updated = { ...current, ...updates, updatedAt: now };
    await invokeDesktopCommand('upsert_expense', { expense: updated });
    return;
  }
  const all = await getAllExpenses();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Ausgabe nicht gefunden');
  all[idx] = { ...all[idx], ...updates, updatedAt: now };
  await saveJson(KEY_EXPENSES, all);
}

export async function deleteExpense(id: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('delete_expense', { id });
    return;
  }
  const all = await getAllExpenses();
  await saveJson(KEY_EXPENSES, all.filter((e) => e.id !== id));
}

// ──────────────────────────────────────────────────────────────────────────────

// Debug helper (kept for SQLDebugPanel)
export async function executeQuery(query: string): Promise<{ ok: boolean; result: unknown }> {
  return {
    ok: false,
    result: `SQL engine is not available in this reconstructed build. Query was: ${query}`,
  };
}
