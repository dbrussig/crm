import type { RentalAccessory } from '../types';
import { addAccessory, deleteAccessory, getAllAccessories, updateAccessory } from './sqliteService';

export async function fetchAllAccessories(): Promise<RentalAccessory[]> {
  return getAllAccessories();
}

export async function createAccessory(accessory: RentalAccessory): Promise<void> {
  return addAccessory(accessory);
}

export async function modifyAccessory(id: string, updates: Partial<RentalAccessory>): Promise<void> {
  return updateAccessory(id, updates);
}

export async function removeAccessory(id: string): Promise<void> {
  return deleteAccessory(id);
}

