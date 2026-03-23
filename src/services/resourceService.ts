import type { Resource } from '../types';
import { addResource, deleteResource, getAllResources, updateResource } from './sqliteService';
import { WEBSITE_RESOURCE_DEFAULTS } from '../config/websiteCatalog';

export async function fetchAllResources(): Promise<Resource[]> {
  return getAllResources();
}

export async function createResource(resource: Resource): Promise<void> {
  return addResource(resource);
}

export async function modifyResource(id: string, updates: Partial<Resource>): Promise<void> {
  return updateResource(id, updates);
}

export async function removeResource(id: string): Promise<void> {
  return deleteResource(id);
}

export async function initializeDefaultResources(): Promise<void> {
  const existing = await getAllResources();
  if (existing.length > 0) return;

  const now = Date.now();
  for (const def of WEBSITE_RESOURCE_DEFAULTS) {
    const idSafe = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const res: Resource = {
      id: `resource_${now}_${idSafe}`,
      name: def.name,
      type: def.type,
      googleCalendarId: def.googleCalendarId,
      isActive: true,
      createdAt: now,
      dailyRate: def.dailyRate,
      deposit: def.deposit,
    };
    await addResource(res);
  }
}

export async function findFirstActiveResourceForType(type: Resource['type']): Promise<Resource | null> {
  const all = await getAllResources();
  return all.find((r) => r.type === type && r.isActive) ?? null;
}

export async function findActiveResourcesForType(type: Resource['type']): Promise<Resource[]> {
  const all = await getAllResources();
  return all.filter((r) => r.type === type && r.isActive);
}

function normalizeKey(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

export async function syncWebsiteDefaults(opts?: { overwrite?: boolean }): Promise<{ created: number; updated: number }> {
  const overwrite = Boolean(opts?.overwrite);
  const now = Date.now();

  const all = await getAllResources();
  const byNormName = new Map<string, Resource>();
  for (const r of all) {
    const key = normalizeKey(r.name);
    if (!key) continue;
    // Keep first; duplicates are handled manually in UI.
    if (!byNormName.has(key)) byNormName.set(key, r);
  }

  let created = 0;
  let updated = 0;

  for (const def of WEBSITE_RESOURCE_DEFAULTS) {
    const key = normalizeKey(def.name);
    const match = key ? byNormName.get(key) : undefined;

    if (!match) {
      const idSafe = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      await addResource({
        id: `resource_${now}_${idSafe}_${created + 1}`,
        name: def.name,
        type: def.type,
        googleCalendarId: def.googleCalendarId,
        isActive: true,
        createdAt: now,
        dailyRate: def.dailyRate,
        deposit: def.deposit,
      });
      created += 1;
      continue;
    }

    const updates: Partial<Resource> = {};
    if (overwrite || !match.googleCalendarId) updates.googleCalendarId = def.googleCalendarId;
    if (overwrite || !match.dailyRate) updates.dailyRate = def.dailyRate;
    if (overwrite || !match.deposit) updates.deposit = def.deposit;

    if (Object.keys(updates).length > 0) {
      await updateResource(match.id, updates);
      updated += 1;
    }
  }

  return { created, updated };
}
