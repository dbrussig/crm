/**
 * Realer Kunden Import aus SubTotal.st
 *
 * Importiert echte Kunden und Vorgänge aus der SubTotal SQLite-Datenbank.
 * Nur Privatkunden (keine Firmen) werden importiert.
 */

import { setJson } from '../services/_storage';
import type { Customer, RentalRequest, Invoice, InvoiceItem } from '../types';

// ============================================================================
// Import Helper Functions
// ============================================================================

/**
 * Parst Datum aus Microsoft-Ticks (638721504000000000) zu Unix-Timestamp
 */
function parseMicrosoftDate(ticks: string | number): number {
  const tickValue = typeof ticks === 'string' ? BigInt(ticks) : BigInt(ticks);
  // Microsoft-Ticks starten am 01.01.0001
  // Unix-Timestamp starten am 01.01.1970 (621355968000000000 Ticks Differenz)
  const unixTicks = tickValue - 621355968000000000n;
  const microseconds = Number(unixTicks / 10000n); // Ticks zu Millisekunden
  return Math.floor(microseconds / 1000) * 1000; // Auf volle Sekunden runden
}

/**
 * Extrahiert E-Mail aus der BuyerAddress (Format: "Straße\nPLZ Ort\nEmail")
 */
function extractEmailFromAddress(address: string): string | undefined {
  const emailMatch = /[\w.-]+@[\w.-]+\.\w+/.exec(address);
  return emailMatch?.[0];
}

/**
 * Extrahiert Telefonnummer aus BuyerAddress (falls vorhanden)
 */
function extractPhoneFromAddress(address: string): string | undefined {
  // Telefonnummer-Muster (deutsche Formate)
  const phoneMatch = /(\+?49[\s\-\.]?\d{3,5}[\s\-\.]?\d{4,8}|0\d{2,5}[\s\-\.]?\d{4,8})/.exec(address);
  return phoneMatch?.[1]?.trim();
}

/**
 * Parst Kundenadresse aus BuyerAddress
 */
function parseAddressFromBuyerAddress(buyerAddress: string, buyerName: string): {
  street?: string;
  zipCode?: string;
  city?: string;
  country: string;
} {
  const lines = buyerAddress.split('\n').map(l => l.trim()).filter(Boolean);

  // Standard-Format: "Straße Hausnummer\nPLZ Ort\n[Email]"
  // Oder: "Straße Hausnummer\nPLZ Ort\nLand\nEmail"

  let street: string | undefined;
  let zipCode: string | undefined;
  let city: string | undefined;
  let country = 'Deutschland';

  for (const line of lines) {
    // Prüfen auf PLZ+City Muster (5 Ziffern + Stadt)
    const zipCityMatch = /^(\d{5})\s+(.+)$/.exec(line);
    if (zipCityMatch) {
      zipCode = zipCityMatch[1];
      city = zipCityMatch[2].trim();
      continue;
    }

    // Prüfen auf "Deutschland" oder Länderangabe
    if (/Deutschland|Germany|FR|FR|LU/i.test(line)) {
      continue; // Land bereits gesetzt
    }

    // Prüfen auf E-Mail (überspringen)
    if (/@/.test(line)) {
      continue;
    }

    // Erste Zeile ist normalerweise die Straße
    if (!street && line.length > 3) {
      street = line;
    }
  }

  return { street, zipCode, city, country };
}

/**
 * Extrahiert Produkttyp aus der Beitragsbeschreibung
 */
function extractProductTypeFromDescription(description: string): {
  productType: string;
  includeRoofRack?: boolean;
  relingType?: string;
} {
  const lower = description.toLowerCase();

  // Hüpfburg
  if (lower.includes('hüpfburg') || lower.includes('huepfburg')) {
    return { productType: 'Hüpfburg' };
  }

  // Heckbox
  if (lower.includes('heckbox')) {
    return { productType: 'Heckbox' };
  }

  // Fahrradträger (oder "Dachträger einzeln")
  if (lower.includes('fahrrad') || lower.includes('dachträger einzeln')) {
    let relingType: string | undefined;
    if (lower.includes('geschlossen')) relingType = 'geschlossen';
    if (lower.includes('offen')) relingType = 'offen';
    return { productType: 'Fahrradträger', relingType };
  }

  // Dachbox Varianten
  const includeRoofRack = lower.includes('mit grundträger') || lower.includes('mit dachträger');

  if (lower.includes('dachbox xl') || lower.includes('dachbox 523l') || lower.includes('dachbox 420l')) {
    return { productType: 'Dachbox XL', includeRoofRack };
  }

  if (lower.includes('dachbox m') || lower.includes('dachbox 300l') || lower.includes('dachbox 320l')) {
    return { productType: 'Dachbox M', includeRoofRack };
  }

  // Default: Dachbox XL
  return { productType: 'Dachbox XL', includeRoofRack };
}

