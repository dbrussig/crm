import type { RentalRequest, RentalStatus } from '../types';
import { addRentalRequest, getAllRentalRequests, getCustomerById, getRentalRequest, getAllResources, updateRentalRequest } from './sqliteService';
import { createEventLegacy, deleteEventLegacy } from './googleCalendarService';

const CLOSED_STATUSES: RentalStatus[] = ['archiviert', 'abgeschlossen', 'abgelehnt', 'storniert', 'noshow'];

export const THULE_OPEN_RELING_BUNDLE_KEYS = [
  'THULE-OPEN-710410+712200',
  'THULE-OPEN-710410+712300',
] as const;

const SQUAREBAR_712200_WIDTH_MM = 1180;
const SQUAREBAR_712300_WIDTH_MM = 1270;
const DEFAULT_OPEN_RELING_BUNDLE = 'THULE-OPEN-710410+712300';

function isDachbox(rental: RentalRequest): boolean {
  return rental.productType === 'Dachbox XL' || rental.productType === 'Dachbox L' || rental.productType === 'Dachbox M';
}

function requiresRoofRackBundle(rental: RentalRequest): boolean {
  return isDachbox(rental) && (rental.includeRoofRack ?? true);
}

function normalizeRoofRackKey(raw: string | undefined): string {
  const normalized = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  // Legacy Firebase import marker must never be used as real inventory assignment.
  if (/^FIREBASE-[A-Z0-9]+$/.test(normalized)) return '';
  return normalized;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function keyContainsOpenRelingThuleFoot(key: string): boolean {
  // Thule 753 is equivalent to 710410.
  return key.includes('710410') || key.includes('753');
}

function keyContainsSquareBarForOpenReling(key: string): boolean {
  return key.includes('712200') || key.includes('712300');
}

function chooseOpenRelingBundleByWidth(rental: RentalRequest): string {
  const width = Number((rental as any).vehicleWidthMm || 0);
  if (Number.isFinite(width) && width > 0 && width <= SQUAREBAR_712200_WIDTH_MM) {
    return 'THULE-OPEN-710410+712200';
  }
  // Standard laut Vorgabe: 712300.
  return DEFAULT_OPEN_RELING_BUNDLE;
}

export function resolveRoofRackBundleKey(rental: RentalRequest): string {
  const normalizedKey = normalizeRoofRackKey(rental.roofRackInventoryKey);
  // Manual decision only: no automatic assignment into the workflow.
  // Suggestions may still be shown in UI via getRoofRackBundleSuggestions().
  return normalizedKey;
}

export function getRoofRackBundleSuggestions(rental: RentalRequest): string[] {
  if (!requiresRoofRackBundle(rental)) return [];
  if (rental.relingType === 'offen') {
    const preferred = chooseOpenRelingBundleByWidth(rental);
    const alternatives = THULE_OPEN_RELING_BUNDLE_KEYS.filter((k) => k !== preferred);
    return [preferred, ...alternatives];
  }
  return [];
}

export function validateRoofRackAssignment(rental: RentalRequest): { ok: boolean; errors: string[]; normalizedKey: string } {
  const normalizedKey = resolveRoofRackBundleKey(rental);

  if (!requiresRoofRackBundle(rental)) {
    return { ok: true, errors: [], normalizedKey };
  }

  const errors: string[] = [];

  if (!normalizedKey) {
    errors.push('Für Dachbox mit Dachträger muss ein Dachträger-Bundle ausgewählt werden.');
    return { ok: false, errors, normalizedKey };
  }

  if (rental.relingType === 'offen') {
    const hasFoot = keyContainsOpenRelingThuleFoot(normalizedKey);
    const hasBar = keyContainsSquareBarForOpenReling(normalizedKey);

    if (!hasFoot || !hasBar) {
      errors.push(
        'Offene Reling: erlaubt ist nur Thule 710410 (alias 753) mit SquareBar 712200 oder 712300 als gemeinsames Bundle.'
      );
    }
  }

  return { ok: errors.length === 0, errors, normalizedKey };
}

export async function findRoofRackConflict(
  rental: RentalRequest
): Promise<{ conflictId: string; conflictStart: number; conflictEnd: number } | null> {
  const normalizedKey = resolveRoofRackBundleKey(rental);
  if (!normalizedKey) return null;

  const all = await getAllRentalRequests();
  const conflict = all.find((other) => {
    if (!other || other.id === rental.id) return false;
    if (CLOSED_STATUSES.includes(other.status)) return false;
    const otherKey = normalizeRoofRackKey(other.roofRackInventoryKey);
    if (!otherKey || otherKey !== normalizedKey) return false;
    return overlaps(
      Number(rental.rentalStart || 0),
      Number(rental.rentalEnd || 0),
      Number(other.rentalStart || 0),
      Number(other.rentalEnd || 0)
    );
  });

  if (!conflict) return null;
  return {
    conflictId: conflict.id,
    conflictStart: Number(conflict.rentalStart || 0),
    conflictEnd: Number(conflict.rentalEnd || 0),
  };
}

export async function assertRoofRackReadyForWorkflow(rental: RentalRequest): Promise<void> {
  const validation = validateRoofRackAssignment(rental);
  if (!validation.ok) {
    throw { error: validation.errors.join(' ') };
  }

  if (!requiresRoofRackBundle(rental)) return;

  const conflict = await findRoofRackConflict({
    ...rental,
    roofRackInventoryKey: validation.normalizedKey,
  });
  if (conflict) {
    throw {
      error:
        `Dachträger-Bundle ist im Zeitraum bereits reserviert (Vorgang ${conflict.conflictId}, ` +
        `${new Date(conflict.conflictStart).toLocaleDateString('de-DE')} - ${new Date(conflict.conflictEnd).toLocaleDateString('de-DE')}).`,
    };
  }
}

function euro(v: number | undefined): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(2)} EUR`;
}

function relingLabel(v: any): string {
  const s = String(v || '').toLowerCase();
  if (s === 'offen') return 'Reling: offen';
  if (s === 'geschlossen') return 'Reling: geschlossen';
  if (s === 'keine') return 'Reling: keine';
  if (s === 'unklar' || !s) return 'Reling: unklar';
  return `Reling: ${s}`;
}

async function resolveGoogleCalendarId(rental: RentalRequest): Promise<string | undefined> {
  const direct = String(rental.googleCalendarId || '').trim();
  if (direct) return direct;

  const resourceId = String(rental.resourceId || '').trim();
  if (!resourceId) return undefined;

  const resources = await getAllResources();
  const match = resources.find((resource) => resource.id === resourceId);
  const fallback = String(match?.googleCalendarId || '').trim();
  return fallback || undefined;
}

export async function createRentalRequest(rental: RentalRequest): Promise<void> {
  return addRentalRequest(rental);
}

export async function fetchRentalRequest(id: string): Promise<RentalRequest | null> {
  return getRentalRequest(id);
}

export async function fetchAllRentalRequests(): Promise<RentalRequest[]> {
  return getAllRentalRequests();
}

export async function setAvailabilityResult(
  rentalId: string,
  result: { isAvailable: boolean }
): Promise<void> {
  await updateRentalRequest(rentalId, {
    availabilityStatus: result.isAvailable ? 'frei' : 'belegt',
    availabilityCheckedAt: Date.now(),
  });
}

export function calculateMissingInfo(rental: RentalRequest): string[] {
  const missing: string[] = [];

  if (!rental.customerId) missing.push('Kunde');
  if (!rental.productType) missing.push('Produkt');
  if (!rental.rentalStart || !rental.rentalEnd) missing.push('Mietzeitraum');
  if (!rental.googleCalendarId) missing.push('Kalender-ID (Ressource)');
  if (rental.priceSnapshot === undefined) missing.push('Preis');
  if (rental.deposit === undefined) missing.push('Kaution');

  if ((rental.productType === 'Heckbox' || rental.productType === 'Fahrradträger') && (!rental.ahkPresent || rental.ahkPresent === 'unklar')) {
    missing.push('AHK (ja/nein)');
  }

  if (isDachbox(rental) && rental.relingType !== 'offen' && rental.relingType !== 'geschlossen') {
    missing.push('Relingart');
  }

  if (isDachbox(rental) && (!rental.vehicleMake || !rental.vehicleModel)) {
    missing.push('Fahrzeug (Marke/Modell)');
  }

  if (requiresRoofRackBundle(rental) && !resolveRoofRackBundleKey(rental)) {
    missing.push('Dachträger-Bundle');
  }

  if (requiresRoofRackBundle(rental) && rental.relingType === 'offen') {
    const validation = validateRoofRackAssignment(rental);
    if (!validation.ok) {
      missing.push('Dachträger-Kombination (710410/753 + 712200/712300)');
    }
  }

  return missing;
}

function isForwardTransition(current: RentalStatus, next: RentalStatus): boolean {
  // Allow simple back-and-forth while collecting info.
  if ((current === 'neu' || current === 'info_fehlt') && (next === 'neu' || next === 'info_fehlt')) {
    return true;
  }

  const order: RentalStatus[] = [
    'neu',
    'info_fehlt',
    'check_verfuegbarkeit',
    'angebot_gesendet',
    'angenommen',
    'rechnung_gestellt',
    'uebergabe_rueckgabe',
    'abgeschlossen',
  ];
  const a = order.indexOf(current);
  const b = order.indexOf(next);
  if (a === -1 || b === -1) return true; // special statuses
  return b >= a;
}

const STATUS_LABELS: Record<RentalStatus, string> = {
  neu: 'Neu',
  info_fehlt: 'Info fehlt',
  check_verfuegbarkeit: 'Verfügbarkeit prüfen',
  angebot_gesendet: 'Angebot gesendet',
  angenommen: 'Angenommen',
  rechnung_gestellt: 'Rechnung gestellt',
  uebergabe_rueckgabe: 'Übergabe/Rückgabe',
  abgeschlossen: 'Abgeschlossen',
  archiviert: 'Archiviert',
  abgelehnt: 'Abgelehnt',
  storniert: 'Storniert',
  noshow: 'Nicht erschienen',
};

export function getRentalStatusLabel(status: RentalStatus): string {
  return STATUS_LABELS[status] || status;
}

export function canTransitionStatus(current: RentalStatus, next: RentalStatus): boolean {
  return isForwardTransition(current, next);
}

export async function transitionStatus(rentalId: string, newStatus: RentalStatus): Promise<void> {
  const rental = await getRentalRequest(rentalId);
  if (!rental) {
    throw { error: 'Vorgang nicht gefunden' };
  }

  // Basic validation. The original project had more business rules.
  if (!isForwardTransition(rental.status, newStatus)) {
    throw {
      error: `Der Schritt ist nicht möglich: zuerst von "${getRentalStatusLabel(rental.status)}" aus den nächsten Workflow-Schritt wählen, dann "${getRentalStatusLabel(newStatus)}".`,
    };
  }

  // Dachbox with roof rack: bundle must be valid + not double-booked before moving through workflow.
  if (newStatus === 'check_verfuegbarkeit' || newStatus === 'angebot_gesendet' || newStatus === 'angenommen') {
    await assertRoofRackReadyForWorkflow(rental);
  }

  const updates: Partial<RentalRequest> = {
    status: newStatus,
    missingInfo: calculateMissingInfo(rental),
  };

  if (newStatus === 'angenommen') updates.acceptedAt = Date.now();
  if (newStatus === 'abgeschlossen') updates.completedAt = Date.now();

  // Calendar side effects (local-only CRM, uses browser OAuth)
  // Note: missing googleCalendarId is a soft warning only – it is already tracked
  // in missingInfo via calculateMissingInfo(). We must not block the workflow
  // when Google OAuth / calendar integration is not configured.

  const resolvedCalendarId = await resolveGoogleCalendarId(rental);
  if (resolvedCalendarId && !rental.googleCalendarId) {
    updates.googleCalendarId = resolvedCalendarId;
  }

  if (newStatus === 'angenommen' && resolvedCalendarId && !rental.googleEventId) {
    try {
      const cust = await getCustomerById(rental.customerId).catch(() => null);
      const customerName = cust ? `${cust.firstName || ''} ${cust.lastName || ''}`.trim() : '';
      const amount = rental.priceOverride ? rental.priceOverride.overridePrice : rental.priceSnapshot;
      const reling = (rental.productType === 'Dachbox XL' || rental.productType === 'Dachbox L' || rental.productType === 'Dachbox M') ? relingLabel(rental.relingType) : '';
      const vehicle = [rental.vehicleMake, rental.vehicleModel].filter(Boolean).join(' ');

      const eventStartTs = Number(rental.pickupDate || rental.rentalStart || 0);
      const eventEndTs = Number(rental.returnDate || rental.rentalEnd || 0);
      const parts = [
        rental.productType,
        customerName || rental.customerId,
        amount !== undefined ? euro(amount) : '',
        reling,
        vehicle ? `Fahrzeug: ${vehicle}` : '',
      ].filter(Boolean);

      const eventId = await createEventLegacy(resolvedCalendarId, {
        // Busy + private per requirement ("beschaeftigt" + "vertraulich")
        summary: parts.join(' | '),
        description:
          `Vorgang: ${rental.id}\n` +
          `Kunde: ${customerName || rental.customerId}\n` +
          `Zeitraum: ${new Date(eventStartTs).toLocaleString('de-DE')} - ${new Date(eventEndTs).toLocaleString('de-DE')}\n` +
          `Betrag: ${amount !== undefined ? euro(amount) : '-'}\n` +
          (reling ? `${reling}\n` : '') +
          (vehicle ? `Fahrzeug: ${vehicle}\n` : ''),
        start: new Date(eventStartTs),
        end: new Date(eventEndTs),
        visibility: 'private',
        transparency: 'opaque',
      });
      updates.googleEventId = eventId;
    } catch (e) {
      // Non-fatal: status transition can still proceed.
      console.error('Failed to create calendar event:', e);
    }
  }

  if (newStatus === 'abgelehnt' && resolvedCalendarId) {
    try {
      const cust = await getCustomerById(rental.customerId).catch(() => null);
      const customerName = cust ? `${cust.firstName || ''} ${cust.lastName || ''}`.trim() : '';
      const amount = rental.priceOverride ? rental.priceOverride.overridePrice : rental.priceSnapshot;
      const reling = (rental.productType === 'Dachbox XL' || rental.productType === 'Dachbox L' || rental.productType === 'Dachbox M') ? relingLabel(rental.relingType) : '';
      const vehicle = [rental.vehicleMake, rental.vehicleModel].filter(Boolean).join(' ');
      const eventStartTs = Number(rental.pickupDate || rental.rentalStart || 0);
      const eventEndTs = Number(rental.returnDate || rental.rentalEnd || 0);
      const summaryParts = [
        'ABGELEHNT',
        rental.productType,
        customerName || rental.customerId,
        amount !== undefined ? euro(amount) : '',
        reling,
        vehicle ? `Fahrzeug: ${vehicle}` : '',
      ].filter(Boolean);

      // If a previous event exists, replace it with a declined marker event.
      if (rental.googleEventId) {
        try {
          await deleteEventLegacy(resolvedCalendarId, rental.googleEventId);
        } catch (e) {
          console.error('Failed to delete existing calendar event before declined marker:', e);
        }
      }

      const declinedEventId = await createEventLegacy(resolvedCalendarId, {
        summary: summaryParts.join(' | '),
        description:
          `Status: Angebot abgelehnt\n` +
          `Vorgang: ${rental.id}\n` +
          `Kunde: ${customerName || rental.customerId}\n` +
          `Zeitraum: ${new Date(eventStartTs).toLocaleString('de-DE')} - ${new Date(eventEndTs).toLocaleString('de-DE')}\n` +
          `Betrag: ${amount !== undefined ? euro(amount) : '-'}\n` +
          (reling ? `${reling}\n` : '') +
          (vehicle ? `Fahrzeug: ${vehicle}\n` : ''),
        start: new Date(eventStartTs),
        end: new Date(eventEndTs),
        visibility: 'private',
        // Declined offers should not block availability.
        transparency: 'transparent',
      });
      updates.googleEventId = declinedEventId;
    } catch (e) {
      // Non-fatal: status transition can still proceed.
      console.error('Failed to create declined calendar marker:', e);
    }
  }

  if (newStatus === 'storniert' && resolvedCalendarId && rental.googleEventId) {
    try {
      await deleteEventLegacy(resolvedCalendarId, rental.googleEventId);
      updates.googleEventId = undefined;
    } catch (e) {
      console.error('Failed to delete calendar event:', e);
    }
  }

  await updateRentalRequest(rentalId, updates);
}

export async function archiveRentalRequest(rentalId: string, reason?: string): Promise<void> {
  const rental = await getRentalRequest(rentalId);
  if (!rental) throw { error: 'Vorgang nicht gefunden' };

  // If there is a calendar event, best-effort delete it when archiving.
  const resolvedCalendarId = await resolveGoogleCalendarId(rental);
  if (resolvedCalendarId && rental.googleEventId) {
    try {
      await deleteEventLegacy(resolvedCalendarId, rental.googleEventId);
    } catch (e) {
      // Non-fatal: archiving should still proceed.
      console.error('Failed to delete calendar event during archive:', e);
    }
  }

  await updateRentalRequest(rentalId, {
    status: 'archiviert',
    archivedAt: Date.now(),
    archivedReason: reason || 'Archiviert',
  });
}
