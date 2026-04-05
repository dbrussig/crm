import type { Invoice, Payment } from '../types';

export type ThreadPaymentAssignment = {
  amount: number;
  currency: string;
  invoiceId?: string;
  invoiceNo?: string;
  receivedAt?: number;
};

export function pickSuggestedInvoiceForPayment(invoices: Invoice[]): Invoice | null {
  if (!Array.isArray(invoices) || invoices.length === 0) return null;
  const isClosedState = (state: Invoice['state']) => state === 'storniert' || state === 'archiviert';
  const isOpenInvoiceState = (state: Invoice['state']) => state === 'entwurf' || state === 'gesendet';
  const rank = (inv: Invoice) => {
    if (inv.invoiceType === 'Rechnung' && isOpenInvoiceState(inv.state)) return 0;
    if (inv.invoiceType === 'Rechnung' && !isClosedState(inv.state)) return 1;
    if (inv.invoiceType === 'Auftrag' && !isClosedState(inv.state)) return 2;
    if (inv.invoiceType === 'Angebot' && !isClosedState(inv.state)) return 3;
    return 4;
  };
  const sorted = [...invoices].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return (b.invoiceDate || b.createdAt || 0) - (a.invoiceDate || a.createdAt || 0);
  });
  return sorted[0] || null;
}

export function buildThreadPaymentAssignments(
  payments: Payment[],
  invoices: Invoice[],
  threadIds?: Iterable<string>
): Record<string, ThreadPaymentAssignment> {
  const allowedThreadIds = threadIds ? new Set(Array.from(threadIds, (id) => String(id || '').trim()).filter(Boolean)) : null;
  const invoiceNoById = new Map<string, string>();
  for (const inv of invoices || []) {
    invoiceNoById.set(String(inv.id), String(inv.invoiceNo || ''));
  }
  const assignments: Record<string, ThreadPaymentAssignment> = {};
  const sortedPayments = [...(payments || [])].sort(
    (a, b) => (b.receivedAt || b.createdAt || 0) - (a.receivedAt || a.createdAt || 0)
  );
  for (const p of sortedPayments) {
    const threadId = String(p.gmailThreadId || '').trim();
    if (!threadId) continue;
    if (allowedThreadIds && !allowedThreadIds.has(threadId)) continue;
    if (assignments[threadId]) continue;
    assignments[threadId] = {
      amount: Number(p.amount) || 0,
      currency: String(p.currency || 'EUR'),
      invoiceId: p.invoiceId,
      invoiceNo: p.invoiceId ? invoiceNoById.get(String(p.invoiceId)) || undefined : undefined,
      receivedAt: p.receivedAt || p.createdAt,
    };
  }
  return assignments;
}
