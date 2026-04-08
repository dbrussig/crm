import type { RentalStatus } from '../types';
import { createFollowUpInvoiceFromInvoice, fetchInvoiceById, removeInvoice } from './invoiceService';
import { transitionStatus } from './rentalService';
import { updateInvoice } from './sqliteService';

/**
 * Creates an order (Auftrag) from a quote (Angebot) and syncs rental status.
 * Returns the new invoice ID.
 */
export async function createOrderFromQuote(invoiceId: string): Promise<string> {
  const result = await createFollowUpInvoiceWithStatusSync(invoiceId, 'Auftrag');
  return result.nextInvoiceId;
}

/**
 * Creates an invoice (Rechnung) from an order (Auftrag) and syncs rental status.
 * Returns the new invoice ID.
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

  const targetStatus: RentalStatus = targetType === 'Auftrag' ? 'angenommen' : 'abgeschlossen';

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
