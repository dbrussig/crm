import type { RentalStatus } from '../types';
import { createFollowUpInvoiceFromInvoice, fetchInvoiceById, removeInvoice } from './invoiceService';
import { transitionStatus } from './rentalService';
import { updateInvoice } from './sqliteService';

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
