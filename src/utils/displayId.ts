export function formatDisplayRef(id: string | null | undefined, prefix = 'VRG'): string {
  const raw = String(id || '').trim();
  if (!raw) return `${prefix}-UNBEKANNT`;
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const shortPart = (compact || raw.toUpperCase()).slice(-8);
  return `${prefix}-${shortPart}`;
}
