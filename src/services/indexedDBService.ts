import { loadJson } from './_storage';
import type { Customer } from '../types';

export async function getDatabaseStats(): Promise<{ customerCount: number; dbSize: number }> {
  const customers = await loadJson<Customer[]>('mietpark_crm_customers_v1', []);
  // Approximate size by JSON serialization length (IndexedDB does not expose exact bytes).
  const raw = JSON.stringify(customers);
  return {
    customerCount: customers.length,
    dbSize: raw.length,
  };
}
