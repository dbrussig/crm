import type { Invoice, InvoiceItem, InvoiceState, InvoiceTemplate, InvoiceType } from '../types';
import { addInvoice, deleteInvoice, getAllInvoices, getInvoiceItems, updateInvoice } from './sqliteService';
import { getDefaultInvoiceLayoutId, getInvoiceLayout } from '../config/invoiceLayouts';

const DEFAULT_TEMPLATES: Record<InvoiceType, InvoiceTemplate> = {
  Angebot: {
    invoiceType: 'Angebot',
    layoutId: getDefaultInvoiceLayoutId('Angebot'),
    defaultIntroText: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.introText,
    defaultPaymentTerms: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.paymentTerms,
    defaultPaymentInfo: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.paymentInfo,
    defaultPaypalText: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.paypalText,
    defaultFooterText: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.footerText,
    defaultTaxNote: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.taxNote,
    defaultAgbText: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.agbText,
    defaultAgbLink: 'https://www.mietpark-saar-pfalz.com/agb/',
    defaultDepositPercent: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.depositPercent,
    defaultDepositText: getInvoiceLayout(getDefaultInvoiceLayoutId('Angebot')).defaultsByType.Angebot.depositText,
  },
  Auftrag: {
    invoiceType: 'Auftrag',
    layoutId: getDefaultInvoiceLayoutId('Auftrag'),
    defaultIntroText: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.introText,
    defaultPaymentTerms: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.paymentTerms,
    defaultPaymentInfo: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.paymentInfo,
    defaultPaypalText: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.paypalText,
    defaultFooterText: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.footerText,
    defaultTaxNote: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.taxNote,
    defaultAgbText: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.agbText,
    defaultAgbLink: 'https://www.mietpark-saar-pfalz.com/agb/',
    defaultDepositPercent: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.depositPercent,
    defaultDepositText: getInvoiceLayout(getDefaultInvoiceLayoutId('Auftrag')).defaultsByType.Auftrag.depositText,
  },
  Rechnung: {
    invoiceType: 'Rechnung',
    layoutId: getDefaultInvoiceLayoutId('Rechnung'),
    defaultIntroText: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.introText,
    defaultPaymentTerms: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.paymentTerms,
    defaultPaymentInfo: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.paymentInfo,
    defaultPaypalText: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.paypalText,
    defaultFooterText: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.footerText,
    defaultTaxNote: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.taxNote,
    defaultAgbText: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.agbText,
    defaultAgbLink: 'https://www.mietpark-saar-pfalz.com/agb/',
    defaultDepositPercent: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.depositPercent,
    defaultDepositText: getInvoiceLayout(getDefaultInvoiceLayoutId('Rechnung')).defaultsByType.Rechnung.depositText,
  },
};

function getInvoicePrefix(type: InvoiceType): string {
  if (type === 'Angebot') return 'AB';
  if (type === 'Auftrag') return 'AU';
  return 'RE';
}

function deriveFollowUpInvoiceNo(sourceNo: string, targetType: InvoiceType): string | null {
  const prefix = getInvoicePrefix(targetType);
  const raw = String(sourceNo || '').trim().toUpperCase();
  if (!raw) return null;

  // Keep separators if present: AN-2026-034 -> AU-2026-034.
  const withSeparators = /^(?:AB|AN|AU|RE)([-_])(\d{4})\1(\d{1,6})(?:-\d+)?$/.exec(raw);
  if (withSeparators?.[1] && withSeparators?.[2] && withSeparators?.[3]) {
    return `${prefix}${withSeparators[1]}${withSeparators[2]}${withSeparators[1]}${withSeparators[3]}`;
  }

  // Compact fallback: AN2026034 -> AU2026034.
  const compact = /^(?:AB|AN|AU|RE)(\d{4})(\d{1,6})(?:-\d+)?$/.exec(raw);
  if (compact?.[1] && compact?.[2]) {
    return `${prefix}${compact[1]}${compact[2]}`;
  }

  return null;
}