/**
 * Extrahiert Mietdaten aus der Beitragsbeschreibung (wenn vorhanden)
 * Beispiele: "03.07.2025 - 21.07.2025", "15.04.2025 - 26.04.2025"
 */
function extractRentalDatesFromDescription(description: string): {
  rentalStart?: number;
  rentalEnd?: number;
} {
  // Muster: "DD.MM.YYYY - DD.MM.YYYY" oder "DD.MM.YYYY - DD.MM.YYYY"
  const dateRangePattern = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const match = dateRangePattern.exec(description);

  if (match) {
    const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = match;
    const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
    const endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));

    return {
      rentalStart: startDate.getTime(),
      rentalEnd: endDate.getTime()
    };
  }

  return {};
}

// ============================================================================
// Realer Kundendaten (aus SubTotal.st SQLite-Datenbank)
// ============================================================================

const realCustomersData = [
  {
    invoiceId: 2,
    invoiceNo: '202502',
    buyerName: 'Christian Gluting',
    buyerAddress: 'Mühlenstr. 86\n66578 Schiffweiler\nChrisseschule@gmx.net',
    itemDescription: 'Miete \nDachbox mit Grundträger',
    unitPrice: 50.0,
    invoiceDateTicks: '638721504000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 3,
    invoiceNo: '202501',
    buyerName: 'Falk Schmiedel',
    buyerAddress: 'Verdistrasse 2\n66459 Kirkel\nDeutschland\nfalk.schmiedel@googlemail.com',
    itemDescription: 'Miete \nDachbox mit Grundträger',
    unitPrice: 80.0,
    invoiceDateTicks: '638719776000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 4,
    invoiceNo: '202503',
    buyerName: 'Pascal Pflug',
    buyerAddress: 'Rixdorfer Straße 8\n66424 Homburg\npascalpflug@gmx.de',
    itemDescription: 'Miete \nDachbox ohne Grundträger',
    unitPrice: 0.0, // Angebot ohne Preis?
    invoiceDateTicks: '638724096000000000',
    invoiceTypeId: 1 // Rechnung
  },
  {
    invoiceId: 5,
    invoiceNo: '202504',
    buyerName: 'Jörg  Werkle',
    buyerAddress: 'Brückenstraße 44\n66578 Schiffweiler',
    itemDescription: 'Miete \nDachbox 523lmit Grundträger',
    unitPrice: 50.0,
    invoiceDateTicks: '638760384000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 6,
    invoiceNo: '202505',
    buyerName: 'Oliver  Signoretta',
    buyerAddress: 'Kettelerstrasse 6\n66131  Saarbrücken \nDeutschland\noliver.signoretta@t-online.de',
    itemDescription: 'Miete \nDachbox mit Grundträger',
    unitPrice: 90.0,
    invoiceDateTicks: '638772480000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 7,
    invoiceNo: '202506',
    buyerName: 'Verena  Grupico',
    buyerAddress: 'Kohlstraße 49a\n66450  Bexbach\nverenaruffing@web.de',
    itemDescription: 'Hüpfburg',
    unitPrice: 50.0,
    invoiceDateTicks: '638792544000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 8,
    invoiceNo: '202507',
    buyerName: 'Sandra  Meier',
    buyerAddress: 'Hauptstraße 4\n66930 Ohmbach\nSandragrub@t-online.de',
    itemDescription: 'Miete \nDachbox 524l mit Grundträger',
    unitPrice: 55.0,
    invoiceDateTicks: '638803296000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 9,
    invoiceNo: '202508',
    buyerName: 'Vanessa Ballas',
    buyerAddress: 'Im Großenbruch 40 \n\n66583 Spiesen-Elversberg\nVanessa.Ballas@gmx.de',
    itemDescription: 'Dachbox 300 Liter mit Grundträger\n03.07.2025 - 21.07.2025',
    unitPrice: 93.0,
    invoiceDateTicks: '638818944000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 10,
    invoiceNo: '202509',
    buyerName: 'Benjamin Badke',
    buyerAddress: 'Am Schützenhof 19\n66424 Homburg\nbbadke@web.de',
    itemDescription: 'Dachbox 300 Liter mit Grundträger\n15.04.2025 - 26.04.2025',
    unitPrice: 55.0,
    invoiceDateTicks: '638834592000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 11,
    invoiceNo: '202510',
    buyerName: 'Richard Werbach',
    buyerAddress: 'Lerchenweg 2\n55743 Kirschweiler\nRichard.Werbach@gmx.net',
    itemDescription: 'Mietgebühr Dachbox XL mit Grundträger\n22.08.2025 - 01.09.2025',
    unitPrice: 80.0,
    invoiceDateTicks: '638856288000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 12,
    invoiceNo: '202511',
    buyerName: 'Jerome Bier',
    buyerAddress: 'Schulstraße 18\n66903 Altenkirchen\njerome.bier.01@gmail.com',
    itemDescription: 'Heckbox mit Träger',
    unitPrice: 80.0,
    invoiceDateTicks: '638868000000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 13,
    invoiceNo: '202512',
    buyerName: 'Büsra Eren',
    buyerAddress: 'Wolsifferstraße 14\n66424 Homburg\nbuesra.43@outlook.de',
    itemDescription: 'Hüpfburg',
    unitPrice: 40.0,
    invoiceDateTicks: '6388809600000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 15,
    invoiceNo: '202514',
    buyerName: 'Maureen Ruthig',
    buyerAddress: 'Am Kieselhumes 7\n66123  Saarbrücken\nmaureenruthig@gmail.com',
    itemDescription: 'Dachbox XL mit Grundträger\n05.06.2025 - 19.06.2025',
    unitPrice: 90.0,
    invoiceDateTicks: '638936352000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 16,
    invoiceNo: '202515',
    buyerName: 'Heiko Sornberger',
    buyerAddress: 'Am Homerich 14\n66646 Marpingen\nheiko@sornberger.de',
    itemDescription: 'Heckbox mit Träger',
    unitPrice: 80.0,
    invoiceDateTicks: '638948832000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 17,
    invoiceNo: '202516',
    buyerName: 'Viktor Gass',
    buyerAddress: 'Pastor-Jacobstrasse-107\n66540 Münchwies\nvik.gass@googlemail.com',
    itemDescription: 'Dachbox XL mit Grundträger\n24.07.2025 - 11.08.2025',
    unitPrice: 90.0,
    invoiceDateTicks: '638963712000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 18,
    invoiceNo: '202517',
    buyerName: 'Miriam Nisius',
    buyerAddress: 'Haydnstraße 9\n66424 Homburg\nnisius@gmx.de',
    itemDescription: 'Dachbox 300 Liter mit Grundträger\n22.07.2025 - 22.08.2025',
    unitPrice: 110.0,
    invoiceDateTicks: '6389775360000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 19,
    invoiceNo: '202518',
    buyerName: 'Sven  Urbanke',
    buyerAddress: 'Illinger Straße 21\n66564 Ottweiler\nurbanke.sven@gmail.com',
    itemDescription: 'Heckbox mit Träger',
    unitPrice: 80.0,
    invoiceDateTicks: '639012000000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 20,
    invoiceNo: '202519',
    buyerName: 'Bernd Zimmermann',
    buyerAddress: 'Am Imsitters 2\n66989 Höheischweiler\nDeutschland\nberndzimmermann48@gmail.com',
    itemDescription: 'Dachbox XL ohne Dachträger\n14.08.2025 - 27.08.2025',
    unitPrice: 80.0,
    invoiceDateTicks: '639028800000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 22,
    invoiceNo: '202521',
    buyerName: 'Helge Sauer',
    buyerAddress: 'Mörikestr. 4\n66287 Quierschied\ninfo@helge-sauer.de',
    itemDescription: 'Dachbox XLmit Grundträger\n10.10.2025 - 22.10.2025',
    unitPrice: 90.0,
    invoiceDateTicks: '639232416000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 23,
    invoiceNo: '202513',
    buyerName: 'Daniel Biss',
    buyerAddress: 'Borngasse 2\n66917 Biedershausen\ndaniel.biss@icloud.com',
    itemDescription: 'Dachbox XL mit Grundträger\n18.10.2025 - 01.11.2025',
    unitPrice: 55.0,
    invoiceDateTicks: '639216000000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 24,
    invoiceNo: '202522',
    buyerName: 'Vivien Schirra',
    buyerAddress: 'Süßbachweg 17\n66450 Neunkirchen\nvivien.schirra@gmail.com',
    itemDescription: 'Hüpfburg Miete',
    unitPrice: 40.0,
    invoiceDateTicks: '639241920000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 25,
    invoiceNo: '202523',
    buyerName: 'Peter Weber',
    buyerAddress: 'Karlsbrunner Straße 80\n66352 Großrosseln\npeterweber1989@icloud.com',
    itemDescription: 'Dachbox M mit Grundträger 8 Tage\n10.10.2025 - 18.10.2025',
    unitPrice: 50.0,
    invoiceDateTicks: '639251520000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 27,
    invoiceNo: '202525',
    buyerName: 'Timo Naßhan',
    buyerAddress: 'Höhenstraße 23a\n66879 Reichenbach-Steegen\nTimo.nasshan@icloud.com',
    itemDescription: 'Dachbox M mit Grundträger \n23.12.2025 - 05.01.2025\nAbholung 22.12.2025 nach Absprache',
    unitPrice: 72.0,
    invoiceDateTicks: '639277440000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 28,
    invoiceNo: '202526',
    buyerName: 'Lisa Zimmer',
    buyerAddress: 'Eichenstr. 10\n66578 Stennweiler\nlisa.zimmer86@googlemail.com',
    itemDescription: 'Dachbox XL mit Grundträger\n22.12.2025 -  04.01.2026\nAbholung nach Vereinbarung',
    unitPrice: 90.0,
    invoiceDateTicks: '639287040000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 29,
    invoiceNo: '202627',
    buyerName: 'Ralf Prinz',
    buyerAddress: 'Spiesstraße 54\n66892\nprinzralf@yahoo.de',
    itemDescription: 'Dachbox XL mit Grundträger\n02.02.2027 - 09.02.2026',
    unitPrice: 55.0,
    invoiceDateTicks: '639305280000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 30,
    invoiceNo: '202604',
    buyerName: 'Maciej Nagorski',
    buyerAddress: 'Alfred-Friedrich-Straße 35\n66606 St.Wendel \nmaik030624@t-online.de',
    itemDescription: 'Dachträger einzeln geschlossene Reling \n12.02 - 23.02.2026',
    unitPrice: 15.0,
    invoiceDateTicks: '639318720000000000',
    invoiceTypeId: 1 // Rechnung
  },
  {
    invoiceId: 31,
    invoiceNo: '202626',
    buyerName: 'Susanne Bier',
    buyerAddress: 'Schiffweilerstr. 14\n66540 Neunkirchen\nrainer.susi@gmx.de',
    itemDescription: 'Heckbox mit Träger Anzahlung Auftrag',
    unitPrice: 30.0,
    invoiceDateTicks: '639336000000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 32,
    invoiceNo: '202628',
    buyerName: 'Familie Rommé',
    buyerAddress: 'Kettelersiedlung 4\n66450  Bexbach\nSandra.Romme@gmx.de',
    itemDescription: 'Dachbox XL mit Grundträger\n28.03.2026 - 11.04.2026\nAbholung Freitag 27.03.2026 Uhrzeit nach Vereinbarung',
    unitPrice: 90.0,
    invoiceDateTicks: '639362880000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 33,
    invoiceNo: '202629',
    buyerName: 'Tobias  Cappel',
    buyerAddress: 'Flurstraße 9\n66887 Rutsweiler am Glan\ntobias.cappel@yahoo.de',
    itemDescription: 'Dachbox M mit Grundträger \ngeschlossene Reling Hyundai Tucson SUV 1.6 T-gdi Allrad\n12.02.2026 - 19.02.2026\nAbholung 12.02.2026 nach Absprache',
    unitPrice: 45.0,
    invoiceDateTicks: '639374400000000000',
    invoiceTypeId: 3 // Auftrag
  },
  {
    invoiceId: 34,
    invoiceNo: '202606',
    buyerName: 'Oliver  Signoretta',
    buyerAddress: 'Kettelerstrasse 6\n66131  Saarbrücken \nDeutschland\noliver.signoretta@t-online.de',
    itemDescription: 'Miete \nDachbox XL mit Grundträger\noffene Dachreling Jeep Renegade\n27.06.2026 - 11.07.2026',
    unitPrice: 85.0,
    invoiceDateTicks: '639421440000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 35,
    invoiceNo: '202607',
    buyerName: 'Yvonne Wegner',
    buyerAddress: 'In den Rödwiesen 22\n66885 Altenglan\nyvonne.wegner@gmail.com',
    itemDescription: 'Dachbox XL mit Grundträger KFZ Opel Astra K Sports Tourer',
    unitPrice: 90.0,
    invoiceDateTicks: '639432480000000000',
    invoiceTypeId: 2 // Angebot
  },
  {
    invoiceId: 36,
    invoiceNo: '202630',
    buyerName: 'Tina Marczinkowsky',
    buyerAddress: 'Boulognestr.64\n66482 Zweibrücken\ntina.marczinkowsky@googlemail.com',
    itemDescription: 'Heckbox mit Träger\n02.04.2026 - 17.04.2026\nAbholung nach Vereinbarung',
    unitPrice: 80.0,
    invoiceDateTicks: '639456000000000000',
    invoiceTypeId: 2 // Angebot
  }
];

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Importiert echte Kunden und Vorgänge aus SubTotal.st Datenbank
 *
 * @param options - Optionale Konfiguration
 * @param options.clear - Vor dem Import alle existierenden Daten löschen (default: false)
 * @param options.verbose - Console Logs anzeigen (default: true)
 */
