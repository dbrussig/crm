/**
 * Rental ID Service
 *
 * Generiert menschenlesbare Anfrage-IDs (Vorgangs-IDs) im Format:
 *   YYYYMMDD-NN (z.B. 20260218-01, 20260218-02, ...)
 *
 * Wichtig:
 * - Dieser Nummernkreis ist NUR fuer Vorgangs-/Anfrage-IDs (Rentals) gedacht.
 * - Unabhaengig von Angebot/Auftrag/Rechnung.
 * - Sequenz wird pro Tag (YYYYMMDD) in localStorage gespeichert.
 */

const STORAGE_KEY_PREFIX = 'mietpark_rental_req_seq_';

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Generiert eine neue Anfrage-ID basierend auf dem Anfrage-Datum
 * und einer fortlaufenden Nummer (pro Tag).
 *
 * Format: YYYYMMDD-NN (z.B. 20260218-01, 20260218-02, ...)
 *
 * @param date Optional: Das Anfrage-Datum. Default: heute.
 * @returns Die generierte Rental ID
 */
export async function generateRentalId(date: Date = new Date()): Promise<string> {
  const key = formatDateKey(date);
  const sequence = await getNextSequence(key);
  return `${key}-${String(sequence).padStart(2, '0')}`;
}

/**
 * Holt die nächste Sequenz-Nummer fuer den angegebenen Tag (YYYYMMDD).
 * Die Sequenz wird in localStorage gespeichert und bei jedem Aufruf
 * um 1 erhöht.
 *
 * @param dayKey Das Datum als Key (YYYYMMDD)
 * @returns Die nächste Sequenz-Nummer
 */
export async function getNextSequence(dayKey: string): Promise<number> {
  const key = `${STORAGE_KEY_PREFIX}${dayKey}`;
  const current = localStorage.getItem(key);
  const next = current ? parseInt(current, 10) + 1 : 1;
  localStorage.setItem(key, next.toString());
  return next;
}

/**
 * Setzt die Sequenz fuer einen Tag auf einen bestimmten Wert.
 * Nur für Testzwecke oder Migrationen gedacht.
 *
 * @param dayKey Das Datum als Key (YYYYMMDD)
 * @param sequence Die neue Sequenz-Nummer
 */
export function setSequence(dayKey: string, sequence: number): void {
  const key = `${STORAGE_KEY_PREFIX}${dayKey}`;
  localStorage.setItem(key, sequence.toString());
}

/**
 * Holt die aktuelle Sequenz fuer einen Tag ohne sie zu erhoehen.
 *
 * @param dayKey Das Datum als Key (YYYYMMDD)
 * @returns Die aktuelle Sequenz-Nummer oder 0 wenn nicht gesetzt
 */
export function getCurrentSequence(dayKey: string): number {
  const key = `${STORAGE_KEY_PREFIX}${dayKey}`;
  const current = localStorage.getItem(key);
  return current ? parseInt(current, 10) : 0;
}

/**
 * Extrahiert das Datum (YYYYMMDD) aus einer Anfrage-ID.
 *
 * @param rentalId Die Anfrage-ID (z.B. "20260218-01")
 * @returns YYYYMMDD oder null wenn das Format ungueltig ist
 */
export function extractDayKeyFromRentalId(rentalId: string): string | null {
  const match = rentalId.match(/^(\d{8})-\d{2}$/);
  return match ? match[1] : null;
}

/**
 * Extrahiert die Sequenz-Nummer aus einer Rental ID.
 *
 * @param rentalId Die Anfrage-ID (z.B. "20260218-01")
 * @returns Die Sequenz-Nummer oder null wenn das Format ungültig ist
 */
export function extractSequenceFromRentalId(rentalId: string): number | null {
  const match = rentalId.match(/^\d{8}-(\d{2})$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Prüft ob eine Rental ID dem erwarteten Format entspricht.
 *
 * @param rentalId Die zu prüfende Rental ID
 * @returns true wenn das Format gültig ist, sonst false
 */
export function isValidRentalId(rentalId: string): boolean {
  return /^\d{8}-\d{2}$/.test(rentalId);
}

/**
 * Prüft ob eine Rental ID ein Legacy-Format hat.
 * Legacy-Formate:
 * - rental_1234567890 (altes CRM-Format)
 * - 2026-001 (frueheres menschenlesbares Jahresformat)
 * - UUID v4 (crypto.randomUUID())
 *
 * @param rentalId Die zu prüfende Rental ID
 * @returns true wenn es eine UUID ist, sonst false
 */
export function isLegacyRentalId(rentalId: string): boolean {
  // Prüft auf "rental_" Prefix mit Zahlen (altes CRM-Format)
  if (/^rental_\d+$/.test(rentalId)) return true;

  // Frueheres Format: YYYY-NNN
  if (/^\d{4}-\d{3}$/.test(rentalId)) return true;

  // Prüft auf UUID Format (v4 UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(rentalId);
}
