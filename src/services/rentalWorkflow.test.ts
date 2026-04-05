import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer, RentalRequest } from '../types';

const {
  getRentalRequestMock,
  getCustomerByIdMock,
  updateRentalRequestMock,
  createEventLegacyMock,
} = vi.hoisted(() => ({
  getRentalRequestMock: vi.fn(),
  getCustomerByIdMock: vi.fn(),
  updateRentalRequestMock: vi.fn(),
  createEventLegacyMock: vi.fn(),
}));

vi.mock('./sqliteService', () => ({
  addRentalRequest: vi.fn(),
  getAllRentalRequests: vi.fn(),
  getCustomerById: getCustomerByIdMock,
  getRentalRequest: getRentalRequestMock,
  updateRentalRequest: updateRentalRequestMock,
}));

vi.mock('./googleCalendarService', () => ({
  createEventLegacy: createEventLegacyMock,
  deleteEventLegacy: vi.fn(),
}));

import { transitionStatus } from './rentalService';

function makeRental(overrides: Partial<RentalRequest> = {}): RentalRequest {
  return {
    id: 'vrg_test_001',
    customerId: 'cust_test_001',
    productType: 'Dachbox XL',
    status: 'angebot_gesendet',
    rentalStart: new Date('2026-04-10T00:00:00').getTime(),
    rentalEnd: new Date('2026-04-13T00:00:00').getTime(),
    pickupDate: new Date('2026-04-10T10:00:00').getTime(),
    returnDate: new Date('2026-04-13T18:00:00').getTime(),
    googleCalendarId: 'test-calendar@example.com',
    includeRoofRack: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_test_001',
    firstName: 'Test',
    lastName: 'Kunde',
    email: 'testkunde@example.com',
    phone: '+49 000 000000',
    address: {
      street: 'Teststraße 1',
      city: 'Homburg',
      zipCode: '66424',
      country: 'Deutschland',
    },
    contactDate: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('rental workflow with test customer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses pickup/return timestamps for calendar event when moving to angenommen', async () => {
    const rental = makeRental();
    const customer = makeCustomer();

    getRentalRequestMock.mockResolvedValue(rental);
    getCustomerByIdMock.mockResolvedValue(customer);
    createEventLegacyMock.mockResolvedValue('evt_123');
    updateRentalRequestMock.mockResolvedValue(undefined);

    await transitionStatus(rental.id, 'angenommen');

    expect(createEventLegacyMock).toHaveBeenCalledTimes(1);
    const createCall = createEventLegacyMock.mock.calls[0];
    expect(createCall[0]).toBe(rental.googleCalendarId);
    expect(createCall[1].start).toBeInstanceOf(Date);
    expect(createCall[1].end).toBeInstanceOf(Date);
    expect(createCall[1].start.getTime()).toBe(rental.pickupDate);
    expect(createCall[1].end.getTime()).toBe(rental.returnDate);

    expect(updateRentalRequestMock).toHaveBeenCalledWith(
      rental.id,
      expect.objectContaining({
        status: 'angenommen',
        googleEventId: 'evt_123',
      })
    );
  });
});
