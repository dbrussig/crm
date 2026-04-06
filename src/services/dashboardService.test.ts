import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, InvoiceItem, Payment } from '../types';

const { fetchAllInvoicesMock, getAllPaymentsMock, getInvoiceItemsMock } = vi.hoisted(() => ({
  fetchAllInvoicesMock: vi.fn(),
  getAllPaymentsMock: vi.fn(),
  getInvoiceItemsMock: vi.fn(),
}));

vi.mock('./invoiceService', () => ({
  fetchAllInvoices: fetchAllInvoicesMock,
}));

vi.mock('./sqliteService', () => ({
  getAllPayments: getAllPaymentsMock,
  getInvoiceItems: getInvoiceItemsMock,
}));

import { getDashboardFinancials } from './dashboardService';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = Date.now();
  return {
    id: 'inv_default',
    invoiceType: 'Rechnung',
    invoiceNo: 'RE-001',
    invoiceDate: now,
    dueDate: now,
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

function makeItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  const now = Date.now();
  return {
    id: 'item_default',
    invoiceId: 'inv_default',
    orderIndex: 0,
    name: 'Miete',
    unit: 'Tag',
    unitPrice: 100,
    quantity: 1,
    taxPercent: 19,
    createdAt: now,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  const now = Date.now();
  return {
    id: 'pay_default',
    rentalRequestId: 'vrg_1',
    kind: 'Zahlung',
    method: 'Ueberweisung',
    amount: 100,
    currency: 'EUR',
    receivedAt: now,
    source: 'manual',
    createdAt: now,
    ...overrides,
  };
}

describe('getDashboardFinancials', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T12:00:00.000Z'));
    vi.clearAllMocks();
    fetchAllInvoicesMock.mockResolvedValue([]);
    getAllPaymentsMock.mockResolvedValue([]);
    getInvoiceItemsMock.mockResolvedValue([]);
  });

  it('calculates invoice gross with VAT from items', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_vat', dueDate: new Date('2026-04-04T00:00:00.000Z').getTime() }),
    ]);
    getInvoiceItemsMock.mockImplementation(async (invoiceId: string) => {
      if (invoiceId === 'inv_vat') {
        return [makeItem({ invoiceId, unitPrice: 100, quantity: 2, taxPercent: 19 })];
      }
      return [];
    });

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(238);
    expect(result.ueberfaelligeRechnungen).toHaveLength(1);
    expect(result.ueberfaelligeRechnungen[0].gesamtBetrag).toBe(238);
  });

  it('subtracts assigned payments from open claims', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_open', dueDate: new Date('2026-04-04T00:00:00.000Z').getTime() }),
    ]);
    getInvoiceItemsMock.mockResolvedValue([makeItem({ invoiceId: 'inv_open', unitPrice: 100, quantity: 2, taxPercent: 19 })]);
    getAllPaymentsMock.mockResolvedValue([
      makePayment({ id: 'pay_1', invoiceId: 'inv_open', amount: 50 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(188);
    expect(result.ueberfaelligeRechnungen[0].offenBetrag).toBe(188);
  });

  it('caps open amount at zero when invoice is fully paid', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_paid', dueDate: new Date('2026-04-01T00:00:00.000Z').getTime() }),
    ]);
    getInvoiceItemsMock.mockResolvedValue([makeItem({ invoiceId: 'inv_paid', unitPrice: 100, quantity: 1, taxPercent: 19 })]);
    getAllPaymentsMock.mockResolvedValue([
      makePayment({ id: 'pay_paid', invoiceId: 'inv_paid', amount: 200 }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
    expect(result.ueberfaelligeRechnungen).toHaveLength(0);
  });

  it('ignores non-invoice document types', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_offer', invoiceType: 'Angebot' }),
      makeInvoice({ id: 'inv_order', invoiceType: 'Auftrag' }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
    expect(getInvoiceItemsMock).not.toHaveBeenCalled();
  });

  it('ignores archived and canceled invoices', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_archived', state: 'archiviert' }),
      makeInvoice({ id: 'inv_canceled', state: 'storniert' }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.offeneForderungen).toBe(0);
    expect(getInvoiceItemsMock).not.toHaveBeenCalled();
  });

  it('calculates monthly revenue only for payments in current month', async () => {
    getAllPaymentsMock.mockResolvedValue([
      makePayment({ id: 'pay_april_1', amount: 100, receivedAt: new Date('2026-04-01T08:00:00.000Z').getTime() }),
      makePayment({ id: 'pay_april_2', amount: 40, receivedAt: new Date('2026-04-06T09:00:00.000Z').getTime() }),
      makePayment({ id: 'pay_march', amount: 999, receivedAt: new Date('2026-03-31T20:00:00.000Z').getTime() }),
    ]);

    const result = await getDashboardFinancials();

    expect(result.monatsumsatz).toBe(140);
  });

  it('lists only overdue invoices with remaining amount', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_overdue', dueDate: new Date('2026-04-04T00:00:00.000Z').getTime() }),
      makeInvoice({ id: 'inv_future', dueDate: new Date('2026-04-10T00:00:00.000Z').getTime() }),
    ]);
    getInvoiceItemsMock.mockImplementation(async (invoiceId: string) => {
      if (invoiceId === 'inv_overdue') return [makeItem({ invoiceId, unitPrice: 100, quantity: 1, taxPercent: 19 })];
      if (invoiceId === 'inv_future') return [makeItem({ invoiceId, unitPrice: 200, quantity: 1, taxPercent: 19 })];
      return [];
    });

    const result = await getDashboardFinancials();

    expect(result.ueberfaelligeRechnungen).toHaveLength(1);
    expect(result.ueberfaelligeRechnungen[0].invoice.id).toBe('inv_overdue');
  });

  it('adds daysOverdue for overdue entries', async () => {
    fetchAllInvoicesMock.mockResolvedValue([
      makeInvoice({ id: 'inv_days', dueDate: new Date('2026-04-02T00:00:00.000Z').getTime() }),
    ]);
    getInvoiceItemsMock.mockResolvedValue([makeItem({ invoiceId: 'inv_days', unitPrice: 119, quantity: 1, taxPercent: 0 })]);

    const result = await getDashboardFinancials();

    expect(result.ueberfaelligeRechnungen).toHaveLength(1);
    expect(result.ueberfaelligeRechnungen[0].daysOverdue).toBe(3);
  });
});
