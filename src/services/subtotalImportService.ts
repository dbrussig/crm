import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import type { Customer, Invoice, InvoiceItem, InvoiceState, InvoiceType, RentalRequest, SubTotalInvoiceTypeProfile } from '../types';
import { getAllCustomers, getAllInvoices, addInvoice, createCustomer, addRentalRequest } from './sqliteService';
import { getCompanyProfile, saveCompanyProfile } from '../config/companyProfile';
import { saveSubTotalInvoiceTypeProfiles } from './subtotalInvoiceTypeProfileService';
import { generateRentalId } from './rentalIdService';

type SubTotalInvoiceTypeRow = {
  InvoiceTypeId: number;
  Name?: string;
  Heading?: string;
  Color?: string;
  Language?: string;
  TaxMode?: number;
  InvoiceNo?: string;
  InvoiceDate?: string;
  DueDate?: string;
  TotalSum?: string;
  Description?: string;
  Quantity?: string;
  Unit?: string;
  UnitPrice?: string;
  Tax?: string;
  LineTotal?: string;
  ShowLineItemNo?: number;
  ShowDescription?: number;
  ShowQuantity?: number;
  ShowUnit?: number;
  ShowUnitPrice?: number;
  ShowTax?: number;
  ShowLineTotal?: number;
};

type SubTotalInvoiceRow = {
  InvoiceId: number;
  InvoiceTypeId: number;
  InvoiceNo: string;
  CompanyId: number;
  InvoiceDate: string | number; // microsoft ticks
  DueDate?: string | number | null;
  Currency: string;
  State: number;
  BuyerName: string;
  BuyerAddress: string;
  PaymentTerms: string;
  Salutation: string;
};

type SubTotalInvoiceItemRow = {
  InvoiceItemId: number;
  InvoiceId: number;
  Name: string;
  OrderIndex: number;
  UnitPrice: number;
  Quantity: number;
  TaxPercent: number;
  Unit: string;
};

type SubTotalCompanyRow = {
  ID: number;
  Name: string;
  Address: string;
  ContactInfo: string;
  PaymentInfo: string;
  Color: string;
  Logo: Uint8Array | null;
};

export type SubTotalImportOptions = {
  importCustomers?: boolean;
  importInvoices?: boolean;
  importRentals?: boolean;
  dryRun?: boolean;
};

export type SubTotalImportReport = {
  db: { invoiceTypes: number; invoices: number; invoiceItems: number };
  imported: { customers: number; invoices: number; invoiceItems: number; rentals: number };
  skipped: { customers: number; invoices: number };
  companyProfileUpdated: boolean;
  invoiceTypeProfilesUpdated: boolean;
  warnings: string[];
};

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function detectImageMime(bytes: Uint8Array): string {
  // PNG
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  // JPEG
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  // SVG (text)
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 64)).trim().toLowerCase();
  if (head.startsWith('<svg') || head.includes('<svg')) return 'image/svg+xml';
  return 'image/png';
}

function parseMicrosoftDate(ticks: string | number | null | undefined): number | undefined {
  if (ticks === null || ticks === undefined || ticks === '') return undefined;
  try {
    const tickValue = typeof ticks === 'string' ? BigInt(ticks) : BigInt(Math.trunc(Number(ticks)));
    const unixTicks = tickValue - 621355968000000000n;
    const ms = Number(unixTicks / 10000n);
    return Math.floor(ms / 1000) * 1000;
  } catch {
    return undefined;
  }
}

