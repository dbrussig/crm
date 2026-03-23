/**
 * Development Seed Data
 *
 * Füllt die IndexedDB mit fiktiven Testdaten für Development und Testing.
 * Basierend auf test-data/fiktive-kunden-anfragen.md
 *
 * Verwendung in App.tsx (nur im Development Mode):
 *
 * ```typescript
 * if (import.meta.env.DEV && localStorage.getItem('mietpark_dev_seed') !== 'done') {
 *   await seedTestData();
 *   localStorage.setItem('mietpark_dev_seed', 'done');
 * }
 * ```
 */

import { saveJson } from '../services/_storage';
import type { Customer, RentalRequest, Message, Invoice, InvoiceItem, Resource } from '../types';

// ============================================================================
// Mock Daten (aus test-data/fiktive-kunden-anfragen.md)
// ============================================================================

const mockCustomers: Customer[] = [
  {
    id: 'customer_test_001',
    salutation: 'Herr',
    firstName: 'Thomas',
    lastName: 'Müller',
    email: 'thomas.mueller@example.de',
    phone: '+49 6300 123456',
    address: {
      street: 'Hauptstraße 42',
      city: 'Kaiserslautern',
      zipCode: '67657',
      country: 'Deutschland'
    },
    contactDate: 1704067200000,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    notes: 'Familienurlaub im Sommer geplant'
  },
  {
    id: 'customer_test_002',
    salutation: 'Frau',
    firstName: 'Sarah',
    lastName: 'Schmidt',
    email: 's.schmidt@example.de',
    phone: '+49 6300 234567',
    company: 'Auto Schmidt GmbH',
    address: {
      street: 'Saarbrücker Straße 15',
      city: 'Saarbrücken',
      zipCode: '66111',
      country: 'Deutschland'
    },
    contactDate: 1704153600000,
    createdAt: 1704153600000,
    updatedAt: 1704153600000,
    notes: 'Firmenwagen für Transporte'
  },
  {
    id: 'customer_test_003',
    salutation: 'Herr',
    firstName: 'Michael',
    lastName: 'Weber',
    email: 'm.weber@example.de',
    phone: '+49 6300 345678',
    address: {
      street: 'Bahnhofstraße 8',
      city: 'Zweibrücken',
      zipCode: '66482',
      country: 'Deutschland'
    },
    contactDate: 1704240000000,
    createdAt: 1704240000000,
    updatedAt: 1704240000000,
    notes: 'Wochenendtrip zum Müllerthal'
  }
  ,
  {
    id: 'customer_test_004',
    salutation: 'Herr',
    firstName: 'Testkunde',
    lastName: 'Eins',
    email: 'testkunde1mietpark@icloud.com',
    phone: '',
    address: {
      street: 'Teststrasse 1',
      city: 'Homburg',
      zipCode: '66424',
      country: 'Deutschland'
    },
    contactDate: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notes: 'Fiktiver Testkunde (E-Mail Versandtests)'
  },
  {
    id: 'customer_test_005',
    salutation: 'Frau',
    firstName: 'Testkunde',
    lastName: 'Zwei',
    email: 'testkunde2mietpark@icloud.com',
    phone: '',
    address: {
      street: 'Teststrasse 2',
      city: 'Homburg',
      zipCode: '66424',
      country: 'Deutschland'
    },
    contactDate: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notes: 'Fiktiver Testkunde (E-Mail Versandtests)'
  }
];

