import type { ProductSuggestion } from '../types';
import type { Salutation } from '../types';

export function detectDachboxRejectionReason(text: string): {
  shouldReject: boolean;
  reason?: string;
  type?: 'keine_reling' | 'fixpunkte';
} {
  const src = String(text || '');
  if (!src.trim()) return { shouldReject: false };

  const hasNoReling =
    /\bohne\s+(?:dach)?reling\b/i.test(src) ||
    /\bkeine\s+(?:dach)?reling\b/i.test(src) ||
    /\bohne\s+reling\b/i.test(src);
  if (hasNoReling) {
    return {
      shouldReject: true,
      type: 'keine_reling',
      reason: 'Anfrage enthält „ohne/keine Reling“ (Dachbox nicht kompatibel).',
    };
  }

  const hasFixpunkteOnly =
    /\bnur\s+fixpunkte?\b/i.test(src) ||
    /\bfixpunkte?\b/i.test(src) ||
    /\bnormales?\s+dach\b/i.test(src);
  if (hasFixpunkteOnly) {
    return {
      shouldReject: true,
      type: 'fixpunkte',
      reason: 'Anfrage enthält Fixpunkte/Normdach ohne Reling (Dachbox-Setup ablehnen).',
    };
  }

  return { shouldReject: false };
}

export function suggestProductFromMessage(text: string): ProductSuggestion | null {
  const lower = text.toLowerCase();
  const hasOfferOrderInvoiceHint = /\b(angebot|auftragsbest[aä]tigung|auftrag|rechnung)\b/i.test(text);
  const isPaymentMail =
    /du hast eine zahlung erhalten/i.test(text) ||
    /service@paypal\./i.test(text) ||
    /\bpaypal\b/i.test(text) ||
    /\btransaktions(?:id|nummer|code)\b/i.test(text) ||
    /\bhat dir\b.*(?:€|eur)\b/i.test(text);
  const hasRoofRackHints =
    /dachtr(a|ä)ger|grundtr(a|ä)ger|grundtraeger|quertr(a|ä)ger|traverse|traversen|relingtr(a|ä)ger/i.test(text);
  const roofRackOnly =
    hasRoofRackHints && /\b(einzeln|nur|ohne\s+dachbox|separat)\b/i.test(text);

  const score = (keywords: string[]) => keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);

  // Direct hits
  if (/(heckbox|anhängerkupplung|ahk)/i.test(text) && /(heck|hinten|box)/i.test(text)) {
    return { productType: 'Heckbox', confidence: 0.9, reason: 'Erwähnung Heckbox/AHK' };
  }
  if (/(fahrrad|bike|räder|raeder)/i.test(text)) {
    return { productType: 'Fahrradträger', confidence: 0.9, reason: 'Erwähnung Fahrrad/Bike' };
  }
  if (/(hüpfburg|huepfburg|hüpfhaus|huepfhaus)/i.test(text)) {
    return { productType: 'Hüpfburg', confidence: 0.95, reason: 'Erwähnung Hüpfburg' };
  }
  if (hasRoofRackHints && /(fahrrad|bike|räder|raeder)/i.test(text)) {
    return { productType: 'Fahrradträger', confidence: 0.82, reason: 'Dachträger + Fahrrad erkannt' };
  }
  if (roofRackOnly) {
    return {
      productType: 'Dachbox XL',
      confidence: 0.45,
      alternativeProductType: 'Dachbox M',
      reason: 'Dachträger einzeln erkannt (manuelle Zuordnung nötig)',
    };
  }
  if (hasRoofRackHints) {
    return {
      productType: 'Dachbox XL',
      confidence: 0.7,
      alternativeProductType: 'Dachbox M',
      reason: 'Dachträger erwähnt (typisch in Kombination mit Dachbox)',
    };
  }

  const xl = score(['ski', 'skier', 'snowboard', 'camping', 'urlaub', 'viel gepäck', 'kinderwagen', 'dachbox groß', 'dachbox xl']);
  const m = score(['wochenende', 'städtetrip', 'kurztrip', 'dachbox klein', 'dachbox m']);

  if (xl === 0 && m === 0) {
    if (hasOfferOrderInvoiceHint) {
      // Beleg-/Auftragsmails haben oft keinen klaren Produkttext im Body.
      if (/\bheckbox|ahk|anhängerkupplung\b/i.test(text)) {
        return { productType: 'Heckbox', confidence: 0.72, reason: 'Beleg-/Auftragsmail mit Heckbox/AHK-Hinweis' };
      }
      if (/\bfahrrad|bike|räder|raeder\b/i.test(text)) {
        return { productType: 'Fahrradträger', confidence: 0.72, reason: 'Beleg-/Auftragsmail mit Fahrrad-Hinweis' };
      }
      if (/\bhüpfburg|huepfburg\b/i.test(text)) {
        return { productType: 'Hüpfburg', confidence: 0.75, reason: 'Beleg-/Auftragsmail mit Hüpfburg-Hinweis' };
      }
    }
    if (isPaymentMail) {
      return {
        productType: 'Dachbox XL',
        confidence: 0.35,
        alternativeProductType: 'Dachbox M',
        reason: 'Zahlungsmail ohne klaren Produktbezug (bitte manuell prüfen)',
      };
    }
    return { productType: 'Dachbox XL', confidence: 0.5, reason: 'Kein klares Produkt erkannt (Default)' };
  }

  if (xl >= m) {
    const base = Math.min(0.7 + xl * 0.1, 0.95);
    const confidence = isPaymentMail ? Math.max(0.6, base - 0.1) : base;
    return { productType: 'Dachbox XL', confidence, reason: isPaymentMail ? 'Zahlungsmail mit XL-Hinweis' : 'Keywords deuten auf XL hin' };
  }

  const base = Math.min(0.7 + m * 0.1, 0.95);
  const confidence = isPaymentMail ? Math.max(0.6, base - 0.1) : base;
  return { productType: 'Dachbox M', confidence, reason: isPaymentMail ? 'Zahlungsmail mit M-Hinweis' : 'Keywords deuten auf M hin' };
}

