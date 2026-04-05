import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, Payment } from '../types';
import { buildThreadPaymentAssignments } from './inboxPaymentMappingService';

const storage = vi.hoisted(() => new Map<string, unknown>());

vi.mock('./_storage', () => ({
  loadJson: vi.fn(async (key: string, defaultValue: unknown) => {
    return storage.has(key) ? structuredClone(storage.get(key)) : defaultValue;
  }),
  saveJson: vi.fn(async (key: string, value: unknown) => {
    storage.set(key, structuredClone(value));
  }),
  deleteKey: vi.fn(async (key: string) => {
    storage.delete(key);
  }),
}));

vi.mock('./idbKv', () => ({
  idbGet: vi.fn(async () => undefined),
  idbSet: vi.fn(async () => undefined),
}));

vi.mock('../platform/runtime', () => ({
  isDesktopApp: vi.fn(() => false),
  invokeDesktopCommand: vi.fn(async () => {
    throw new Error('invokeDesktopCommand should not be used in this test');
  }),
}));

import {
  addPayment,
  addInvoice,
  assignPaymentToInvoice,
  getAllInvoices,
  getAllPayments,
  getPaymentsByInvoice,
  getPaymentsByRental,
} from './sqliteService';

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: `pay_${Math.random().toString(16).slice(2)}`,
    rentalRequestId: 'vrg_1',
    customerId: 'cust_1',
    kind: 'Anzahlung',
    method: 'PayPal',
    amount: 100,
    currency: 'EUR',
    receivedAt: Date.now(),
    source: 'manual',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = Date.now();
  return {
    id: `inv_${Math.random().toString(16).slice(2)}`,
    invoiceType: 'Rechnung',
    invoiceNo: 'RE-001',
    invoiceDate: now,
    state: 'gesendet',
    currency: 'EUR',
    companyId: 'cust_1',
    buyerName: 'Test Kunde',
    buyerAddress: 'Musterstr. 1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('payment -> invoice mapping', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('assigns a payment to an invoice and can query by invoice', async () => {
    const payment = makePayment({ id: 'pay_1', rentalRequestId: 'vrg_alpha' });
    await addPayment(payment);

    await assignPaymentToInvoice(payment.id, 'inv_1');

    const byInvoice = await getPaymentsByInvoice('inv_1');
    expect(byInvoice).toHaveLength(1);
    expect(byInvoice[0].id).toBe(payment.id);
    expect(byInvoice[0].invoiceId).toBe('inv_1');
  });

  it('reassigns payment to another invoice and clears old mapping', async () => {
    const payment = makePayment({ id: 'pay_2', rentalRequestId: 'vrg_beta' });
    await addPayment(payment);
    await assignPaymentToInvoice(payment.id, 'inv_old');
    await assignPaymentToInvoice(payment.id, 'inv_new');

    const oldInvoice = await getPaymentsByInvoice('inv_old');
    const newInvoice = await getPaymentsByInvoice('inv_new');

    expect(oldInvoice).toHaveLength(0);
    expect(newInvoice).toHaveLength(1);
    expect(newInvoice[0].id).toBe(payment.id);
  });

  it('removes invoice mapping when assigned with undefined', async () => {
    const payment = makePayment({ id: 'pay_3', rentalRequestId: 'vrg_gamma' });
    await addPayment(payment);
    await assignPaymentToInvoice(payment.id, 'inv_drop');
    await assignPaymentToInvoice(payment.id, undefined);

    const byInvoice = await getPaymentsByInvoice('inv_drop');
    expect(byInvoice).toHaveLength(0);

    const byRental = await getPaymentsByRental('vrg_gamma');
    expect(byRental).toHaveLength(1);
    expect(byRental[0].invoiceId).toBeUndefined();
  });

  it('updates existing payment on same id (no duplicate rows)', async () => {
    const original = makePayment({ id: 'pay_4', amount: 50, rentalRequestId: 'vrg_dup' });
    await addPayment(original);
    await addPayment({ ...original, amount: 75, note: 'updated' });

    const byRental = await getPaymentsByRental('vrg_dup');
    expect(byRental).toHaveLength(1);
    expect(byRental[0].amount).toBe(75);
    expect(byRental[0].note).toBe('updated');
  });

  it('throws for assigning unknown payment id', async () => {
    await expect(assignPaymentToInvoice('missing_payment', 'inv_x')).rejects.toThrow('Zahlung nicht gefunden');
  });

  it('covers inbox flow: persisted payment+invoice maps back to thread assignment', async () => {
    const invoice = makeInvoice({ id: 'inv_flow', invoiceNo: 'RE-FLOW-1' });
    await addInvoice(invoice, []);
    await addPayment(
      makePayment({
        id: 'pay_flow',
        rentalRequestId: 'vrg_flow',
        invoiceId: 'inv_flow',
        gmailThreadId: 'thr_flow',
        amount: 199.5,
      })
    );

    const [payments, invoices] = await Promise.all([getAllPayments(), getAllInvoices()]);
    const map = buildThreadPaymentAssignments(payments, invoices, ['thr_flow']);

    expect(map.thr_flow).toBeTruthy();
    expect(map.thr_flow.amount).toBe(199.5);
    expect(map.thr_flow.invoiceNo).toBe('RE-FLOW-1');
  });
});