const mockRentals: RentalRequest[] = [
  {
    id: 'rental_test_001',
    customerId: 'customer_test_001',
    productType: 'Dachbox XL',
    status: 'neu',
    rentalStart: 1752576000000, // 15.07.2025
    rentalEnd: 1753872000000,   // 30.07.2025
    includeRoofRack: true,
    vehicleMake: 'VW',
    vehicleModel: 'Touran',
    relingType: 'unklar',
    ahkPresent: 'unklar',
    priceSnapshot: 170,
    deposit: 150,
    isHighSeason: true,
    missingInfo: ['relingType', 'hsn', 'tsn'],
    googleCalendarId: 'c_45869d79b1bea0a3dadbffdf704c2d50916e158b98e1ca144095d2213a8b16f7@group.calendar.google.com',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    title: 'Dachbox XL für Familienurlaub'
  },
  {
    id: 'rental_test_002',
    customerId: 'customer_test_002',
    productType: 'Heckbox',
    status: 'angebot_gesendet',
    rentalStart: 1704873600000, // 10.01.2025
    rentalEnd: 1705737600000,   // 20.01.2025
    vehicleMake: 'Mercedes',
    vehicleModel: 'Vito',
    ahkPresent: 'ja',
    priceSnapshot: 120,
    deposit: 100,
    isHighSeason: false,
    title: 'Heckbox für Mercedes Vito (AHK)',
    description: 'Firmenwagen mit AHK für Werkzeugtransporte',
    googleCalendarId: 'c_67b52d42d115607bc8287ee750efac0e4b5d4bfeec19532a22c412ff61dc83e9@group.calendar.google.com',
    availabilityStatus: 'frei',
    availabilityCheckedAt: 1704153600000,
    createdAt: 1704153600000,
    updatedAt: 1704153600000
  },
  {
    id: 'rental_test_003',
    customerId: 'customer_test_003',
    productType: 'Fahrradträger',
    status: 'angenommen',
    rentalStart: 1739616000000, // 15.02.2025
    rentalEnd: 1740211200000,   // 22.02.2025
    pickupDate: 1739647200000,  // 15.02.2025 10:00
    returnDate: 1740204000000,  // 22.02.2025 18:00
    vehicleMake: 'BMW',
    vehicleModel: '3er Touring',
    relingType: 'geschlossen',
    ahkPresent: 'unklar',
    priceSnapshot: 80,
    deposit: 100,
    isHighSeason: false,
    googleEventId: 'e_abc123def456',
    googleCalendarId: 'c_dc2b0497c2d7fc848be4e800c0481e4bdd4df06b29d336c59a76dccbfb543dae@group.calendar.google.com',
    availabilityStatus: 'frei',
    availabilityCheckedAt: 1704240000000,
    acceptedAt: 1704247200000,
    createdAt: 1704240000000,
    updatedAt: 1704247200000,
    title: 'Fahrradträger für Müllerthal-Trip'
  }
];

const mockMessages: Message[] = [
  {
    id: 'msg_test_001',
    customerId: 'customer_test_001',
    rentalRequestId: 'rental_test_001',
    message: 'Guten Tag, wir möchten gerne eine Dachbox für unseren Familienurlaub mieten. Zeitraum: 15.07.2025 bis 30.07.2025 (2 Wochen). Fahrzeug: VW Touran, Baujahr 2022. Haben Sie eine Dachbox XL verfügbar? Mit oder ohne Dachträger?',
    channel: 'E-Mail',
    receivedAt: 1704067200000,
    createdAt: 1704067200000,
    isIncoming: true,
    suggestedProductType: 'Dachbox XL',
    extractedInfo: {
      productType: 'Dachbox XL',
      rentalStart: 1752576000000,
      rentalEnd: 1753872000000,
      vehicleMake: 'VW',
      vehicleModel: 'Touran'
    }
  },
  {
    id: 'msg_test_002',
    customerId: 'customer_test_002',
    rentalRequestId: 'rental_test_002',
    message: 'Hallo Mietpark Team, ich benötige eine Heckbox für meinen Firmenwagen mit Anhängerkupplung. Zeitraum: 10.01.2025 bis 20.01.2025. Fahrzeug: Mercedes Vito, Baujahr 2021. AHK vorhanden: Ja. Bitte um Angebot mit Preis.',
    channel: 'E-Mail',
    receivedAt: 1704153600000,
    createdAt: 1704153600000,
    isIncoming: true,
    suggestedProductType: 'Heckbox',
    extractedInfo: {
      productType: 'Heckbox',
      rentalStart: 1704873600000,
      rentalEnd: 1705737600000,
      vehicleMake: 'Mercedes',
      vehicleModel: 'Vito',
      ahkPresent: 'ja'
    }
  },
  {
    id: 'msg_test_003',
    customerId: 'customer_test_001',
    message: 'Hallo, ich brauche eine Dachbox für nächstes Wochenende. Fahrzeug: Opel Astra Sports Tourer. Wann könnt ihr? Danke!',
    channel: 'WhatsApp',
    receivedAt: 1704326400000,
    createdAt: 1704326400000,
    isIncoming: true,
    suggestedProductType: 'Dachbox M',
    extractedInfo: {
      productType: 'Dachbox M',
      vehicleMake: 'Opel',
      vehicleModel: 'Astra Sports Tourer'
    }
  }
];