export function extractRentalInfo(text: string): {
  rentalStart?: number;
  rentalEnd?: number;
  vehicleMake?: string;
  vehicleModel?: string;
} {
  const lower = text.toLowerCase();

  const normalizeYear = (y: number) => {
    if (y >= 1000) return y;
    return y >= 70 ? 1900 + y : 2000 + y;
  };

  const parseDate = (y: number, m: number, d: number) => {
    const year = normalizeYear(y);
    const dt = new Date(y, m - 1, d);
    dt.setFullYear(year);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  // Website form: "Zeitraum: 2026-04-02 bis 2026-04-17"
  const isoRange = /zeitr(a|ä)um:\s*(\d{4})-(\d{2})-(\d{2})\s*(?:bis|[-–—])\s*(\d{4})-(\d{2})-(\d{2})/i.exec(text);
  if (isoRange) {
    const s = parseDate(Number(isoRange[2]), Number(isoRange[3]), Number(isoRange[4]));
    const e = parseDate(Number(isoRange[5]), Number(isoRange[6]), Number(isoRange[7]));
    if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
  }

  // Generic ISO-like range without a "Zeitraum:" prefix.
  const isoRangeGeneric = /(?:vom|von)?\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*(?:bis|[-–—]|to)\s*(\d{4})-(\d{1,2})-(\d{1,2})/i.exec(text);
  if (isoRangeGeneric) {
    const s = parseDate(Number(isoRangeGeneric[1]), Number(isoRangeGeneric[2]), Number(isoRangeGeneric[3]));
    const e = parseDate(Number(isoRangeGeneric[4]), Number(isoRangeGeneric[5]), Number(isoRangeGeneric[6]));
    if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
  }

  // Robust numeric range with "." or "/" separators and 2- or 4-digit year.
  // Examples: "10.03.2026 bis 17.03.2026", "10/03/26-17/03/26", "vom 10.03.26 - 17.03.26"
  const numericRange =
    /(?:vom|von)?\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s*(?:bis|[-–—]|to)\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i.exec(text);
  if (numericRange) {
    const s = parseDate(Number(numericRange[3]), Number(numericRange[2]), Number(numericRange[1]));
    const e = parseDate(Number(numericRange[6]), Number(numericRange[5]), Number(numericRange[4]));
    if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
  }

  // "02.04.2026 - 17.04.2026" or "02.04.2026 bis 17.04.2026"
  const fullRange = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:bis|[-–—])\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(text);
  if (fullRange) {
    const s = parseDate(Number(fullRange[3]), Number(fullRange[2]), Number(fullRange[1]));
    const e = parseDate(Number(fullRange[6]), Number(fullRange[5]), Number(fullRange[4]));
    if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
  }

  // "02.04. - 17.04.2026" (year missing on start)
  const partialRange = /(\d{1,2})\.(\d{1,2})\.\s*(?:bis|[-–—])\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(text);
  if (partialRange) {
    const year = Number(partialRange[5]);
    const s = parseDate(year, Number(partialRange[2]), Number(partialRange[1]));
    const e = parseDate(year, Number(partialRange[4]), Number(partialRange[3]));
    if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
  }

  // "02.04.-17.04." (no year) - assume current year; if end < start, assume next year.
  const noYearRange = /(\d{1,2})\.(\d{1,2})\.\s*(?:bis|[-–—])\s*(\d{1,2})\.(\d{1,2})\./i.exec(text);
  if (noYearRange) {
    const now = new Date();
    let year = now.getFullYear();
    const s0 = parseDate(year, Number(noYearRange[2]), Number(noYearRange[1]));
    const e0 = parseDate(year, Number(noYearRange[4]), Number(noYearRange[3]));
    if (s0 && e0) {
      if (e0.getTime() < s0.getTime()) {
        year += 1;
        const s = parseDate(year, Number(noYearRange[2]), Number(noYearRange[1]));
        const e = parseDate(year, Number(noYearRange[4]), Number(noYearRange[3]));
        if (s && e) return { rentalStart: s.getTime(), rentalEnd: e.getTime() };
      }
      return { rentalStart: s0.getTime(), rentalEnd: e0.getTime() };
    }
  }

  // Single date: dd.mm.yyyy (fallback: assume 1 week)
  const m1 = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(lower);
  if (m1) {
    const start = parseDate(Number(m1[3]), Number(m1[2]), Number(m1[1]));
    if (start) {
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { rentalStart: start.getTime(), rentalEnd: end.getTime() };
    }
  }

  // "morgen"
  if (/\bmorgen\b/i.test(text)) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { rentalStart: start.getTime(), rentalEnd: end.getTime() };
  }

  // "nächste woche"
  if (/\bnächste woche\b/i.test(text)) {
    const today = new Date();
    const day = today.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    const start = new Date(today.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { rentalStart: start.getTime(), rentalEnd: end.getTime() };
  }

  // "wochenende"
  if (/\b(wochenende|weekend)\b/i.test(text)) {
    const today = new Date();
    const day = today.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7;
    const start = new Date(today.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
    return { rentalStart: start.getTime(), rentalEnd: end.getTime() };
  }

  // Very naive vehicle detection: "VW Golf", "BMW X3", etc.
  const vehicle = /\b(vw|volkswagen|bmw|audi|mercedes|opel|ford|skoda|seat|toyota|kia|hyundai)\s+([a-z0-9\-]+)/i.exec(text);
  const out: any = {};
  if (vehicle) {
    out.vehicleMake = vehicle[1];
    out.vehicleModel = vehicle[2];
  }
  return out;
}

export function extractCustomerInfo(text: string): {
  name?: string;
  salutation?: Salutation;
  firstName?: string;
  lastName?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  email?: string;
  phone?: string;
  address?: { street?: string; zipCode?: string; city?: string; country?: string };
} {
  const OWN_DOMAINS = ['mietpark-saar-pfalz.com', 'mietpark-saar-pfalz.de'];
  const OWN_PHONE_NUMBERS = [
    '+49 173 7615995',
    '+49 6841 9800622',
    '01737615995',
    '068419800622',
    '+491737615995',
    '06841 9800622',
    '0151 0000000', // Testnummer, auch ausschließen
  ];

  const normalizedText = text.replace(/\u00a0/g, ' ');

  const allEmails = Array.from(normalizedText.matchAll(/[^\s@<>\[\]()]+@[^\s@<>\[\]()]+\.[^\s@<>\[\]()]+/g))
    .map((m) => m[0])
    .filter(Boolean);

  const isOwn = (email: string) => {
    const lower = email.toLowerCase();
    return OWN_DOMAINS.some((d) => lower.endsWith('@' + d));
  };

  // Prefer explicit "E-Mail:" field from website form mails.
  const emailField =
    /e-?mail:\s*([^\s@<>\n\r]+@[^\s@<>\n\r]+\.[^\s@<>\n\r]+)/i.exec(normalizedText)?.[1] ||
    /\[([^\s@<>\n\r]+@[^\s@<>\n\r]+\.[^\s@<>\n\r]+)\]/.exec(normalizedText)?.[1];

  const email =
    (emailField && !isOwn(emailField) ? emailField : undefined) ||
    allEmails.find((e) => !isOwn(e)) ||
    allEmails[0];

  const phoneField =
    /telefon:\s*([+()0-9][0-9\s\-()\/]{6,}[0-9])/i.exec(normalizedText)?.[1] ||
    /(\+?\d[\d\s\-()\/]{7,}\d)/.exec(normalizedText)?.[1];

  // Filter out own phone numbers (from signature)
  let phone = phoneField?.trim();
  if (phone) {
    const normalizedPhone = phone.replace(/[\s\-\/]/g, '');
    const isOwnPhone = OWN_PHONE_NUMBERS.some((own) => {
      const normalizedOwn = own.replace(/[\s\-\/]/g, '');
      return normalizedPhone.includes(normalizedOwn) || normalizedOwn.includes(normalizedPhone);
    });
    if (isOwnPhone) {
      phone = undefined; // Don't extract own phone numbers
    }
  }

  let salutation: Salutation | undefined;
  if (/\bherr\b/i.test(normalizedText)) salutation = 'Herr';
  if (/\bfrau\b/i.test(normalizedText)) salutation = 'Frau';
  if (/\bdivers\b/i.test(normalizedText)) salutation = 'Divers';

  // Prefer website form: "Name: Vorname Nachname"
  const nameField = /name:\s*([^\n\r]+)/i.exec(normalizedText)?.[1]?.trim();
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (nameField && nameField.split(/\s+/).length >= 2) {
    const parts = nameField.split(/\s+/).filter(Boolean);
    lastName = parts.pop();
    firstName = parts.join(' ');
  }

  // Fallback: "Ich bin Vorname Nachname"
  if (!firstName || !lastName) {
    const nameMatch = /\bich bin\s+([A-ZÄÖÜ][a-zäöüß]+)\s+([A-ZÄÖÜ][a-zäöüß]+)\b/.exec(normalizedText);
    firstName = firstName || nameMatch?.[1];
    lastName = lastName || nameMatch?.[2];
  }

  const normalizeStreetLine = (s: string) => {
    let out = (s || '').trim();
    // "Boulognestr.64" -> "Boulognestr. 64"
    out = out.replace(/([A-Za-zÄÖÜäöüß])\.(\d)/g, '$1. $2');
    // "Kastanienweg17" -> "Kastanienweg 17" (only if it looks like a street word)
    out = out.replace(/\b([A-Za-zÄÖÜäöüß]{3,})(\d{1,4}[a-zA-Z]?)\b/g, '$1 $2');
    return out;
  };

  const address = (() => {
    // Common patterns from customer mails: "Meine Adresse: Straße 1 12345 Ort" or multi-line.
    const m =
      /(meine\s+)?adresse:\s*([^\n\r]+)(?:\r?\n\s*([0-9]{5}\s+[^\n\r]+))?/i.exec(normalizedText) ||
      /adresse\s*[:\-]\s*([^\n\r]+)/i.exec(normalizedText);
    const byLabelRaw = (() => {
      if (!m) return undefined;
      const line1 = (m[2] || m[1] || '').trim();
      const line2 = (m[3] || '').trim();
      return [line1, line2].filter(Boolean).join(' ');
    })();

    const lines = normalizedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const zipCityRe = /\b([0-9]{5})\b\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]+)/;

    const byZipLine = (() => {
      // Detect multi-line addresses even without "Adresse:" label:
      //   Boulognestr.64
      //   66482 Zweibrücken
      for (let i = 0; i < lines.length; i++) {
        const m2 = zipCityRe.exec(lines[i]);
        if (!m2) continue;
        const prev = i > 0 ? lines[i - 1] : '';
        if (!prev) continue;
        // Heuristic: previous line should contain letters (street).
        if (!/[A-Za-zÄÖÜäöüß]/.test(prev)) continue;
        return `${prev} ${lines[i]}`;
      }
      // Detect single-line addresses that contain zip+city without label.
      const joined = byLabelRaw || lines.join(' | ');

      // Pattern 2 (checked FIRST): "Street.Number12345 City" (no space, like "Boulognestr.6466482 Zweibrücken")
      // This pattern handles the case where house number and zip are directly adjacent
      // Strategy: Find the street part, then extract house number from the number sequence before zip
      // Changed \s+ to \s* to allow NO space between street and numbers
      const m4 = /([^\|]{4,}?)\s*(\d*[0-9]{5})\b\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]+)/.exec(joined);
      if (m4) {
        // m4[1] = street part (e.g., "Meine Adresse: Boulognestr.")
        // m4[2] = number sequence ending with zip (e.g., "6466482")
        // m4[3] = city (e.g., "Zweibrücken")
        const numberSequence = m4[2];
        const zipCode = numberSequence.slice(-5); // Last 5 digits = zip
        const houseNumber = numberSequence.slice(0, -5) || ''; // Everything except last 5 digits

        // Extract street part - remove label like "Meine Adresse:" if present
        let streetPart = m4[1].trim();
        const labelMatch = /^(meine\s+)?adresse:\s*/i.exec(streetPart);
        if (labelMatch) {
          streetPart = streetPart.slice(labelMatch[0].length).trim();
        }

        const street = normalizeStreetLine(streetPart + (houseNumber ? ` ${houseNumber}` : ''));

        return {
          street: street || undefined,
          zipCode,
          city: m4[3].trim(),
          country: /deutschland|germany/i.test(normalizedText) ? 'Deutschland' : 'Deutschland',
        };
      }

      // Pattern 1 (checked SECOND): "Street 12345 City" (space after house number)
      const m3 = /([^\|]{4,}?)\s+\b([0-9]{5})\b\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]+)/.exec(joined);
      if (m3) {
        let streetPart = m3[1].trim();
        const labelMatch = /^(meine\s+)?adresse:\s*/i.exec(streetPart);
        if (labelMatch) {
          streetPart = streetPart.slice(labelMatch[0].length).trim();
        }

        const street = normalizeStreetLine(streetPart);
        return {
          street: street || undefined,
          zipCode: m3[2],
          city: m3[3].trim(),
          country: /deutschland|germany/i.test(normalizedText) ? 'Deutschland' : 'Deutschland',
        };
      }

      return undefined;
    })();

    // byZipLine can now be an address object (from Pattern 2) or undefined
    if (byZipLine && typeof byZipLine === 'object') {
      return byZipLine; // Already a complete address object
    }

    const combined = (byLabelRaw || byZipLine || '').trim();
    if (!combined) return undefined;

    // Try to split "Street ... 12345 City"
    const zipCity = zipCityRe.exec(combined);
    if (zipCity) {
      const zipCode = zipCity[1];
      const city = zipCity[2].trim();
      const street = normalizeStreetLine(combined.slice(0, zipCity.index).trim().replace(/[,\s]+$/g, ''));
      return {
        street: street || undefined,
        zipCode,
        city,
        country: /deutschland|germany/i.test(normalizedText) ? 'Deutschland' : 'Deutschland',
      };
    }

    // If no zip/city found, keep as freeform street line.
    return {
      street: normalizeStreetLine(combined) || undefined,
      country: /deutschland|germany/i.test(normalizedText) ? 'Deutschland' : 'Deutschland',
    };
  })();

  return {
    name: firstName && lastName ? `${firstName} ${lastName}` : undefined,
    salutation,
    firstName,
    lastName,
    email,
    phone,
    address,
  };
}

export function generateReplySuggestion(
  originalMessage: string,
  suggestion: ProductSuggestion,
  rentalInfo: { rentalStart?: number; rentalEnd?: number }
): string {
  const product = suggestion.productType;
  const start = rentalInfo.rentalStart ? new Date(rentalInfo.rentalStart).toLocaleDateString('de-DE') : '...';
  const end = rentalInfo.rentalEnd ? new Date(rentalInfo.rentalEnd).toLocaleDateString('de-DE') : '...';

  return (
    `Hallo! Danke fuer Ihre Anfrage.\n\n` +
    `Ich habe als Produkt "${product}" erkannt. Geplanter Zeitraum: ${start} bis ${end}.\n\n` +
    `Bitte bestaetigen Sie kurz:\n` +
    `- genaue Mietdaten (Start/Ende)\n` +
    `- Fahrzeug (Marke/Modell)\n` +
    `- Kontakt (Name, Telefon)\n\n` +
    `Viele Gruesse\nMietpark Saar-Pfalz`
  );
}
