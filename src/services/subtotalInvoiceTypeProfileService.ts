import type { InvoiceType, SubTotalInvoiceTypeProfile } from '../types';

const KEY = 'mietpark_subtotal_invoice_type_profiles_v1';
const KEY_ENABLED = 'mietpark_subtotal_invoice_type_profiles_enabled_v1';
const KEY_MAPPING = 'mietpark_subtotal_invoice_type_profiles_mapping_v1';

export function isSubTotalInvoiceTypeProfilesEnabled(): boolean {
  const raw = localStorage.getItem(KEY_ENABLED);
  if (raw === null) return true;
  return raw === 'true';
}

export function setSubTotalInvoiceTypeProfilesEnabled(enabled: boolean) {
  localStorage.setItem(KEY_ENABLED, String(Boolean(enabled)));
}

export function getSubTotalInvoiceTypeProfiles(): SubTotalInvoiceTypeProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SubTotalInvoiceTypeProfile[];
  } catch {
    return [];
  }
}

export function saveSubTotalInvoiceTypeProfiles(profiles: SubTotalInvoiceTypeProfile[]) {
  localStorage.setItem(KEY, JSON.stringify(profiles || []));
}

export function getSubTotalInvoiceTypeMapping(): Record<InvoiceType, number | null> {
  try {
    const raw = localStorage.getItem(KEY_MAPPING);
    if (!raw) return { Angebot: null, Auftrag: null, Rechnung: null };
    const parsed = JSON.parse(raw) as any;
    return {
      Angebot: typeof parsed?.Angebot === 'number' ? parsed.Angebot : null,
      Auftrag: typeof parsed?.Auftrag === 'number' ? parsed.Auftrag : null,
      Rechnung: typeof parsed?.Rechnung === 'number' ? parsed.Rechnung : null,
    };
  } catch {
    return { Angebot: null, Auftrag: null, Rechnung: null };
  }
}

export function saveSubTotalInvoiceTypeMapping(mapping: Record<InvoiceType, number | null>) {
  localStorage.setItem(KEY_MAPPING, JSON.stringify(mapping));
}

function scoreProfileForType(profile: SubTotalInvoiceTypeProfile, type: InvoiceType): number {
  const n = (profile.name || '').toLowerCase();
  if (type === 'Angebot') return n.includes('angebot') ? 10 : 0;
  if (type === 'Auftrag') return n.includes('auftrag') ? 10 : 0;
  // Rechnung: prefer exact Rechnung over "Rechnung mit Verrechnung"
  if (n === 'rechnung') return 12;
  if (n.includes('rechnung')) return 9;
  return 0;
}

export function getActiveSubTotalInvoiceTypeProfile(type: InvoiceType): SubTotalInvoiceTypeProfile | null {
  if (!isSubTotalInvoiceTypeProfilesEnabled()) return null;
  const profiles = getSubTotalInvoiceTypeProfiles();

  const mapping = getSubTotalInvoiceTypeMapping();
  const mappedId = mapping[type];
  if (typeof mappedId === 'number') {
    const picked = profiles.find((p) => p.invoiceTypeId === mappedId);
    if (picked) return picked;
  }

  let best: SubTotalInvoiceTypeProfile | null = null;
  let bestScore = 0;
  for (const p of profiles) {
    const s = scoreProfileForType(p, type);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}
