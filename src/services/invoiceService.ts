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

async function genInvoiceNo(type: InvoiceType, now = new Date()): Promise<string> {
  // Robust format: AB/AU/RE + YYYY + 3-digit running number, derived from persisted invoices.
  // Avoids localStorage counter reset issues across reinstalls/cache clears.
  const yyyy = now.getFullYear();
  const prefix = getInvoicePrefix(type);
  const all = await getAllInvoices();
  const re = new RegExp(`^${prefix}${yyyy}(\\d+)$`);
  let maxSeq = 0;

  for (const inv of all) {
    const no = String(inv.invoiceNo || '').trim();
    const m = re.exec(no);
    if (!m?.[1]) continue;
    const seq = Number(m[1]);
    if (Number.isFinite(seq)) {
      maxSeq = Math.max(maxSeq, seq);
    }
  }

  const next = maxSeq + 1;
  return `${prefix}${yyyy}${String(next).padStart(3, '0')}`;
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

  const now = Date.now();
  const newId = `invoice_${now}_${Math.random().toString(16).slice(2)}`;
  const tpl = await fetchInvoiceTemplate(targetType);
  const layoutId = tpl?.layoutId || getDefaultInvoiceLayoutId(targetType);
  const layout = getInvoiceLayout(layoutId);
  const d = layout.defaultsByType[targetType];

  const invDate = now;
  const due = typeof d.dueDays === 'number' && d.dueDays > 0 ? (invDate + d.dueDays * 24 * 60 * 60 * 1000) : undefined;

  const next: Invoice = {
    ...src.invoice,
    id: newId,
    invoiceType: targetType,
    invoiceNo: await genInvoiceNo(targetType, new Date(invDate)),
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
  // Best-effort: store backlink on source invoice (for navigation/audit).
  const sourceUpdates: Partial<Invoice> =
    (src.invoice.invoiceType === 'Auftrag' && targetType === 'Rechnung') ||
    (src.invoice.invoiceType === 'Angebot' && targetType === 'Auftrag')
      ? { replacesInvoiceId: newId, state: 'archiviert' }
      : { replacesInvoiceId: newId };
  await updateInvoice(sourceInvoiceId, sourceUpdates);
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
    const inv: Invoice = {
      id,
      rentalRequestId: invoice.rentalRequestId,
      invoiceType: invoice.invoiceType || 'Angebot',
      invoiceNo: invoice.invoiceNo || await genInvoiceNo(invoice.invoiceType || 'Angebot'),
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

  await updateInvoice(invoice.id, invoice as Partial<Invoice>, items);
  return invoice.id;
}

export async function convertOfferToOrder(invoiceId: string): Promise<string> {
  return createFollowUpInvoiceFromInvoice(invoiceId, 'Auftrag');
}

export async function convertOrderToInvoice(invoiceId: string): Promise<string> {
  return createFollowUpInvoiceFromInvoice(invoiceId, 'Rechnung');
}