async function genInvoiceNo(type: InvoiceType, now = new Date(), maxAttempts = 10): Promise<string> {
  const yyyy = now.getFullYear();
  const prefix = getInvoicePrefix(type);
  const all = await getAllInvoices();

  // Build set of existing numbers for quick lookup
  const existingNos = new Set(all.map((inv) => String(inv.invoiceNo || '').trim().toUpperCase()));

  // Angebote may exist as legacy "AN" prefix; new format is always AB/AU/RE-YYYY-SEQ.
  const scanPrefixes = type === 'Angebot' ? ['AB', 'AN'] : [prefix];
  const reList = scanPrefixes.map((p) => new RegExp(`^${p}[-_]?${yyyy}[-_]?(\\d+)$`));
  let maxSeq = 0;

  for (const inv of all) {
    const no = String(inv.invoiceNo || '').trim().toUpperCase();
    for (const re of reList) {
      const m = re.exec(no);
      if (!m?.[1]) continue;
      const seq = Number(m[1]);
      if (Number.isFinite(seq)) {
        maxSeq = Math.max(maxSeq, seq);
      }
    }
  }

  // Try to find a unique number
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const next = maxSeq + attempt + 1;
    const candidate = `${prefix}-${yyyy}-${String(next).padStart(3, '0')}`;
    if (!existingNos.has(candidate.toUpperCase())) {
      return candidate;
    }
  }

  // Fallback: use timestamp suffix
  const ts = Date.now().toString().slice(-6);
  return `${prefix}-${yyyy}-${ts}`;
}

async function isInvoiceNoDuplicate(no: string, excludeId?: string): Promise<boolean> {
  const all = await getAllInvoices();
  const normalized = String(no || '').trim().toUpperCase();
  if (!normalized) return false;

  return all.some((inv) => {
    if (excludeId && inv.id === excludeId) return false;
    return String(inv.invoiceNo || '').trim().toUpperCase() === normalized;
  });
}

export async function fetchInvoiceTemplate(type: InvoiceType): Promise<InvoiceTemplate | null> {
  return DEFAULT_TEMPLATES[type] ?? null;
}

export async function fetchAllInvoices(): Promise<Invoice[]> {
  return getAllInvoices();
}

export async function fetchInvoicesByType(type: InvoiceType): Promise<Invoice[]> {
  const all = await getAllInvoices();
  return all.filter((i) => i.invoiceType === type);
}

export async function fetchInvoicesByState(state: InvoiceState): Promise<Invoice[]> {
  const all = await getAllInvoices();
  return all.filter((i) => i.state === state);
}

export async function removeInvoice(id: string): Promise<void> {
  return deleteInvoice(id);
}

export async function fetchInvoiceByNo(invoiceNo: string): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const all = await getAllInvoices();
  const invoice = all.find((i) => i.invoiceNo === invoiceNo);
  if (!invoice) return null;
  const items = await getInvoiceItems(invoice.id);
  return { invoice, items };
}

export async function fetchInvoiceById(invoiceId: string): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const all = await getAllInvoices();
  const invoice = all.find((i) => i.id === invoiceId);
  if (!invoice) return null;
  const items = await getInvoiceItems(invoice.id);
  return { invoice, items };
}