const mockInvoices: Invoice[] = [
  {
    id: 'invoice_test_001',
    invoiceType: 'Angebot',
    invoiceNo: 'A-2025-0001',
    invoiceDate: 1704153600000,
    state: 'gesendet',
    currency: 'EUR',
    companyId: 'customer_test_002',
    buyerName: 'Auto Schmidt GmbH',
    buyerAddress: 'Saarbrücker Straße 15, 66111 Saarbrücken',
    salutation: 'Frau Schmidt',
    paymentTerms: 'Zahlbar innerhalb von 14 Tagen',
    paymentInfo: 'Bank: Sparkasse Saarbrücken\nIBAN: DE12 3456 7890 1234 5678 90\nBIC: SALADE51XXX',
    createdAt: 1704153600000,
    updatedAt: 1704153600000
  },
  {
    id: 'invoice_test_002',
    invoiceType: 'Angebot',
    invoiceNo: 'A-2025-0002',
    invoiceDate: 1704240000000,
    state: 'angenommen',
    currency: 'EUR',
    companyId: 'customer_test_003',
    buyerName: 'Michael Weber',
    buyerAddress: 'Bahnhofstraße 8, 66482 Zweibrücken',
    salutation: 'Herr Weber',
    paymentTerms: 'Zahlbar bei Abholung',
    createdAt: 1704240000000,
    updatedAt: 1704247200000
  }
];

const mockInvoiceItems: InvoiceItem[] = [
  {
    id: 'invoice_item_test_001',
    invoiceId: 'invoice_test_001',
    orderIndex: 1,
    name: 'Heckbox für Anhängerkupplung',
    unit: 'Stück',
    unitPrice: 120.00,
    quantity: 1,
    taxPercent: 19,
    createdAt: 1704153600000
  },
  {
    id: 'invoice_item_test_002',
    invoiceId: 'invoice_test_001',
    orderIndex: 2,
    name: 'Mietpauschale (10 Tage)',
    unit: 'Tag',
    unitPrice: 12.00,
    quantity: 10,
    taxPercent: 19,
    createdAt: 1704153600000
  },
  {
    id: 'invoice_item_test_003',
    invoiceId: 'invoice_test_002',
    orderIndex: 1,
    name: 'Fahrradträger für geschlossene Reling',
    unit: 'Woche',
    unitPrice: 40.00,
    quantity: 1,
    taxPercent: 19,
    createdAt: 1704240000000
  }
];

const mockResources: Resource[] = [
  {
    id: 'resource_dachbox_xl_1',
    name: 'Dachbox 1 XL (ohne Dachträger)',
    type: 'Dachbox XL',
    googleCalendarId: 'c_45869d79b1bea0a3dadbffdf704c2d50916e158b98e1ca144095d2213a8b16f7@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 12.00,
    deposit: 150.00
  },
  {
    id: 'resource_dachbox_xl_2',
    name: 'Dachbox 2 XL (mit Dachträger)',
    type: 'Dachbox XL',
    googleCalendarId: 'c_325271d09d1e42f08d6352af65db474f22363c9f34ea8bac21815715b62006a1@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 12.00,
    deposit: 150.00
  },
  {
    id: 'resource_dachbox_m_1',
    name: 'Dachbox 3 M',
    type: 'Dachbox M',
    googleCalendarId: 'c_be91fd4328707c9ba54b5554a4c8d6e4c3fd52ddb0bebd2457e094d08983bf21@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 8.00,
    deposit: 100.00
  },
  {
    id: 'resource_heckbox_1',
    name: 'Heckbox',
    type: 'Heckbox',
    googleCalendarId: 'c_67b52d42d115607bc8287ee750efac0e4b5d4bfeec19532a22c412ff61dc83e9@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 12.00,
    deposit: 100.00
  },
  {
    id: 'resource_fahrradtraeger_1',
    name: 'Fahrradträger',
    type: 'Fahrradträger',
    googleCalendarId: 'c_dc2b0497c2d7fc848be4e800c0481e4bdd4df06b29d336c59a76dccbfb543dae@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 6.00,
    deposit: 100.00
  },
  {
    id: 'resource_huepfburg_1',
    name: 'Hüpfburg',
    type: 'Hüpfburg',
    googleCalendarId: 'c_4986c8a9d132733c99d2f80982cf70ee74afa3a79c929d48c88f250c0004112e@group.calendar.google.com',
    isActive: true,
    createdAt: 1700000000000,
    dailyRate: 25.00,
    deposit: 200.00
  }
];

// ============================================================================
// Seed Function
// ============================================================================

