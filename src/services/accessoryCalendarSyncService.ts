import type { AccessoryCalendarEvent, Invoice, InvoiceItem, RentalAccessory } from '../types';
import {
  deleteAccessoryCalendarEventsForInvoice,
  getAccessoryCalendarGlobalMappingId,
  getAllAccessories,
  listAccessoryCalendarEventsForInvoice,
  listAccessoryCalendarMappings,
  upsertAccessoryCalendarEvent,
} from './sqliteService';
import { createEventLegacy, deleteEventLegacy } from './googleCalendarService';

function formatEuro(amount: number): string {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function calcTotalGross(items: InvoiceItem[]): number {
  let total = 0;
  for (const it of items) {
    const net = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
    const tax = net * ((Number(it.taxPercent) || 0) / 100);
    total += net + tax;
  }
  return Math.round(total * 100) / 100;
}

function calcDepositAmount(invoice: Invoice, totalGross: number): number {
  if (!invoice.depositEnabled) return 0;
  const percent = Number(invoice.depositPercent || 0);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((totalGross * (percent / 100)) * 100) / 100;
}

function accessoryLabel(accessory: RentalAccessory | undefined, accessoryId: string): string {
  if (!accessory) return `Träger (${accessoryId})`;
  const key = String(accessory.inventoryKey || '').trim();
  if (key) return /^#/.test(key) ? `Träger ${key}` : `Träger #${key}`;
  return `Träger ${accessory.name || accessory.id}`;
}

function parseLocalDateTime(dateIso?: string, time?: string): Date | null {
  const d = String(dateIso || '').trim();
  const t = String(time || '').trim();
  if (!d || !t) return null;
  const dt = new Date(`${d}T${t}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function resolveGoogleCalendarIdForAccessory(accessoryId: string): Promise<string | null> {
  const all = await listAccessoryCalendarMappings();
  const globalId = all.find((x) => x.accessoryId === getAccessoryCalendarGlobalMappingId())?.googleCalendarId || '';
  const per = all.find((x) => x.accessoryId === accessoryId)?.googleCalendarId || '';
  const pick = String(per || globalId || '').trim();
  return pick ? pick : null;
}

function buildPrivateProps(e: AccessoryCalendarEvent): Record<string, string> {
  return {
    crmType: 'accessory',
    invoiceId: e.invoiceId,
    accessoryId: e.accessoryId,
    kind: e.kind,
    ...(e.invoiceItemId ? { invoiceItemId: e.invoiceItemId } : {}),
    localId: e.id,
  };
}

async function deleteGoogleEventBestEffort(calendarId?: string | null, eventId?: string | null) {
  const cid = String(calendarId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid) return;
  try {
    await deleteEventLegacy(cid, eid);
  } catch {
    // ignore (already deleted / no access / offline)
  }
}

export async function syncAccessoryCalendarForInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
  const invoiceId = String(invoice.id || '').trim();
  if (!invoiceId) return;

  // Always store internal events (source of truth) and try Google as best-effort.
  // Spec: on change -> delete existing Google events, then create fresh ones.
  const existing = await listAccessoryCalendarEventsForInvoice(invoiceId);
  for (const e of existing) {
    await deleteGoogleEventBestEffort(e.googleCalendarId, e.googleEventId);
  }
  await deleteAccessoryCalendarEventsForInvoice(invoiceId);

  const accessories = await getAllAccessories();
  const accessoryById = new Map<string, RentalAccessory>();
  for (const a of accessories) accessoryById.set(a.id, a);

  const startMs = typeof invoice.servicePeriodStart === 'number' ? invoice.servicePeriodStart : undefined;
  const endMs = typeof invoice.servicePeriodEnd === 'number' ? invoice.servicePeriodEnd : undefined;

  const bookingAccessories = items
    .map((it) => String(it.assignedAccessoryId || '').trim())
    .filter(Boolean);
  const uniqueAccessoryIds = Array.from(new Set(bookingAccessories));

  const totalGross = calcTotalGross(items);
  const depositAmount = calcDepositAmount(invoice, totalGross);

  const buyer = String(invoice.buyerName || '').trim() || 'Kunde';

  const now = Date.now();
  const nextEvents: AccessoryCalendarEvent[] = [];

  // Booking events (multi-day)
  if (startMs && endMs && endMs > startMs) {
    for (const it of items) {
      const accessoryId = String(it.assignedAccessoryId || '').trim();
      if (!accessoryId) continue;
      const accessory = accessoryById.get(accessoryId);
      // Dachträger only (category)
      if (accessory && accessory.category !== 'Dachträger') continue;

      const title = `${buyer} – ${accessoryLabel(accessory, accessoryId)} – ${formatEuro(depositAmount)} / ${formatEuro(totalGross)}`;
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${it.id}:booking`,
        invoiceId,
        invoiceItemId: it.id,
        accessoryId,
        kind: 'booking',
        title,
        startTime: startMs,
        endTime: endMs,
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Pickup/return (point events) per accessory
  const pickupDt = parseLocalDateTime(invoice.pickupDate, invoice.pickupTime);
  const returnDt = parseLocalDateTime(invoice.returnDate, invoice.returnTime);
  const pickupEnd = pickupDt ? new Date(pickupDt.getTime() + 30 * 60 * 1000) : null;
  const returnEnd = returnDt ? new Date(returnDt.getTime() + 30 * 60 * 1000) : null;

  for (const accessoryId of uniqueAccessoryIds) {
    const accessory = accessoryById.get(accessoryId);
    if (accessory && accessory.category !== 'Dachträger') continue;
    const label = accessoryLabel(accessory, accessoryId);
    if (pickupDt && pickupEnd) {
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${accessoryId}:pickup`,
        invoiceId,
        invoiceItemId: null,
        accessoryId,
        kind: 'pickup',
        title: `Abholung – ${buyer} – ${label}`,
        startTime: pickupDt.getTime(),
        endTime: pickupEnd.getTime(),
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (returnDt && returnEnd) {
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${accessoryId}:return`,
        invoiceId,
        invoiceItemId: null,
        accessoryId,
        kind: 'return',
        title: `Rückgabe – ${buyer} – ${label}`,
        startTime: returnDt.getTime(),
        endTime: returnEnd.getTime(),
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Persist internal first.
  for (const e of nextEvents) {
    await upsertAccessoryCalendarEvent(e);
  }

  // Best-effort Google sync: create fresh events.
  for (const e of nextEvents) {
    const calendarId = await resolveGoogleCalendarIdForAccessory(e.accessoryId);
    if (!calendarId) {
      await upsertAccessoryCalendarEvent({ ...e, syncStatus: 'pending', lastError: 'Kein Google Kalender zugeordnet.', updatedAt: Date.now() });
      continue;
    }

    try {
      const eventId = await createEventLegacy(calendarId, {
        summary: e.title,
        description: `CRM Beleg: ${invoice.invoiceNo}\nInvoiceId: ${e.invoiceId}\nAccessoryId: ${e.accessoryId}\nKind: ${e.kind}\nLocalId: ${e.id}`,
        start: new Date(e.startTime),
        end: new Date(e.endTime),
        privateProps: buildPrivateProps(e),
      });
      await upsertAccessoryCalendarEvent({
        ...e,
        googleCalendarId: calendarId,
        googleEventId: eventId,
        syncStatus: 'synced',
        lastError: null,
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      await upsertAccessoryCalendarEvent({
        ...e,
        googleCalendarId: calendarId,
        googleEventId: null,
        syncStatus: 'failed',
        lastError: err?.message || String(err),
        updatedAt: Date.now(),
      });
    }
  }
}

export async function deleteAccessoryCalendarForInvoice(invoiceId: string): Promise<void> {
  const id = String(invoiceId || '').trim();
  if (!id) return;
  const existing = await listAccessoryCalendarEventsForInvoice(id);
  for (const e of existing) {
    await deleteGoogleEventBestEffort(e.googleCalendarId, e.googleEventId);
  }
  await deleteAccessoryCalendarEventsForInvoice(id);
}

export async function generateInternalAccessoryCalendarEventsForInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
  const invoiceId = String(invoice.id || '').trim();
  if (!invoiceId) return;
  await deleteAccessoryCalendarEventsForInvoice(invoiceId);

  const accessories = await getAllAccessories();
  const accessoryById = new Map<string, RentalAccessory>();
  for (const a of accessories) accessoryById.set(a.id, a);

  const startMs = typeof invoice.servicePeriodStart === 'number' ? invoice.servicePeriodStart : undefined;
  const endMs = typeof invoice.servicePeriodEnd === 'number' ? invoice.servicePeriodEnd : undefined;

  const bookingAccessories = items
    .map((it) => String(it.assignedAccessoryId || '').trim())
    .filter(Boolean);
  const uniqueAccessoryIds = Array.from(new Set(bookingAccessories));

  const totalGross = calcTotalGross(items);
  const depositAmount = calcDepositAmount(invoice, totalGross);

  const buyer = String(invoice.buyerName || '').trim() || 'Kunde';
  const now = Date.now();

  const nextEvents: AccessoryCalendarEvent[] = [];

  if (startMs && endMs && endMs > startMs) {
    for (const it of items) {
      const accessoryId = String(it.assignedAccessoryId || '').trim();
      if (!accessoryId) continue;
      const accessory = accessoryById.get(accessoryId);
      if (accessory && accessory.category !== 'Dachträger') continue;
      const title = `${buyer} – ${accessoryLabel(accessory, accessoryId)} – ${formatEuro(depositAmount)} / ${formatEuro(totalGross)}`;
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${it.id}:booking`,
        invoiceId,
        invoiceItemId: it.id,
        accessoryId,
        kind: 'booking',
        title,
        startTime: startMs,
        endTime: endMs,
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const pickupDt = parseLocalDateTime(invoice.pickupDate, invoice.pickupTime);
  const returnDt = parseLocalDateTime(invoice.returnDate, invoice.returnTime);
  const pickupEnd = pickupDt ? new Date(pickupDt.getTime() + 30 * 60 * 1000) : null;
  const returnEnd = returnDt ? new Date(returnDt.getTime() + 30 * 60 * 1000) : null;

  for (const accessoryId of uniqueAccessoryIds) {
    const accessory = accessoryById.get(accessoryId);
    if (accessory && accessory.category !== 'Dachträger') continue;
    const label = accessoryLabel(accessory, accessoryId);
    if (pickupDt && pickupEnd) {
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${accessoryId}:pickup`,
        invoiceId,
        invoiceItemId: null,
        accessoryId,
        kind: 'pickup',
        title: `Abholung – ${buyer} – ${label}`,
        startTime: pickupDt.getTime(),
        endTime: pickupEnd.getTime(),
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (returnDt && returnEnd) {
      nextEvents.push({
        id: `acc_evt:${invoiceId}:${accessoryId}:return`,
        invoiceId,
        invoiceItemId: null,
        accessoryId,
        kind: 'return',
        title: `Rückgabe – ${buyer} – ${label}`,
        startTime: returnDt.getTime(),
        endTime: returnEnd.getTime(),
        googleCalendarId: null,
        googleEventId: null,
        syncStatus: 'pending',
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const e of nextEvents) {
    await upsertAccessoryCalendarEvent(e);
  }
}

export async function trySyncAccessoryCalendarEvents(events: AccessoryCalendarEvent[]): Promise<void> {
  const rows = (events || []).slice();
  if (rows.length === 0) return;

  for (const e of rows) {
    // Already synced and has an event id => leave as-is (source of truth is internal DB).
    if (e.syncStatus === 'synced' && String(e.googleEventId || '').trim()) continue;

    const calendarId = await resolveGoogleCalendarIdForAccessory(e.accessoryId);
    if (!calendarId) {
      await upsertAccessoryCalendarEvent({ ...e, syncStatus: 'pending', lastError: 'Kein Google Kalender zugeordnet.', updatedAt: Date.now() });
      continue;
    }

    try {
      const eventId = await createEventLegacy(calendarId, {
        summary: e.title,
        description: `CRM InvoiceId: ${e.invoiceId}\nAccessoryId: ${e.accessoryId}\nKind: ${e.kind}\nLocalId: ${e.id}`,
        start: new Date(e.startTime),
        end: new Date(e.endTime),
        privateProps: buildPrivateProps(e),
      });
      await upsertAccessoryCalendarEvent({
        ...e,
        googleCalendarId: calendarId,
        googleEventId: eventId,
        syncStatus: 'synced',
        lastError: null,
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      await upsertAccessoryCalendarEvent({
        ...e,
        googleCalendarId: calendarId,
        googleEventId: null,
        syncStatus: 'failed',
        lastError: err?.message || String(err),
        updatedAt: Date.now(),
      });
    }
  }
}