export async function createFollowUpInvoiceFromInvoice(
  sourceInvoiceId: string,
  targetType: InvoiceType
): Promise<string> {
  const src = await fetchInvoiceById(sourceInvoiceId);
  if (!src) throw new Error('Quelle-Beleg nicht gefunden');

  // Idempotent conversion: if source already references a follow-up of the requested target type,
  // return that invoice instead of creating another one.
  const existingFollowUpId = String(src.invoice.replacesInvoiceId || '').trim();
  if (existingFollowUpId) {
    const existingFollowUp = await fetchInvoiceById(existingFollowUpId);
    if (existingFollowUp?.invoice?.invoiceType === targetType) {
      return existingFollowUp.invoice.id;
    }
  }

  const now = Date.now();
  const newId = `invoice_${now}_${Math.random().toString(16).slice(2)}`;
  const tpl = await fetchInvoiceTemplate(targetType);
  const layoutId = tpl?.layoutId || getDefaultInvoiceLayoutId(targetType);
  const layout = getInvoiceLayout(layoutId);
  const d = layout.defaultsByType[targetType];

  const invDate = now;
  const due = typeof d.dueDays === 'number' && d.dueDays > 0 ? (invDate + d.dueDays * 24 * 60 * 60 * 1000) : undefined;

  const allExisting = await getAllInvoices();
  const existingNos = new Set(allExisting.map((i) => String(i.invoiceNo || '').trim().toUpperCase()));
  const preferredNo = deriveFollowUpInvoiceNo(src.invoice.invoiceNo, targetType);

  // If target already exists for this rental/type/derived number, reuse it.
  if (preferredNo) {
    const preferredExisting = allExisting.find((inv) =>
      inv.invoiceType === targetType &&
      String(inv.invoiceNo || '').trim().toUpperCase() === String(preferredNo).trim().toUpperCase() &&
      String(inv.rentalRequestId || '') === String(src.invoice.rentalRequestId || '')
    );
    if (preferredExisting) {
      await updateInvoice(sourceInvoiceId, { replacesInvoiceId: preferredExisting.id });
      return preferredExisting.id;
    }
  }

  const preferredUnique = preferredNo && !existingNos.has(String(preferredNo).trim().toUpperCase()) ? preferredNo : null;

  const next: Invoice = {
    ...src.invoice,
    id: newId,
    invoiceType: targetType,
    invoiceNo: preferredUnique || (await genInvoiceNo(targetType, new Date(invDate))),
    invoiceDate: invDate,
    dueDate: due,
    state: 'entwurf',
    // Apply defaults per new type, but keep user-edited blocks if they were set explicitly on the source.
    layoutId,
    introText: tpl?.defaultIntroText ?? d.introText,
    paymentTerms: tpl?.defaultPaymentTerms ?? d.paymentTerms,
    paymentInfo: tpl?.defaultPaymentInfo ?? d.paymentInfo,
    paypalText: tpl?.defaultPaypalText ?? d.paypalText,
    footerText: tpl?.defaultFooterText ?? d.footerText,
    taxNote: tpl?.defaultTaxNote ?? d.taxNote,
    agbText: tpl?.defaultAgbText ?? d.agbText,
    agbLink: tpl?.defaultAgbLink ?? src.invoice.agbLink,
    depositEnabled:
      targetType !== 'Rechnung'
        ? Boolean(src.invoice.depositEnabled)
        : undefined,
    depositPercent:
      targetType !== 'Rechnung'
        ? (typeof src.invoice.depositPercent === 'number'
            ? src.invoice.depositPercent
            : (tpl?.defaultDepositPercent ?? d.depositPercent))
        : undefined,
    depositText:
      targetType !== 'Rechnung'
        ? (src.invoice.depositText ?? tpl?.defaultDepositText ?? d.depositText)
        : undefined,
    depositReceivedEnabled: targetType === 'Rechnung' ? Boolean(src.invoice.depositReceivedEnabled) : undefined,
    depositReceivedAmount: targetType === 'Rechnung' ? (src.invoice.depositReceivedAmount ?? undefined) : undefined,
    reissuedFromInvoiceId: undefined,
    replacesInvoiceId: undefined,
    createdAt: invDate,
    updatedAt: invDate,
  };

  const nextItems: InvoiceItem[] = src.items.map((it, idx) => ({
    ...it,
    id: `item_${now}_${idx}_${Math.random().toString(16).slice(2)}`,
    invoiceId: newId,
    createdAt: now,
  }));

  await addInvoice(next, nextItems);
  // Backlink only. Archiving is explicit user action.
  await updateInvoice(sourceInvoiceId, { replacesInvoiceId: newId });
  return newId;
}

function baseInvoiceNo(no: string): string {
  const s = String(no || '').trim();
  const m = /^(.*?)(-\d+)?$/.exec(s);
  return m?.[1] || s;
}

