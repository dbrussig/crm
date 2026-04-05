import { describe, expect, it } from 'vitest';
import type { Invoice, Payment } from '../types';
import { buildThreadPaymentAssignments, pickSuggestedInvoiceForPayment } from './inboxPaymentMappingService';

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  const now = Date.now();
  return {
    id: `inv_${Math.random().toString(16).slice(2)}`,
    invoiceType: 'Rechnung',
    invoiceNo: 'RE-001',
    invoiceDate: now,
    state: 'gesendet',
    currency: 'EUR',
    companyId: 'cust_1',
    buyerName: 'Max Mustermann',
    buyerAddress: 'Musterstr. 1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment>): Payment {
  const now = Date.now();
  return {
    id: `pay_${Math.random().toString(16).slice(2)}`,
    rentalRequestId: 'vrg_1',
    kind: 'Anzahlung',
    method: 'PayPal',
    amount: 100,
    currency: 'EUR',
    receivedAt: now,
    source: 'gmail',
    createdAt: now,
    ...overrides,
  };
}

describe('inboxPaymentMappingService', () => {
  it('prioritizes open Rechnung over Auftrag/Angebot for payment suggestion', () => {
    const invoice = makeInvoice({ id: 'inv_re', invoiceType: 'Rechnung', state: 'gesendet', invoiceNo: 'RE-10' });
    const order = makeInvoice({ id: 'inv_au', invoiceType: 'Auftrag', state: 'angenommen', invoiceNo: 'AU-5' });
    const offer = makeInvoice({ id: 'inv_an', invoiceType: 'Angebot', state: 'gesendet', invoiceNo: 'AN-9' });

    const suggested = pickSuggestedInvoiceForPayment([offer, order, invoice]);
    expect(suggested?.id).toBe('inv_re');
  });

  it('builds thread assignments with invoice labels', () => {
    const invoice = makeInvoice({ id: 'inv_1', invoiceNo: 'RE-2026-001' });
    const payments: Payment[] = [
      makePayment({ id: 'pay_1', gmailThreadId: 'thr_1', invoiceId: 'inv_1', amount: 250 }),
      makePayment({ id: 'pay_2', gmailThreadId: 'thr_2', amount: 99 }),
    ];

    const map = buildThreadPaymentAssignments(payments, [invoice], ['thr_1', 'thr_2']);
    expect(map.thr_1?.invoiceNo).toBe('RE-2026-001');
    expect(map.thr_1?.amount).toBe(250);
    expect(map.thr_2?.invoiceNo).toBeUndefined();
  });

  it('uses newest payment when multiple payments exist for one thread', () => {
    const old = makePayment({ id: 'pay_old', gmailThreadId: 'thr_x', amount: 10, receivedAt: 1000, createdAt: 1000 });
    const latest = makePayment({ id: 'pay_new', gmailThreadId: 'thr_x', amount: 20, receivedAt: 2000, createdAt: 2000 });

    const map = buildThreadPaymentAssignments([old, latest], [], ['thr_x']);
    expect(map.thr_x?.amount).toBe(20);
  });
});
