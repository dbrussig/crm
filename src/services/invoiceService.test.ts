import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../types';

const mocks = vi.hoisted(() => ({
  getAllInvoicesMock: vi.fn(),
  getInvoiceItemsMock: vi.fn(),
  addInvoiceMock: vi.fn(),
  updateInvoiceMock: vi.fn(),
  deleteInvoiceMock: vi.fn(),
}));

vi.mock('./sqliteService', () => ({
  getAllInvoices: mocks.getAllInvoicesMock,
  getInvoiceItems: mocks.getInvoiceItemsMock,
  addInvoice: mocks.addInvoiceMock,
  updateInvoice: mocks.updateInvoiceMock,
  deleteInvoice: mocks.deleteInvoiceMock,
}));

import { createFollowUpInvoiceFromInvoice } from './invoiceService';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = Date.now();
  return {
    id: 'inv_source',
    invoiceType: 'Angebot',
    invoiceNo: 'AN-2026-034',
    invoiceDate: now,
    state: 'gesendet',
    currency: 'EUR',
    companyId: 'cust_1',
    buyerName: 'Testkunde',
    buyerAddress: 'Musterstr. 1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Invoice;
}

describe('createFollowUpInvoiceFromInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllInvoicesMock.mockResolvedValue([makeInvoice()]);
    mocks.getInvoiceItemsMock.mockResolvedValue([]);
    mocks.addInvoiceMock.mockResolvedValue(undefined);
    mocks.updateInvoiceMock.mockResolvedValue(undefined);
    mocks.deleteInvoiceMock.mockResolvedValue(undefined);
  });

  it('keeps source sequence for Angebot -> Auftrag', async () => {
    await createFollowUpInvoiceFromInvoice('inv_source', 'Auftrag');

    const created: Invoice = mocks.addInvoiceMock.mock.calls[0][0];
    expect(created.invoiceNo).toBe('AU-2026-034');
  });

  it('keeps source sequence for Angebot -> Rechnung', async () => {
    await createFollowUpInvoiceFromInvoice('inv_source', 'Rechnung');

    const created: Invoice = mocks.addInvoiceMock.mock.calls[0][0];
    expect(created.invoiceNo).toBe('RE-2026-034');
  });

  it('falls back to generated number if source number cannot be derived', async () => {
    mocks.getAllInvoicesMock.mockResolvedValue([makeInvoice({ invoiceNo: 'CUSTOM-99' })]);

    await createFollowUpInvoiceFromInvoice('inv_source', 'Auftrag');

    const created: Invoice = mocks.addInvoiceMock.mock.calls[0][0];
    expect(created.invoiceNo).toMatch(/^AU-\d{4}-\d{3,}$/);
  });

  it('reuses existing follow-up if source already has matching replacement', async () => {
    const source = makeInvoice({ replacesInvoiceId: 'inv_order_1' });
    const existingOrder = makeInvoice({
      id: 'inv_order_1',
      invoiceType: 'Auftrag',
      invoiceNo: 'AU-2026-034',
    });
    mocks.getAllInvoicesMock.mockResolvedValue([source, existingOrder]);

    const id = await createFollowUpInvoiceFromInvoice('inv_source', 'Auftrag');

    expect(id).toBe('inv_order_1');
    expect(mocks.addInvoiceMock).not.toHaveBeenCalled();
  });
});