export async function reissueInvoice(invoiceId: string): Promise<string> {
  const src = await fetchInvoiceById(invoiceId);
  if (!src) throw new Error('Rechnung nicht gefunden');
  if (src.invoice.invoiceType !== 'Rechnung') throw new Error('Nur Rechnungen koennen neu generiert werden');

  const all = await getAllInvoices();
  const base = baseInvoiceNo(src.invoice.invoiceNo);
  let maxSuffix = 1;
  for (const inv of all) {
    const no = String(inv.invoiceNo || '');
    const mm = new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}-([0-9]+)$`).exec(no);
    if (mm?.[1]) maxSuffix = Math.max(maxSuffix, Number(mm[1]));
  }
  const nextSuffix = maxSuffix + 1;

  // Storno old
  await updateInvoice(invoiceId, { state: 'storniert' });

  const now = Date.now();
  const newId = `invoice_${now}_${Math.random().toString(16).slice(2)}`;
  const tpl = await fetchInvoiceTemplate('Rechnung');
  const layoutId = tpl?.layoutId || getDefaultInvoiceLayoutId('Rechnung');
  const layout = getInvoiceLayout(layoutId);
  const d = layout.defaultsByType.Rechnung;
  const invDate = now;
  const due = typeof d.dueDays === 'number' && d.dueDays > 0 ? (invDate + d.dueDays * 24 * 60 * 60 * 1000) : undefined;

  const next: Invoice = {
    ...src.invoice,
    id: newId,
    invoiceType: 'Rechnung',
    invoiceNo: `${base}-${nextSuffix}`,
    invoiceDate: invDate,
    dueDate: due,
    state: 'entwurf',
    layoutId,
    introText: src.invoice.introText || tpl?.defaultIntroText || d.introText,
    paymentTerms: src.invoice.paymentTerms || tpl?.defaultPaymentTerms || d.paymentTerms,
    paymentInfo: src.invoice.paymentInfo || tpl?.defaultPaymentInfo || d.paymentInfo,
    paypalText: src.invoice.paypalText || tpl?.defaultPaypalText || d.paypalText,
    footerText: src.invoice.footerText || tpl?.defaultFooterText || d.footerText,
    taxNote: src.invoice.taxNote || tpl?.defaultTaxNote || d.taxNote,
    agbText: src.invoice.agbText || tpl?.defaultAgbText || d.agbText,
    agbLink: src.invoice.agbLink || tpl?.defaultAgbLink,
    reissuedFromInvoiceId: invoiceId,
    replacesInvoiceId: undefined,
    createdAt: invDate,
    updatedAt: invDate,
  };

  const nextItems: InvoiceItem[] = src.items.map((it, idx) => ({
    ...it,
    id: `item_${now}_${idx}_${Math.random().toString(16).slice(2)}`,
    invoiceId: newId,
    createdAt: now,
  }));

  await addInvoice(next, nextItems);
  await updateInvoice(invoiceId, { replacesInvoiceId: newId });
  return newId;
}

export async function createInvoiceFromRental(
  rentalId: string,
  invoiceType: InvoiceType,
  items: Array<{ name: string; quantity: number; unitPrice: number; unit: string; taxPercent?: number }>,
  customerId: string,
  opts?: { dueDate?: number; buyerName?: string; buyerAddress?: string }
): Promise<string> {
  void rentalId; // kept for future linkage
  const now = Date.now();
  const id = `invoice_${now}`;
  const tpl = await fetchInvoiceTemplate(invoiceType);

  const invoice: Invoice = {
    id,
    rentalRequestId: rentalId,
    invoiceType,
    invoiceNo: await genInvoiceNo(invoiceType),
    invoiceDate: now,
    dueDate: opts?.dueDate,
    state: 'entwurf',
    currency: 'EUR',
    companyId: customerId,
    buyerName: opts?.buyerName || '',
    buyerAddress: opts?.buyerAddress || '',
    layoutId: tpl?.layoutId,
    introText: tpl?.defaultIntroText,
    paypalText: tpl?.defaultPaypalText,
    paymentTerms: tpl?.defaultPaymentTerms,
    paymentInfo: tpl?.defaultPaymentInfo,
    footerText: tpl?.defaultFooterText,
    taxNote: tpl?.defaultTaxNote,
    agbText: tpl?.defaultAgbText,
    agbLink: tpl?.defaultAgbLink,
    depositPercent: tpl?.defaultDepositPercent,
    depositText: tpl?.defaultDepositText,
    depositEnabled: invoiceType !== 'Rechnung' ? false : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const invoiceItems: InvoiceItem[] = items.map((it, idx) => ({
    id: `item_${now}_${idx}`,
    invoiceId: id,
    orderIndex: idx,
    name: it.name,
    unit: it.unit,
    unitPrice: it.unitPrice,
    quantity: it.quantity,
    taxPercent: it.taxPercent ?? 0,
    createdAt: now,
  }));

  await addInvoice(invoice, invoiceItems);
  return id;
}

export async function saveInvoice(invoice: Partial<Invoice>, items: InvoiceItem[]): Promise<string> {
  const now = Date.now();
  if (!invoice.id) {
    const id = `invoice_${now}`;
    const tpl = await fetchInvoiceTemplate(invoice.invoiceType || 'Angebot');

    // Generate or validate invoice number
    let invoiceNo = invoice.invoiceNo;
    if (!invoiceNo) {
      invoiceNo = await genInvoiceNo(invoice.invoiceType || 'Angebot');
    }

    // Check for duplicates
    if (await isInvoiceNoDuplicate(invoiceNo)) {
      throw new Error(`Belegnummer "${invoiceNo}" existiert bereits. Bitte wählen Sie eine andere Nummer.`);
    }

    const inv: Invoice = {
      id,
      rentalRequestId: invoice.rentalRequestId,
      invoiceType: invoice.invoiceType || 'Angebot',
      invoiceNo,
      invoiceDate: invoice.invoiceDate || now,
      dueDate: invoice.dueDate,
      state: invoice.state || 'entwurf',
      currency: invoice.currency || 'EUR',
      companyId: invoice.companyId || '',
      buyerName: invoice.buyerName || '',
      buyerAddress: invoice.buyerAddress || '',
      salutation: invoice.salutation,
      layoutId: invoice.layoutId || tpl?.layoutId,
      introText: invoice.introText ?? tpl?.defaultIntroText,
      paymentTerms: invoice.paymentTerms ?? tpl?.defaultPaymentTerms,
      paymentInfo: invoice.paymentInfo ?? tpl?.defaultPaymentInfo,
      paypalText: invoice.paypalText ?? tpl?.defaultPaypalText,
      footerText: invoice.footerText ?? tpl?.defaultFooterText,
      taxNote: invoice.taxNote ?? tpl?.defaultTaxNote,
      agbText: invoice.agbText ?? tpl?.defaultAgbText,
      agbLink: invoice.agbLink ?? tpl?.defaultAgbLink,
      depositPercent: invoice.depositPercent ?? tpl?.defaultDepositPercent,
      depositText: invoice.depositText ?? tpl?.defaultDepositText,
      depositEnabled: (invoice.invoiceType || 'Angebot') !== 'Rechnung' ? (invoice.depositEnabled ?? false) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await addInvoice(inv, items);
    return id;
  }

  // For updates, check if new invoiceNo conflicts with another invoice
  if (invoice.invoiceNo) {
    if (await isInvoiceNoDuplicate(invoice.invoiceNo, invoice.id)) {
      throw new Error(`Belegnummer "${invoice.invoiceNo}" existiert bereits. Bitte wählen Sie eine andere Nummer.`);
    }
  }

  await updateInvoice(invoice.id, invoice as Partial<Invoice>, items);
  return invoice.id;
}

export async function convertOfferToOrder(invoiceId: string): Promise<string> {
  return createFollowUpInvoiceFromInvoice(invoiceId, 'Auftrag');
}

export async function convertOrderToInvoice(invoiceId: string): Promise<string> {
  return createFollowUpInvoiceFromInvoice(invoiceId, 'Rechnung');
}
