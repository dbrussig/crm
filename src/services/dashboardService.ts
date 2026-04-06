import type { Invoice, InvoiceItem, Payment } from '../types';
import { fetchAllInvoices } from './invoiceService';
import { getAllPayments, getInvoiceItems } from './sqliteService';

export type UeberfaelligeRechnung = {
  invoice: Invoice;
  offenBetrag: number;
  gesamtBetrag: number;
  daysOverdue: number;
};

export type DashboardFinancials = {
  offeneForderungen: number;
  monatsumsatz: number;
  ueberfaelligeRechnungen: UeberfaelligeRechnung[];
};

function calcInvoiceGross(items: InvoiceItem[]): number {
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const tax = Number(it.taxPercent) || 0;
    const line = qty * unit;
    return sum + line * (1 + tax / 100);
  }, 0);
}

function sumPaymentsForInvoice(payments: Payment[], invoiceId: string): number {
  return payments
    .filter((p) => String(p.invoiceId || '') === String(invoiceId || ''))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export async function getDashboardFinancials(): Promise<DashboardFinancials> {
  const [allInvoices, allPayments] = await Promise.all([fetchAllInvoices(), getAllPayments()]);
  const relevantInvoices = allInvoices.filter(
    (inv) => inv.invoiceType === 'Rechnung' && (inv.state === 'gesendet' || inv.state === 'angenommen')
  );

  const today = new Date();
  const todayDayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime();

  let offeneForderungen = 0;
  const ueberfaelligeRechnungen: UeberfaelligeRechnung[] = [];

  for (const inv of relevantInvoices) {
    const items = await getInvoiceItems(inv.id);
    const gross = Math.round(calcInvoiceGross(items) * 100) / 100;
    const paid = Math.round(sumPaymentsForInvoice(allPayments, inv.id) * 100) / 100;
    const open = Math.max(0, Math.round((gross - paid) * 100) / 100);
    offeneForderungen += open;

    const dueDate = Number(inv.dueDate || 0);
    if (dueDate > 0 && dueDate < todayDayStart && open > 0) {
      const daysOverdue = Math.max(1, Math.floor((todayDayStart - dueDate) / 86_400_000));
      ueberfaelligeRechnungen.push({
        invoice: inv,
        offenBetrag: open,
        gesamtBetrag: gross,
        daysOverdue,
      });
    }
  }

  const monatsumsatz = Math.round(
    allPayments
      .filter((p) => {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        return ts >= monthStart && ts < nextMonthStart;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100
  ) / 100;

  ueberfaelligeRechnungen.sort((a, b) => {
    const dueA = Number(a.invoice.dueDate || 0);
    const dueB = Number(b.invoice.dueDate || 0);
    return dueA - dueB;
  });

  return {
    offeneForderungen: Math.round(offeneForderungen * 100) / 100,
    monatsumsatz,
    ueberfaelligeRechnungen,
  };
}
