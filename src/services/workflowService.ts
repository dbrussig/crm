import type { InvoiceType, RentalStatus } from '../types';
import { createFollowUpInvoiceFromInvoice, fetchInvoiceById, removeInvoice } from './invoiceService';
import { canTransitionStatus, transitionStatus } from './rentalService';
import { updateInvoice } from './sqliteService';

/**
 * Maps an invoice-type conversion to the appropriate rental status.
 *
 * Angebot → Auftrag  : Kunde hat angenommen   → 'angenommen'
 * Auftrag → Rechnung : Rechnung wird gestellt  → 'rechnung_gestellt'
 *                      (Vorgang bleibt offen; abgeschlossen erst nach Rückgabe/Zahlung)
 */
function rentalStatusForConversion(targetType: InvoiceType): RentalStatus {
  if (targetType === 'Auftrag') return 'angenommen';
  return 'rechnung_gestellt';
}

/**
 * Creates an order (Auftrag) from a quote (Angebot) and syncs rental status.
 */
export async function createOrderFromQuote(invoiceId: string): Promise<string> {
  const result = await createFollowUpInvoiceWithStatusSync(invoiceId, 'Auftrag');
  return result.nextInvoiceId;
}

/**
 * Creates an invoice (Rechnung) from an order (Auftrag) and syncs rental status.
 */
export async function createInvoiceFromOrder(invoiceId: string): Promise<string> {
  const result = await createFollowUpInvoiceWithStatusSync(invoiceId, 'Rechnung');
  return result.nextInvoiceId;
}

export async function createFollowUpInvoiceWithStatusSync(
  invoiceId: string,
  targetType: 'Auftrag' | 'Rechnung'
): Promise<{ nextInvoiceId: string; rentalStatusUpdated: boolean }> {
  const source = await fetchInvoiceById(invoiceId);
  const nextInvoiceId = await createFollowUpInvoiceFromInvoice(invoiceId, targetType);

  if (!source?.invoice?.rentalRequestId) {
    return { nextInvoiceId, rentalStatusUpdated: false };
  }

  const targetStatus = rentalStatusForConversion(targetType);

  // Prüfe ob Transition erlaubt ist (verhindert Rückwärts-Schritte wenn Rental bereits weiter ist)
  const { getRentalRequest } = await import('./sqliteService');
  const rental = await getRentalRequest(source.invoice.rentalRequestId);
  if (!rental || !canTransitionStatus(rental.status, targetStatus)) {
    // Rental-Status bereits weiter oder Transition nicht erlaubt → Beleg trotzdem erstellen, aber Status nicht ändern
    return { nextInvoiceId, rentalStatusUpdated: false };
  }

  try {
    await transitionStatus(source.invoice.rentalRequestId, targetStatus);
    return { nextInvoiceId, rentalStatusUpdated: true };
  } catch (error) {
    try {
      await removeInvoice(nextInvoiceId);
      await updateInvoice(source.invoice.id, {
        state: source.invoice.state,
        replacesInvoiceId: undefined,
      });
    } catch (rollbackError) {
      console.error('Rollback failed after status sync error:', rollbackError);
    }
    throw error;
  }
}

/**
 * Called after saving an invoice that was created in the context of a rental draft.
 * Transitions the rental to the requested status – but only if the transition is valid.
 * Returns whether the transition was applied.
 *
 * This centralises the status-sync that was previously scattered across App.tsx.
 */
export async function syncRentalStatusOnInvoiceSave(
  rentalId: string,
  nextRentalStatus: RentalStatus
): Promise<{ updated: boolean; error?: string }> {
  try {
    const { getRentalRequest } = await import('./sqliteService');
    const rental = await getRentalRequest(rentalId);
    if (!rental) return { updated: false, error: 'Vorgang nicht gefunden' };

    if (!canTransitionStatus(rental.status, nextRentalStatus)) {
      // Soft-skip: transition not allowed from current state – not a hard error.
      return { updated: false };
    }

    await transitionStatus(rentalId, nextRentalStatus);
    return { updated: true };
  } catch (e: any) {
    const msg = e?.error || e?.message || String(e);
    return { updated: false, error: msg };
  }
}