export async function importRealCustomers(options: {
  clear?: boolean;
  verbose?: boolean;
} = {}): Promise<void> {
  const { clear = false, verbose = true } = options;

  if (verbose) {
    console.log('🔄 Importiere echte Kunden aus SubTotal.st...');
  }

  try {
    // Optional: Vorhandene Daten löschen
    if (clear) {
      if (verbose) console.log('  🗑️  Clearing existing data...');
      await setJson('mietpark_crm_customers_v1', []);
      await setJson('mietpark_crm_rentals_v1', []);
      await setJson('mietpark_crm_messages_v1', []);
      await setJson('mietpark_crm_invoices_v1', []);
      await setJson('mietpark_crm_invoice_items_v1', []);
    }

    const customers: Customer[] = [];
    const rentals: RentalRequest[] = [];
    const invoices: Invoice[] = [];
    const invoiceItems: InvoiceItem[] = [];

    let customerIdCounter = 1000;
    let rentalIdCounter = 2000;
    let invoiceIdCounter = 3000;

    // Kunden-Map für Deduplizierung (gleiche E-Mail = gleicher Kunde)
    const customerMap = new Map<string, Customer>();

    for (const record of realCustomersData) {
      const { buyerName, buyerAddress, itemDescription, unitPrice, invoiceDateTicks, invoiceTypeId, invoiceNo } = record;

      // E-Mail extrahieren
      const email = extractEmailFromAddress(buyerAddress);
      if (!email) {
        if (verbose) console.log(`  ⚠️  Keine E-Mail gefunden für ${buyerName} - übersprungen`);
        continue;
      }

      // Prüfen ob Kunde bereits existiert
      let customer = customerMap.get(email);

      if (!customer) {
        // Neuer Kunde
        const address = parseAddressFromBuyerAddress(buyerAddress, buyerName);
        const phone = extractPhoneFromAddress(buyerAddress);
        const contactDate = parseMicrosoftDate(invoiceDateTicks);

        // Namen parsen (Vorname Nachname)
        const nameParts = buyerName.split(/\s+/).filter(Boolean);
        const salutation: 'Herr' | 'Frau' | 'Divers' = nameParts[0]?.startsWith('Familie') ? 'Divers' :
                                                          nameParts[0]?.toLowerCase().startsWith('y') ? 'Frau' :
                                                          nameParts[0]?.toLowerCase().startsWith('s') ? 'Frau' :
                                                          nameParts[0]?.toLowerCase().startsWith('v') ? 'Frau' :
                                                          nameParts[0]?.toLowerCase().startsWith('m') ? 'Frau' :
                                                          nameParts[0]?.toLowerCase().startsWith('b') ? 'Frau' :
                                                          nameParts[0]?.toLowerCase().startsWith('j') ? 'Herr' : 'Herr';

        const firstName = nameParts[0]?.replace(/Familie\s+/i, '') || '';
        const lastName = nameParts[nameParts.length - 1] || '';

        customer = {
          id: `customer_real_${customerIdCounter++}`,
          salutation,
          firstName,
          lastName,
          email,
          phone,
          address,
          contactDate,
          createdAt: contactDate,
          updatedAt: contactDate,
          notes: `Import aus SubTotal.st (${invoiceNo})`
        };

        customerMap.set(email, customer);
        if (verbose) console.log(`  👤 Kunde importiert: ${firstName} ${lastName} (${email})`);
      }

      // Produkt-Typ und Mietdaten extrahieren
      const { productType, includeRoofRack, relingType } = extractProductTypeFromDescription(itemDescription);
      const { rentalStart, rentalEnd } = extractRentalDatesFromDescription(itemDescription);

      // Status basierend auf InvoiceType
      let status: 'neu' | 'angebot_gesendet' | 'angenommen' | 'abgeschlossen' = 'neu';
      if (invoiceTypeId === 2) status = 'angebot_gesendet';
      if (invoiceTypeId === 3) status = 'angenommen';
      if (invoiceTypeId === 1) status = 'abgeschlossen';

      // Vorgang erstellen
      const rental: RentalRequest = {
        id: `rental_real_${rentalIdCounter++}`,
        customerId: customer.id,
        productType,
        status,
        rentalStart: rentalStart || contactDate,
        rentalEnd: rentalEnd || contactDate + (7 * 24 * 60 * 60 * 1000), // Default: 1 Woche
        includeRoofRack,
        priceSnapshot: unitPrice || 0,
        deposit: productType === 'Hüpfburg' ? 200 : productType === 'Dachbox XL' ? 150 : 100,
        isHighSeason: false, // Wird später berechnet
        googleCalendarId: '', // Wird später zugeordnet
        createdAt: contactDate,
        updatedAt: contactDate,
        title: `${productType} für ${customer.firstName} ${customer.lastName}`
      };

      // Reling-Typ hinzufügen falls vorhanden
      if (relingType) {
        rental.relingType = relingType;
      }

      rentals.push(rental);

      // Beleg erstellen (wenn vorhanden)
      const invoiceType = invoiceTypeId === 1 ? 'Rechnung' : invoiceTypeId === 2 ? 'Angebot' : 'Auftrag';
      const invoiceState = status === 'neu' ? 'entwurf' : status === 'angebot_gesendet' ? 'gesendet' : status === 'angenommen' ? 'angenommen' : 'bezahlt';

      const invoice: Invoice = {
        id: `invoice_real_${invoiceIdCounter++}`,
        invoiceType,
        invoiceNo,
        invoiceDate: contactDate,
        state: invoiceState,
        currency: 'EUR',
        companyId: customer.id,
        buyerName: `${customer.firstName} ${customer.lastName}`,
        buyerAddress: `${customer.address?.street || ''}, ${customer.address?.zipCode || ''} ${customer.address?.city || ''}`,
        salutation: customer.salutation,
        paymentTerms: 'Zahlbar bei Abholung',
        createdAt: contactDate,
        updatedAt: contactDate
      };

      invoices.push(invoice);

      // Beleg-Position erstellen
      const invoiceItem: InvoiceItem = {
        id: `invoice_item_real_${invoiceIdCounter}`,
        invoiceId: invoice.id,
        orderIndex: 1,
        name: itemDescription.split('\n')[0].trim(), // Nur erste Zeile
        unit: 'Stück',
        unitPrice: unitPrice || 0,
        quantity: 1,
        taxPercent: 0, // Kleinunternehmerregel gem. §19 Abs. 1 UStG
        createdAt: contactDate
      };

      invoiceItems.push(invoiceItem);
    }

    // Daten in IndexedDB schreiben
    if (verbose) console.log('  💾 Speichere Kunden...');
    await setJson('mietpark_crm_customers_v1', Array.from(customerMap.values()));

    if (verbose) console.log('  📋 Speichere Vorgänge...');
    await setJson('mietpark_crm_rentals_v1', rentals);

    if (verbose) console.log('  📄 Speichere Belege...');
    await setJson('mietpark_crm_invoices_v1', invoices);

    if (verbose) console.log('  📦 Speichere Beleg-Positionen...');
    await setJson('mietpark_crm_invoice_items_v1', invoiceItems);

    if (verbose) {
      console.log('');
      console.log('✅ Echte Kunden erfolgreich importiert!');
      console.log('');
      console.log('📊 Summary:');
      console.log(`   - ${customerMap.size} Kunden`);
      console.log(`   - ${rentals.length} Vorgänge`);
      console.log(`   - ${invoices.length} Belege`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Fehler beim Import der echten Kunden:', error);
    throw error;
  }
}
