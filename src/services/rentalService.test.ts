import { describe, expect, it } from 'vitest';
import type { RentalRequest } from '../types';
import {
  calculateMissingInfo,
  getRoofRackBundleSuggestions,
  validateRoofRackAssignment,
} from './rentalService';

function baseRental(overrides: Partial<RentalRequest> = {}): RentalRequest {
  return {
    id: '20260219-01',
    customerId: 'cust_1',
    productType: 'Dachbox XL',
    status: 'neu',
    rentalStart: new Date('2026-07-01').getTime(),
    rentalEnd: new Date('2026-07-08').getTime(),
    includeRoofRack: true,
    vehicleMake: 'VW',
    vehicleModel: 'Passat',
    relingType: 'offen',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('rentalService roof-rack bundle rules', () => {
  it('suggests both valid Thule bundles for offene Reling with 712300 as default', () => {
    const rental = baseRental();
    const suggestions = getRoofRackBundleSuggestions(rental);
    expect(suggestions).toEqual([
      'THULE-OPEN-710410+712300',
      'THULE-OPEN-710410+712200',
    ]);
  });

  it('prefers 712200 for offene Reling when vehicle width is 1180mm or less', () => {
    const rental = baseRental({
      vehicleWidthMm: 1180,
    });
    const suggestions = getRoofRackBundleSuggestions(rental);
    expect(suggestions).toEqual([
      'THULE-OPEN-710410+712200',
      'THULE-OPEN-710410+712300',
    ]);
  });

  it('accepts alias key with 753 + 712300 for offene Reling', () => {
    const rental = baseRental({
      roofRackInventoryKey: 'thule-open-753 + 712300',
    });
    const result = validateRoofRackAssignment(rental);
    expect(result.ok).toBe(true);
  });

  it('rejects offene Reling key without required foot+bar combination', () => {
    const rental = baseRental({
      roofRackInventoryKey: 'THULE-OPEN-712300',
    });
    const result = validateRoofRackAssignment(rental);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Offene Reling');
  });

  it('marks Dachträger-Bundle as missing when no manual Dachträger-Bundle is set', () => {
    const rental = baseRental({
      roofRackInventoryKey: undefined,
    });
    const missing = calculateMissingInfo(rental);
    expect(missing).toContain('Dachträger-Bundle');
  });
});