function extractEmailFromAddress(address: string): string | undefined {
  const emailMatch = /[\w.-]+@[\w.-]+\.\w+/.exec(address || '');
  return emailMatch?.[0];
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseAddressFromBuyerAddress(buyerAddress: string, _buyerName?: string): { street?: string; zipCode?: string; city?: string; country: string } {
  const lines = String(buyerAddress || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let street: string | undefined;
  let zipCode: string | undefined;
  let city: string | undefined;
  let country = 'Deutschland';

  for (const line of lines) {
    const zipCityMatch = /^(\d{5})\s+(.+)$/.exec(line);
    if (zipCityMatch) {
      zipCode = zipCityMatch[1];
      city = zipCityMatch[2].trim();
      continue;
    }
    if (/@/.test(line)) continue;
    if (/Deutschland|Germany/i.test(line)) continue;
    if (!street && line.length > 3) street = line;
  }
  return { street, zipCode, city, country };
}

function extractRentalDatesFromText(text: string): { rentalStart?: number; rentalEnd?: number } {
  const dateRangePattern = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const match = dateRangePattern.exec(text || '');
  if (!match) return {};
  const [, sd, sm, sy, ed, em, ey] = match;
  const start = new Date(Number(sy), Number(sm) - 1, Number(sd)).getTime();
  const end = new Date(Number(ey), Number(em) - 1, Number(ed)).getTime();
  return { rentalStart: start, rentalEnd: end };
}

function inferInvoiceType(invoiceTypeName?: string): InvoiceType {
  const n = (invoiceTypeName || '').toLowerCase();
  if (n.includes('angebot')) return 'Angebot';
  if (n.includes('auftrag')) return 'Auftrag';
  return 'Rechnung';
}

function mapInvoiceState(state: number): InvoiceState {
  // Observed in SubTotal.sqlite: 0,1,2,3. Best-effort mapping.
  if (state === 0) return 'entwurf';
  if (state === 1) return 'gesendet';
  if (state === 2) return 'storniert';
  return 'angenommen';
}

function parsePaymentBlock(text: string): {
  paymentInfo?: string;
  paypalText?: string;
  taxNote?: string;
  agbText?: string;
  depositText?: string;
  depositPercent?: number;
  otherLines: string[];
} {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let paymentInfo: string | undefined;
  let paypalText: string | undefined;
  let taxNote: string | undefined;
  let agbText: string | undefined;
  let depositText: string | undefined;
  let depositPercent: number | undefined;
  const otherLines: string[] = [];

  for (const l of lines) {
    const lower = l.toLowerCase();
    if (!paymentInfo && lower.startsWith('bezahlung')) {
      paymentInfo = l;
      continue;
    }
    if (!paypalText && lower.startsWith('zahlungslink paypal')) {
      paypalText = l;
      continue;
    }
    if (!taxNote && (lower.includes('§19') || lower.includes('ustg') || lower.includes('umsatzsteuer'))) {
      taxNote = l;
      continue;
    }
    if (!agbText && (lower.includes('agb') || lower.includes('homepage'))) {
      agbText = l;
      continue;
    }
    if (!depositText && lower.includes('anzahlung')) {
      depositText = l;
      const m = /(\d{1,3})\s*%/.exec(l);
      if (m) depositPercent = Math.min(100, Math.max(0, Number(m[1])));
      continue;
    }
    otherLines.push(l);
  }

  return { paymentInfo, paypalText, taxNote, agbText, depositText, depositPercent, otherLines };
}

async function readMaybeGzip(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // gzip magic: 1F 8B
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const DecompressionStreamCtor = (window as any).DecompressionStream;
    if (!DecompressionStreamCtor) {
      throw new Error('Gzip-Datei erkannt, aber DecompressionStream wird vom Browser nicht unterstuetzt. Bitte Datei vorher entpacken und erneut importieren.');
    }
    // Browser-native gzip decode (Chrome/Edge/Safari 16+)
    const ds = new DecompressionStreamCtor('gzip');
    const decompressed = await new Response(file.stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(decompressed);
  }
  return bytes;
}

function extractProductTypeFromDescription(description: string): {
  productType: RentalRequest['productType'];
  includeRoofRack?: boolean;
  relingType?: RentalRequest['relingType'];
} {
  const lower = (description || '').toLowerCase();

  if (lower.includes('hüpfburg') || lower.includes('huepfburg')) return { productType: 'Hüpfburg' };
  if (lower.includes('heckbox')) return { productType: 'Heckbox' };
  if (lower.includes('fahrrad')) return { productType: 'Fahrradträger' };

  const includeRoofRack = lower.includes('mit grundträger') || lower.includes('mit dachträger');
  let relingType: RentalRequest['relingType'] | undefined;
  if (lower.includes('geschlossen')) relingType = 'geschlossen';
  if (lower.includes('offen')) relingType = 'offen';

  if (lower.includes(' 300') || lower.includes('300l') || lower.includes('320l') || lower.includes('dachbox m')) {
    return { productType: 'Dachbox M', includeRoofRack, relingType };
  }
  return { productType: 'Dachbox XL', includeRoofRack, relingType };
}

function execRows<T = any>(db: any, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: any[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out as T[];
}

function decodeShow(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  // Based on the user's SubTotal DB: 0 = visible, 1/2 = hidden.
  if (Number.isNaN(n)) return undefined;
  return n === 0;
}

export async function importFromSubTotalFile(file: File, options?: SubTotalImportOptions): Promise<SubTotalImportReport> {
  let opts: Required<SubTotalImportOptions> = {
    importCustomers: options?.importCustomers ?? true,
    importInvoices: options?.importInvoices ?? true,
    importRentals: options?.importRentals ?? true,
    dryRun: options?.dryRun ?? false,
  };

  const warnings: string[] = [];

  // Keep referential integrity: invoices/rentals reference customers.
  if ((opts.importInvoices || opts.importRentals) && !opts.importCustomers) {
    warnings.push('Import-Hinweis: "Belege" oder "Vorgaenge" ist aktiv, aber "Kunden" war deaktiviert. Kunden werden trotzdem angelegt, damit Zuordnungen funktionieren.');
    opts = { ...opts, importCustomers: true };
  }

  const bytes = await readMaybeGzip(file);
  const header = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 16));
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('Datei ist keine SQLite-Datenbank (oder gzip davon).');
  }

  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(bytes);

  const invoiceTypes = execRows<SubTotalInvoiceTypeRow>(
    db,
    'select InvoiceTypeId, Name, Heading, Color, Language, TaxMode, InvoiceNo, InvoiceDate, DueDate, TotalSum, Description, Quantity, Unit, UnitPrice, Tax, LineTotal, ShowLineItemNo, ShowDescription, ShowQuantity, ShowUnit, ShowUnitPrice, ShowTax, ShowLineTotal from InvoiceTypes'
  );
  const invoices = execRows<SubTotalInvoiceRow>(db, 'select InvoiceId, InvoiceTypeId, InvoiceNo, CompanyId, InvoiceDate, DueDate, Currency, State, BuyerName, BuyerAddress, PaymentTerms, Salutation from Invoices');
  const invoiceItems = execRows<SubTotalInvoiceItemRow>(
    db,
    'select InvoiceItemId, InvoiceId, Name, OrderIndex, UnitPrice, Quantity, TaxPercent, Unit from InvoiceItems'
  );
  const companies = execRows<any>(db, 'select ID, Name, Address, ContactInfo, PaymentInfo, Color, Logo from Companies limit 1');

  const byTypeId = new Map<number, SubTotalInvoiceTypeRow>();
  for (const t of invoiceTypes) byTypeId.set(Number(t.InvoiceTypeId), t);

  // Store SubTotal invoice type profiles (labels + visibility)
  let invoiceTypeProfilesUpdated = false;
  if (!opts.dryRun && invoiceTypes.length) {
    const profiles: SubTotalInvoiceTypeProfile[] = invoiceTypes.map((t) => ({
      source: 'subtotal',
      invoiceTypeId: Number(t.InvoiceTypeId),
      name: String(t.Name || '').trim(),
      heading: t.Heading ? String(t.Heading) : undefined,
      color: t.Color ? String(t.Color) : undefined,
      language: t.Language ? String(t.Language) : undefined,
      taxMode: typeof t.TaxMode === 'number' ? t.TaxMode : (t.TaxMode !== undefined ? Number(t.TaxMode) : undefined),
      labels: {
        invoiceNo: t.InvoiceNo ? String(t.InvoiceNo) : undefined,
        invoiceDate: t.InvoiceDate ? String(t.InvoiceDate) : undefined,
        dueDate: t.DueDate ? String(t.DueDate) : undefined,
        totalSum: t.TotalSum ? String(t.TotalSum) : undefined,
        description: t.Description ? String(t.Description) : undefined,
        quantity: t.Quantity ? String(t.Quantity) : undefined,
        unit: t.Unit ? String(t.Unit) : undefined,
        unitPrice: t.UnitPrice ? String(t.UnitPrice) : undefined,
        tax: t.Tax ? String(t.Tax) : undefined,
        lineTotal: t.LineTotal ? String(t.LineTotal) : undefined,
      },
      show: {
        lineItemNo: decodeShow(t.ShowLineItemNo),
        description: decodeShow(t.ShowDescription),
        quantity: decodeShow(t.ShowQuantity),
        unit: decodeShow(t.ShowUnit),
        unitPrice: decodeShow(t.ShowUnitPrice),
        tax: decodeShow(t.ShowTax),
        lineTotal: decodeShow(t.ShowLineTotal),
      },
    }));
    saveSubTotalInvoiceTypeProfiles(profiles);
    invoiceTypeProfilesUpdated = true;
  }

  // Update Company Profile (logo + accent)
  let companyProfileUpdated = false;
  if (companies.length) {
    const c0 = companies[0] as SubTotalCompanyRow;
    const current = getCompanyProfile();
    const next = { ...current };
    if (c0.Name) next.companyName = c0.Name;
    if (c0.Color) next.accentColor = c0.Color;

    // Address: "Inhaber Daniel...\nStreet\nZip City"
    const addrLines = String(c0.Address || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const ownerLine = addrLines[0] || '';
    const mOwner = /Inhaber\s+(.+)/i.exec(ownerLine);
    if (mOwner?.[1]) next.ownerName = mOwner[1].trim();
    if (addrLines[1]) next.street = addrLines[1];
    if (addrLines[2]) {
      const m = /^(\d{5})\s+(.+)$/.exec(addrLines[2]);
      if (m) {
        next.zipCode = m[1];
        next.city = m[2].trim();
      }
    }

    const contactLines = String(c0.ContactInfo || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (contactLines[0]) next.phone = contactLines[0];
    if (contactLines[1]) next.email = contactLines[1];
    if (contactLines[2]) next.website = contactLines[2];

    const payLines = String(c0.PaymentInfo || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (payLines[0]) next.bankName = payLines[0];
    if (payLines[1]) next.bankAccountName = payLines[1];
    if (payLines[2]) next.iban = payLines[2];
    const paypalLine = payLines.find((l) => l.toLowerCase().includes('paypal'));
    const paypalEmail = paypalLine ? (paypalLine.split(':')[1] || '').trim() : '';
    if (paypalEmail) next.paypalEmail = paypalEmail;

    const logoAny = (c0 as any).Logo;
    if (logoAny && logoAny.length) {
      const logoBytes = logoAny instanceof Uint8Array ? logoAny : new Uint8Array(logoAny);
      const mime = detectImageMime(logoBytes);
      next.logoDataUrl = `data:${mime};base64,${bytesToBase64(logoBytes)}`;
    } else if (!current.logoDataUrl) {
      warnings.push('Kein Logo in der SubTotal-DB gefunden.');
    }

    if (!opts.dryRun) {
      saveCompanyProfile(next);
    }
    companyProfileUpdated = true;
  } else {
    warnings.push('Keine Companies-Zeile gefunden; Firmenprofil wurde nicht uebernommen.');
  }

  // Existing data for de-duplication
  const existingCustomers = await getAllCustomers();
  const existingInvoices = await getAllInvoices();
  const customersByEmail = new Map<string, Customer>();
  const customersByKey = new Map<string, Customer>();
  for (const c of existingCustomers) {
    const e = (c.email || '').trim().toLowerCase();
    if (e) customersByEmail.set(e, c);
    const k = `${(c.firstName || '').trim().toLowerCase()}|${(c.lastName || '').trim().toLowerCase()}|${(c.address?.street || '').trim().toLowerCase()}|${(c.address?.zipCode || '').trim()}`;
    if (k !== '|||') customersByKey.set(k, c);
  }
  const invoicesByNo = new Map<string, Invoice>();
  for (const inv of existingInvoices) invoicesByNo.set(String(inv.invoiceNo), inv);

  let importedCustomers = 0;
  let skippedCustomers = 0;
  let importedInvoices = 0;
  let importedInvoiceItems = 0;
  let skippedInvoices = 0;
  let importedRentals = 0;

  const ensureCustomer = async (buyerName: string, buyerAddress: string): Promise<Customer> => {
    const email = extractEmailFromAddress(buyerAddress);
    const key = (email || '').trim().toLowerCase();
    if (key && customersByEmail.has(key)) {
      skippedCustomers++;
      return customersByEmail.get(key)!;
    }

    const { firstName, lastName } = parseName(buyerName);
    const addr = parseAddressFromBuyerAddress(buyerAddress, buyerName);
    const fallbackKey = `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${(addr.street || '').trim().toLowerCase()}|${(addr.zipCode || '').trim()}`;
    if (!key && customersByKey.has(fallbackKey)) {
      skippedCustomers++;
      return customersByKey.get(fallbackKey)!;
    }
    const now = Date.now();
    const id = `customer_import_${now}_${Math.random().toString(16).slice(2)}`;
    const c: Customer = {
      id,
      salutation: '',
      firstName,
      lastName,
      email: email || '',
      phone: '',
      address: {
        street: addr.street || '',
        zipCode: addr.zipCode || '',
        city: addr.city || '',
        country: addr.country || 'Deutschland',
      },
      contactDate: now,
      createdAt: now,
      updatedAt: now,
      notes: 'Importiert aus SubTotal',
    } as any;

    if (!opts.dryRun && opts.importCustomers) {
      await createCustomer(c);
    }
    if (key) customersByEmail.set(key, c);
    if (!key) customersByKey.set(fallbackKey, c);
    importedCustomers++;
    return c;
  };

  // If the user only imports customers (no invoices), derive customers from invoice buyer blocks.
  // SubTotal doesn't always store a separate customer table in the export; invoices are the most reliable source.
  if (opts.importCustomers && !opts.importInvoices) {
    for (const src of invoices) {
      // Best-effort: skip empty buyer blocks.
      if (!src?.BuyerName && !src?.BuyerAddress) continue;
      await ensureCustomer(src.BuyerName || '', src.BuyerAddress || '');
    }
  }

  // Group items by invoice id
  const itemsByInvoiceId = new Map<number, SubTotalInvoiceItemRow[]>();
  for (const it of invoiceItems) {
    const id = Number(it.InvoiceId);
    const arr = itemsByInvoiceId.get(id) || [];
    arr.push(it);
    itemsByInvoiceId.set(id, arr);
  }
  for (const arr of itemsByInvoiceId.values()) arr.sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex));

  for (const src of invoices) {
    if (!opts.importInvoices) continue;
    const invoiceNo = String(src.InvoiceNo);
    if (invoicesByNo.has(invoiceNo)) {
      skippedInvoices++;
      continue;
    }

    const t = byTypeId.get(Number(src.InvoiceTypeId));
    const type = inferInvoiceType(t?.Name);
    const customer = await ensureCustomer(src.BuyerName, src.BuyerAddress);
    const invDate = parseMicrosoftDate(src.InvoiceDate) || Date.now();
    const due = parseMicrosoftDate(src.DueDate || null);
    const state = mapInvoiceState(Number(src.State));

    const intro = String(src.Salutation || '').replaceAll('{client}', src.BuyerName).trim();
    const parsedPay = parsePaymentBlock(src.PaymentTerms || '');

    // service period: try from first item date range, else from payment text
    const srcItems = itemsByInvoiceId.get(Number(src.InvoiceId)) || [];
    const periodFromItems = srcItems.map((x) => extractRentalDatesFromText(x.Name || '')).find((x) => x.rentalStart && x.rentalEnd) || {};
    const periodFromPay = extractRentalDatesFromText(src.PaymentTerms || '');
    const servicePeriodStart = periodFromItems.rentalStart || periodFromPay.rentalStart;
    const servicePeriodEnd = periodFromItems.rentalEnd || periodFromPay.rentalEnd;

    const inv: Invoice = {
      id: `invoice_import_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      invoiceType: type,
      invoiceNo,
      invoiceDate: invDate,
      dueDate: due,
      state,
      currency: src.Currency || 'EUR',
      companyId: customer.id,
      buyerName: src.BuyerName,
      buyerAddress: src.BuyerAddress,
      salutation: '',
      introText: intro || undefined,
      servicePeriodStart,
      servicePeriodEnd,
      paymentTerms: '',
      paymentInfo: parsedPay.paymentInfo,
      paypalText: parsedPay.paypalText,
      taxNote: parsedPay.taxNote,
      agbText: parsedPay.agbText,
      depositText: parsedPay.depositText,
      depositPercent: parsedPay.depositPercent,
      footerText: parsedPay.otherLines.join('\n'),
      agbLink: getCompanyProfile().agbsUrl,
      layoutId: 'mietpark_v1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const its: InvoiceItem[] = srcItems.map((it, idx) => ({
      id: `item_import_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
      invoiceId: inv.id,
      orderIndex: Number(it.OrderIndex) || idx,
      name: it.Name || '',
      unit: it.Unit || '',
      unitPrice: Number(it.UnitPrice) || 0,
      quantity: Number(it.Quantity) || 0,
      taxPercent: Number(it.TaxPercent) || 0,
      createdAt: Date.now(),
    }));

    if (!opts.dryRun && opts.importInvoices) {
      await addInvoice(inv, its);
    }
    importedInvoices++;
    importedInvoiceItems += its.length;
    invoicesByNo.set(invoiceNo, inv);

	    if (opts.importRentals && servicePeriodStart && servicePeriodEnd) {
	      const firstDesc = (its[0]?.name || '').split('\n')[0].trim();
	      const productGuess = extractProductTypeFromDescription(its.map((x) => x.name).join('\n'));
	      const rentalId = await generateRentalId(new Date(invDate));
	      const rental: RentalRequest = {
	        id: rentalId,
	        customerId: customer.id,
	        productType: productGuess.productType,
	        status: state === 'storniert' ? 'storniert' : 'abgeschlossen',
	        title: `${type} ${invoiceNo}${firstDesc ? `: ${firstDesc}` : ''}`,
        description: `Import aus SubTotal (Beleg ${invoiceNo})`,
        rentalStart: servicePeriodStart,
        rentalEnd: servicePeriodEnd,
        includeRoofRack: productGuess.includeRoofRack,
        relingType: productGuess.relingType,
        priceSnapshot: its.reduce((sum, x) => sum + (x.unitPrice || 0) * (x.quantity || 0), 0),
        createdAt: invDate,
        updatedAt: Date.now(),
      } as any;
      if (!opts.dryRun) {
        await addRentalRequest(rental);
      }
      importedRentals++;
    }
  }

  db.close();

  return {
    db: { invoiceTypes: invoiceTypes.length, invoices: invoices.length, invoiceItems: invoiceItems.length },
    imported: { customers: opts.importCustomers ? importedCustomers : 0, invoices: opts.importInvoices ? importedInvoices : 0, invoiceItems: opts.importInvoices ? importedInvoiceItems : 0, rentals: opts.importRentals ? importedRentals : 0 },
    skipped: { customers: skippedCustomers, invoices: skippedInvoices },
    companyProfileUpdated,
    invoiceTypeProfilesUpdated,
    warnings,
  };
}