/**
 * Füllt die IndexedDB mit Testdaten für Development.
 *
 * @param options - Optionale Konfiguration
 * @param options.clear - Vor dem Seeden alle existierenden Daten löschen (default: false)
 * @param options.verbose - Console Logs anzeigen (default: true)
 *
 * @example
 * ```typescript
 * // App.tsx
 * if (import.meta.env.DEV) {
 *   await seedTestData({ clear: true });
 * }
 * ```
 */
export async function seedTestData(options: {
  clear?: boolean;
  verbose?: boolean;
} = {}): Promise<void> {
  const { clear = false, verbose = true } = options;

  if (verbose) {
    console.log('🌱 Seeding development data...');
  }

  try {
    // Optional: Vorhandene Daten löschen
    if (clear) {
      if (verbose) console.log('  🗑️  Clearing existing data...');
      await saveJson('mietpark_crm_customers_v1', []);
      await saveJson('mietpark_crm_rentals_v1', []);
      await saveJson('mietpark_crm_messages_v1', []);
      await saveJson('mietpark_crm_invoices_v1', []);
      await saveJson('mietpark_crm_invoice_items_v1', []);
      await saveJson('mietpark_crm_resources_v1', []);
    }

    // Daten schreiben
    if (verbose) console.log('  👥 Seeding customers...');
    await saveJson('mietpark_crm_customers_v1', mockCustomers);

    if (verbose) console.log('  📋 Seeding rentals...');
    await saveJson('mietpark_crm_rentals_v1', mockRentals);

    if (verbose) console.log('  💬 Seeding messages...');
    await saveJson('mietpark_crm_messages_v1', mockMessages);

    if (verbose) console.log('  📄 Seeding invoices...');
    await saveJson('mietpark_crm_invoices_v1', mockInvoices);

    if (verbose) console.log('  📦 Seeding invoice items...');
    await saveJson('mietpark_crm_invoice_items_v1', mockInvoiceItems);

    if (verbose) console.log('  🚚 Seeding resources...');
    await saveJson('mietpark_crm_resources_v1', mockResources);

    // LocalStorage Werte für Beleg-Nummernfolge initialisieren
    const currentYear = new Date().getFullYear();
    // New numbering: AB/AU/RE + YYYY + 2-digit sequence (per type + year)
    localStorage.setItem(`mietpark_invoice_seq_AB_${currentYear}`, '1');
    localStorage.setItem(`mietpark_invoice_seq_AU_${currentYear}`, '1');
    localStorage.setItem(`mietpark_invoice_seq_RE_${currentYear}`, '1');

    if (verbose) {
      console.log('');
      console.log('✅ Testdaten erfolgreich geladen!');
      console.log('');
      console.log('📊 Summary:');
      console.log(`   - ${mockCustomers.length} Kunden`);
      console.log(`   - ${mockRentals.length} Vorgänge`);
      console.log(`   - ${mockMessages.length} Nachrichten`);
      console.log(`   - ${mockInvoices.length} Belege`);
      console.log(`   - ${mockResources.length} Ressourcen`);
      console.log('');
      console.log('💡 Tipp: Um die Seed-Daten zu entfernen, öffne die DevTools und lösche die IndexedDB:');
      console.log('   Application → Storage → IndexedDB → mietpark_crm_idb_v1 → Delete database');
    }
  } catch (error) {
    console.error('❌ Fehler beim Seeden der Testdaten:', error);
    throw error;
  }
}

/**
 * Prüft ob Testdaten bereits geladen wurden.
 */
export async function hasSeedData(): Promise<boolean> {
  const customers = await getJson<Customer[]>('mietpark_crm_customers_v1', []);
  return customers.length > 0 && customers[0].id.startsWith('customer_test_');
}

/**
 * Löscht alle Testdaten aus der IndexedDB.
 */
export async function clearSeedData(verbose: boolean = true): Promise<void> {
  if (verbose) console.log('🗑️  Clearing seed data...');

  // Alle Testdaten leeren (aber Struktur behalten)
  await saveJson('mietpark_crm_customers_v1', []);
  await saveJson('mietpark_crm_rentals_v1', []);
  await saveJson('mietpark_crm_messages_v1', []);
  await saveJson('mietpark_crm_invoices_v1', []);
  await saveJson('mietpark_crm_invoice_items_v1', []);
  await saveJson('mietpark_crm_resources_v1', []);

  if (verbose) console.log('✅ Seed data cleared');
}

// Import helper für getJson
async function getJson<T>(key: string, defaultValue: T): Promise<T> {
  // Import from _storage to avoid circular dependency
  const { getJson: _getJson } = await import('../services/_storage');
  return _getJson(key, defaultValue);
}
