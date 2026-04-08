import type { CustomerDocument, Invoice, InvoiceItem, InvoiceTemplate } from '../types';
import { getCompanyProfile } from '../config/companyProfile';
import { getInvoiceLayout } from '../config/invoiceLayouts';
import { fetchInvoiceTemplate } from './invoiceService';
import { addCustomerDocumentBlob, getDocumentsByCustomer, getInvoiceItems } from './sqliteService';
import QRCode from 'qrcode';

function euro(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function calcTotals(items: InvoiceItem[]) {
  let subtotal = 0;
  let tax = 0;
  for (const it of items) {
    const line = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
    subtotal += line;
    tax += line * ((Number(it.taxPercent) || 0) / 100);
  }
  const total = subtotal + tax;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function fmtDateDE(ms?: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString('de-DE');
  } catch {
    return '';
  }
}

function resolvePlaceholders(
  s: string,
  ctx: { name: string; paypalMeUrl: string; agbsUrl: string; validUntil?: string }
): string {
  const name = ctx.name || '';
  return String(s || '')
    .replaceAll('{{name}}', name)
    .replaceAll('{{client}}', name)
    .replaceAll('{client}', name)
    .replaceAll('{{paypalMeUrl}}', ctx.paypalMeUrl)
    .replaceAll('{{agbsUrl}}', ctx.agbsUrl)
    .replaceAll('{{validUntil}}', ctx.validUntil || '');
}

async function renderInvoiceHtml(opts: {
  invoice: Invoice;
  items: InvoiceItem[];
  template: InvoiceTemplate;
  autoPrint?: boolean;
}): Promise<string> {
  const c = getCompanyProfile();
  const invoice = opts.invoice;
  const items = opts.items || [];
  const template = opts.template;
  const layout = getInvoiceLayout(invoice.layoutId || template.layoutId);
  const totals = calcTotals(items);

  if (layout.id === 'mietpark_v1') {
    return renderMietparkHtml({ invoice, items, template, totals, company: c, layout, autoPrint: opts.autoPrint });
  }

  const dueStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('de-DE') : '-';
  const invDateStr = new Date(invoice.invoiceDate).toLocaleDateString('de-DE');
  const agb = invoice.agbLink || template.defaultAgbLink || c.agbsUrl;
  const taxNote = invoice.taxNote || template.defaultTaxNote || c.vatNotice;
  const paymentTerms = invoice.paymentTerms || template.defaultPaymentTerms;
  const paymentInfo = invoice.paymentInfo || template.defaultPaymentInfo || c.paymentMethodsLine;
  const depositReceived =
    invoice.invoiceType === 'Rechnung' && invoice.depositReceivedEnabled && (Number(invoice.depositReceivedAmount) || 0) > 0
      ? `Kaution in Hoehe von ${euro(Number(invoice.depositReceivedAmount) || 0)} dankend erhalten.`
      : '';
  const footerText = invoice.footerText || template.defaultFooterText || '';

  const title = `${invoice.invoiceType} ${invoice.invoiceNo}`;

  const styleClassic = `
    :root { --ink:#111; --muted:#555; --line:#e6e6e6; --accent:#1f2937; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 0; margin: 0; color: var(--ink); background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 18mm 18mm 16mm 18mm; }
    .no-print { padding: 12px; text-align: center; background: #fff; border-bottom: 1px solid var(--line); }
    .btn { display: inline-block; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background:#111; color:#fff; cursor:pointer; font-size: 14px; }
    .btn.secondary { background:#fff; color:#111; }
    .top { display:flex; justify-content:space-between; gap: 16px; }
    .brand { font-weight:700; font-size: 16px; letter-spacing: .2px; }
    .meta { text-align:right; font-size: 12px; color: var(--muted); }
    .meta strong { color: var(--ink); }
    .doc-title { margin-top: 14mm; font-size: 22px; font-weight: 800; letter-spacing: .2px; }
    .address-window { margin-top: 8mm; border: 1px solid var(--line); border-radius: 10px; padding: 10mm; }
    .address-window .to { font-size: 13px; }
    .address-window .to strong { font-size: 14px; }
    .section { margin-top: 10mm; }
    .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
    td { padding: 10px 6px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13px; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 8mm; display:flex; justify-content:flex-end; }
    .totals-box { min-width: 280px; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
    .totals-row { display:flex; justify-content:space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
    .totals-row strong { font-size: 14px; }
    .hr { height: 1px; background: var(--line); margin: 8px 0; }
    .footer { margin-top: 14mm; font-size: 11px; color: #333; border-top: 1px solid var(--line); padding-top: 10px; }
    .footer .muted { color: var(--muted); }
    @media print {
      body { background: #fff; }
      .no-print { display: none; }
      .page { margin: 0; width: auto; min-height: auto; padding: 0; }
      .page-inner { padding: 18mm 18mm 16mm 18mm; }
    }
  `;

  const styleModern = `
    :root { --ink:#0b0f19; --muted:#6b7280; --line:#e5e7eb; --accent:#0b0f19; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 0; margin: 0; color: var(--ink); background: #f8fafc; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 16mm 16mm 14mm 16mm; }
    .no-print { padding: 12px; text-align: center; background: #fff; border-bottom: 1px solid var(--line); }
    .btn { display: inline-block; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background:#0b0f19; color:#fff; cursor:pointer; font-size: 14px; }
    .btn.secondary { background:#fff; color:#0b0f19; }
    .top { display:flex; justify-content:space-between; gap: 16px; align-items:flex-start; }
    .brand { font-weight: 900; font-size: 18px; }
    .meta { text-align:right; font-size: 12px; color: var(--muted); }
    .doc-title { margin-top: 10mm; font-size: 28px; font-weight: 900; letter-spacing: -0.02em; }
    .address-window { margin-top: 6mm; border: 1px solid var(--line); border-radius: 14px; padding: 10mm; }
    .section { margin-top: 9mm; }
    .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { font-size: 11px; color: var(--muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
    td { padding: 10px 6px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13px; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 7mm; display:flex; justify-content:flex-end; }
    .totals-box { min-width: 260px; border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: #f8fafc; }
    .totals-row { display:flex; justify-content:space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
    .totals-row strong { font-size: 14px; }
    .footer { margin-top: 12mm; font-size: 11px; color: #111; border-top: 1px solid var(--line); padding-top: 10px; }
    .footer .muted { color: var(--muted); }
    @media print {
      body { background: #fff; }
      .no-print { display: none; }
      .page { margin: 0; width: auto; min-height: auto; padding: 0; }
      .page-inner { padding: 16mm 16mm 14mm 16mm; }
    }
  `;

  const style = layout.id === 'modern_v1' ? styleModern : styleClassic;

  const rowsHtml = items
    .map((it, idx) => {
      const qty = Number(it.quantity) || 0;
      const up = Number(it.unitPrice) || 0;
      const line = qty * up;
      return `<tr>
        <td style="width:28px;color:#6b7280;">${idx + 1}</td>
        <td>${esc(it.name || '')}${it.unit ? `<div class="muted" style="font-size:11px;margin-top:3px;">Einheit: ${esc(it.unit)}</div>` : ''}</td>
        <td class="num">${qty.toLocaleString('de-DE')}</td>
        <td class="num">${euro(up)}</td>
        <td class="num">${euro(line)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${esc(title)}</title>
      <style>${style}</style>
    </head>
    <body>
      <div class="no-print">
        <button class="btn" onclick="window.print()">Drucken / Als PDF speichern</button>
        <button class="btn secondary" onclick="window.close()" style="margin-left:8px;">Schliessen</button>
      </div>
      <div class="page">
        <div class="page-inner">
          <div class="top">
            <div>
              <div class="brand">${esc(c.companyName)}</div>
              <div class="muted" style="font-size:12px;margin-top:4px;">Inhaber ${esc(c.ownerName)} | ${esc(c.street)}, ${esc(c.zipCode)} ${esc(c.city)}</div>
              <div class="muted" style="font-size:12px;">${esc(c.phone)} | ${esc(c.email)} | ${esc(c.website)}</div>
            </div>
            <div class="meta">
              <div><strong>${esc(invoice.invoiceType)}</strong></div>
              <div>Nr.: <strong>${esc(invoice.invoiceNo)}</strong></div>
              <div>Datum: <strong>${esc(invDateStr)}</strong></div>
              <div>Faellig: <strong>${esc(dueStr)}</strong></div>
            </div>
          </div>

          <div class="doc-title">${esc(invoice.invoiceType)}</div>

          <div class="address-window">
            <div class="label">Empfaenger</div>
            <div class="to" style="margin-top:6px;">
              <div><strong>${esc(invoice.buyerName)}</strong></div>
              <div>${esc(invoice.buyerAddress)}</div>
            </div>
          </div>

          <div class="section">
            <div class="label">Positionen</div>
            <table>
              <thead>
                <tr>
                  <th style="width:28px;">#</th>
                  <th>Beschreibung</th>
                  <th class="num" style="width:80px;">Menge</th>
                  <th class="num" style="width:110px;">EP</th>
                  <th class="num" style="width:110px;">Betrag</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="5" class="muted">Keine Positionen</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="totals-box">
              <div class="totals-row"><span>Zwischensumme</span><span>${euro(totals.subtotal)}</span></div>
              <div class="totals-row"><span>USt.</span><span>${euro(totals.tax)}</span></div>
              <div class="hr"></div>
              <div class="totals-row"><strong>Gesamt</strong><strong>${euro(totals.total)}</strong></div>
            </div>
          </div>

          <div class="section">
            <div class="label">Zahlung</div>
            <div style="margin-top:6px;font-size:13px;">
              <div><strong>Bedingungen:</strong> ${esc(paymentTerms)}</div>
              <div style="margin-top:4px;"><strong>Info:</strong> ${esc(paymentInfo)}</div>
              ${depositReceived ? `<div style="margin-top:4px;"><strong>Kaution:</strong> ${esc(depositReceived)}</div>` : ''}
            </div>
          </div>

          ${taxNote ? `<div class="section"><div class="label">Hinweis</div><div style="margin-top:6px;font-size:12px;color:var(--muted);">${esc(taxNote)}</div></div>` : ''}
          ${agb ? `<div class="section"><div class="label">${esc(layout.defaultsByType[invoice.invoiceType].agbLinkLabel || 'AGB')}</div><div style="margin-top:6px;font-size:12px;color:var(--muted);">${esc(agb)}</div></div>` : ''}

          ${footerText ? `<div class="section"><div class="label">Footer</div><div style="margin-top:6px;font-size:12px;">${esc(footerText)}</div></div>` : ''}

          <div class="footer">
            <div class="muted">${esc(c.bankName)} | ${esc(c.bankAccountName)} | ${esc(c.iban)}</div>
            <div class="muted">PayPal: ${esc(c.paypalEmail)} | ${esc(c.paypalMeUrl)}</div>
          </div>
        </div>
      </div>
      ${
        opts.autoPrint
          ? `<script>
              window.addEventListener('load', () => {
                setTimeout(() => {
                  try { window.print(); } catch {}
                }, 250);
              });
            </script>`
          : ''
      }
    </body>
  </html>`;
}

async function renderMietparkHtml(opts: {
  invoice: Invoice;
  items: InvoiceItem[];
  template: InvoiceTemplate;
  totals: { subtotal: number; tax: number; total: number };
  company: ReturnType<typeof getCompanyProfile>;
  layout: ReturnType<typeof getInvoiceLayout>;
  autoPrint?: boolean;
}): Promise<string> {
  const { invoice, items, template, totals, company: c, layout } = opts;
  const d = layout.defaultsByType[invoice.invoiceType];
  const validUntil =
    invoice.invoiceType === 'Angebot'
      ? fmtDateDE((invoice.invoiceDate || Date.now()) + 7 * 24 * 60 * 60 * 1000)
      : '';
  const ctx = {
    name: (invoice.buyerName || '').trim() || '',
    paypalMeUrl: c.paypalMeUrl,
    agbsUrl: c.agbsUrl,
    validUntil,
  };

  const numberLabelRaw =
    d.numberLabel || (invoice.invoiceType === 'Angebot' ? 'Angebotsnummer' : 'Rechnungsnummer');
  const dateLabelRaw =
    d.dateLabel || (invoice.invoiceType === 'Angebot' ? 'Angebotsdatum' : 'Rechnungsdatum');
  const dueLabelRaw = d.dueLabel || 'Fälligkeitsdatum';
  const numberLabel = numberLabelRaw.endsWith(':') ? numberLabelRaw : `${numberLabelRaw}:`;
  const dateLabel = dateLabelRaw.endsWith(':') ? dateLabelRaw : `${dateLabelRaw}:`;
  const dueLabel = dueLabelRaw.endsWith(':') ? dueLabelRaw : `${dueLabelRaw}:`;

  const invDateStr = fmtDateDE(invoice.invoiceDate);
  const dueStr = invoice.dueDate ? fmtDateDE(invoice.dueDate) : invDateStr;

  const introTextRaw = invoice.introText || template.defaultIntroText || d.introText || '';
  const introText = resolvePlaceholders(introTextRaw, ctx).trim();

  const paymentLine = (invoice.paymentInfo || template.defaultPaymentInfo || d.paymentInfo || c.paymentMethodsLine || '').trim();
  const paypalLineRaw = invoice.paypalText || template.defaultPaypalText || d.paypalText || '';
  const paypalLine = resolvePlaceholders(paypalLineRaw, ctx).trim();

  const taxNoteRaw = invoice.taxNote || template.defaultTaxNote || d.taxNote || c.vatNotice || '';
  const taxNote = taxNoteRaw.trim();

  const depositReceived =
    invoice.invoiceType === 'Rechnung' && invoice.depositReceivedEnabled && (Number(invoice.depositReceivedAmount) || 0) > 0
      ? `Kaution in Hoehe von ${euro(Number(invoice.depositReceivedAmount) || 0)} dankend erhalten.`
      : '';

  const agbTextRaw = invoice.agbText || template.defaultAgbText || d.agbText || '';
  const agbText = resolvePlaceholders(agbTextRaw, ctx).trim();
  const agbFallbackLink = invoice.agbLink || template.defaultAgbLink || c.agbsUrl;
  const agbLine = agbText || (agbFallbackLink ? `Bitte beachten Sie die gültigen AGBs auf meiner Homepage : ${agbFallbackLink}` : '');

  const servicePeriod =
    invoice.servicePeriodStart && invoice.servicePeriodEnd
      ? `${fmtDateDE(invoice.servicePeriodStart)} - ${fmtDateDE(invoice.servicePeriodEnd)}`
      : '';

  const depositPercent = typeof invoice.depositPercent === 'number' ? invoice.depositPercent : d.depositPercent || 0;
  const depositTextRaw = invoice.depositText || d.depositText || c.depositNote || '';
  const depositText = resolvePlaceholders(depositTextRaw, ctx).trim();
  const depositEnabled = Boolean(invoice.depositEnabled) && (invoice.invoiceType === 'Angebot' || invoice.invoiceType === 'Auftrag');
  const depositAmount =
    depositEnabled && depositPercent > 0 ? Math.round((totals.total * (depositPercent / 100)) * 100) / 100 : 0;

  const showQty = true;
  const showUnit = true;
  const showTax = false;
  const showUnitPrice = true;
  const showLineTotal = true;

  const headerDescription = 'Beschreibung';
  const headerQuantity = 'Menge';
  const headerUnit = 'Einheit';
  const headerUnitPrice = 'Einzelpreis';
  const headerTax = 'USt.';
  const headerLineTotal = 'Betrag';
  const totalLabel = 'Gesamtbetrag';

  const rows = items
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      const up = Number(it.unitPrice) || 0;
      const line = qty * up;
      const rawLines = String(it.name || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const firstLine = rawLines[0] || '';
      const extraLines = rawLines.slice(1);
      // If the item already includes a date range line, don't duplicate it when we also show `servicePeriod`.
      const dateRangePattern = /\d{1,2}\.\d{1,2}\.\d{4}\s*[-–—]\s*\d{1,2}\.\d{1,2}\.\d{4}/;
      const extraSub = extraLines
        .filter((l) => !(servicePeriod && dateRangePattern.test(l)))
        .map((l) => `<div class="sub">${esc(l)}</div>`)
        .join('');

      const sub = servicePeriod ? `<div class="sub">${esc(servicePeriod)}</div>` : '';
      const qtySub = qty !== 1 ? `<div class="sub">Menge: ${esc(qty.toLocaleString('de-DE'))} ${esc(it.unit || '')}</div>` : '';
      return `<tr>
        <td class="desc">
          <div class="name">${esc(firstLine)}</div>
          ${sub}
          ${extraSub}
          ${qtySub}
        </td>
        ${showQty ? `<td class="num">${esc(qty.toLocaleString('de-DE'))}</td>` : ''}
        ${showUnit ? `<td class="num">${esc(it.unit || '')}</td>` : ''}
        ${showUnitPrice ? `<td class="num">${euro(up)}</td>` : ''}
        ${showTax ? `<td class="num">${esc(String(Number(it.taxPercent) || 0))}%</td>` : ''}
        ${showLineTotal ? `<td class="num">${euro(line)}</td>` : ''}
      </tr>`;
    })
    .join('');

  const depositRow =
    depositEnabled && depositText && depositAmount > 0
      ? `<tr class="deposit">
          <td class="desc"><div class="name">${esc(depositText)}</div></td>
          ${showQty ? `<td class="num"></td>` : ''}
          ${showUnit ? `<td class="num"></td>` : ''}
          ${showUnitPrice ? `<td class="num">${euro(depositAmount)}</td>` : ''}
          ${showTax ? `<td class="num"></td>` : ''}
          ${showLineTotal ? `<td class="num">${euro(depositAmount)}</td>` : ''}
        </tr>`
      : '';

  // Match existing PDFs: deposit is listed as its own row and included in "Gesamtbetrag".
  const grandTotal = Math.round((totals.total + (depositRow ? depositAmount : 0)) * 100) / 100;

  let qrSvg = '';
  const shouldShowQr = Boolean(d.showPaypalQr);
  if (shouldShowQr && c.paypalMeUrl) {
    try {
      qrSvg = await QRCode.toString(c.paypalMeUrl, { type: 'svg', margin: 0, scale: 4 });
    } catch {
      qrSvg = '';
    }
  }

  const accent = c.accentColor || '#6aa84f';

  return `<!doctype html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${esc(`${invoice.invoiceType} ${invoice.invoiceNo}`)}</title>
      <style>
        :root { --ink:#111; --muted:#666; --accent:${esc(accent)}; --line:#e6e6e6; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 0; margin: 0; color: var(--ink); background: #fff; }
        .no-print { padding: 12px; text-align: center; background: #fff; border-bottom: 1px solid var(--line); }
        .btn { display: inline-block; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background:#111; color:#fff; cursor:pointer; font-size: 14px; }
        .btn.secondary { background:#fff; color:#111; }
        .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 18mm 18mm 14mm 18mm; position: relative; }

        .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 12mm; }
        .title { font-size: 30px; font-weight: 800; letter-spacing: .4px; color: var(--accent); text-transform: uppercase; }
        .logo { width: 48mm; height: 22mm; display:flex; align-items:center; justify-content:flex-end; }
        .logo img { max-width: 48mm; max-height: 22mm; object-fit: contain; }
        .logo .fallback { font-weight: 800; color: var(--accent); text-align: right; line-height: 1.1; }

        .header-row { display:flex; justify-content:space-between; gap: 12mm; margin-top: 8mm; }
        .recipient { width: 55%; font-size: 12px; line-height: 1.3; }
        .recipient .name { font-weight: 700; }
        .meta { width: 45%; font-size: 12px; }
        .meta .row { display:flex; justify-content:space-between; gap: 10px; margin: 2px 0; }
        .meta .label { color: var(--accent); font-weight: 700; }
        .meta .val { font-weight: 700; color: #333; text-align:right; }

        .intro { margin-top: 8mm; font-size: 12px; line-height: 1.4; }

        table { width: 100%; border-collapse: collapse; margin-top: 10mm; }
        thead th { font-size: 10px; text-transform: uppercase; color: #444; font-weight: 700; padding: 6px 0; border-bottom: 1px solid var(--line); }
        tbody td { font-size: 12px; padding: 10px 0; vertical-align: top; border-bottom: 1px solid var(--line); }
        td.desc { padding-right: 10mm; }
        td.num { width: 26mm; text-align: right; white-space: nowrap; }
        .name { font-weight: 700; }
        .sub { margin-top: 2px; font-size: 10px; color: var(--muted); }
        tr.deposit td { border-bottom: none; padding-top: 6px; }

        .total { margin-top: 10mm; display:flex; justify-content:flex-end; font-size: 12px; }
        .total .wrap { width: 90mm; display:flex; justify-content:space-between; font-weight: 700; }
        .total .label { color: #333; }
        .total .amount { text-align:right; }

        .notes { margin-top: 10mm; font-size: 11px; line-height: 1.45; }
        .notes .line { margin-top: 6px; }

        .qr { margin-top: 10mm; width: 40mm; }
        .qr svg { width: 40mm; height: 40mm; }

        .footer { position: absolute; left: 18mm; right: 18mm; bottom: 12mm; }
        .footer .line { height: 2px; background: var(--accent); opacity: .55; margin-bottom: 6px; }
        .footer .cols { display:flex; justify-content:space-between; gap: 12mm; font-size: 9px; color: #444; }
        .footer .col { width: 33.33%; }
        .footer .col .muted { color: var(--muted); }

        @media print {
          .no-print { display:none; }
          body { background:#fff; }
          .page { margin:0; width:auto; min-height:auto; }
        }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button class="btn" onclick="window.print()">Drucken / Als PDF speichern</button>
        <button class="btn secondary" onclick="window.close()" style="margin-left:8px;">Schliessen</button>
      </div>
      <div class="page">
        <div class="top">
          <div class="title">${esc(invoice.invoiceType)}</div>
          <div class="logo">
            ${c.logoDataUrl ? `<img src="${esc(c.logoDataUrl)}" alt="Logo" />` : `<div class="fallback">${esc(c.companyName)}</div>`}
          </div>
        </div>

        <div class="header-row">
          <div class="recipient">
            <div class="name">${esc(invoice.buyerName)}</div>
            <div>${esc(invoice.buyerAddress)}</div>
          </div>
          <div class="meta">
            <div class="row"><div class="label">${esc(numberLabel)}</div><div class="val">${esc(invoice.invoiceNo)}</div></div>
            <div class="row"><div class="label">${esc(dateLabel)}</div><div class="val">${esc(invDateStr)}</div></div>
            <div class="row"><div class="label">${esc(dueLabel)}</div><div class="val">${esc(dueStr)}</div></div>
          </div>
        </div>

        ${introText ? `<div class="intro">${esc(introText)}</div>` : ''}

        <table>
          <thead>
            <tr>
              <th style="text-align:left;">${esc(headerDescription)}</th>
              ${showQty ? `<th style="text-align:right;">${esc(headerQuantity)}</th>` : ''}
              ${showUnit ? `<th style="text-align:right;">${esc(headerUnit)}</th>` : ''}
              ${showUnitPrice ? `<th style="text-align:right;">${esc(headerUnitPrice)}</th>` : ''}
              ${showTax ? `<th style="text-align:right;">${esc(headerTax)}</th>` : ''}
              ${showLineTotal ? `<th style="text-align:right;">${esc(headerLineTotal)}</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr><td colspan="${1 + (showQty ? 1 : 0) + (showUnit ? 1 : 0) + (showUnitPrice ? 1 : 0) + (showTax ? 1 : 0) + (showLineTotal ? 1 : 0)}" style="color:var(--muted);padding-top:10px;">Keine Positionen</td></tr>`
            }
            ${depositRow}
          </tbody>
        </table>

        <div class="total">
          <div class="wrap">
            <div class="label">${esc(totalLabel)}</div>
            <div class="amount">${euro(grandTotal)}</div>
          </div>
        </div>

        <div class="notes">
          ${paymentLine ? `<div class="line">${esc(paymentLine)}</div>` : ''}
          ${depositReceived ? `<div class="line">${esc(depositReceived)}</div>` : ''}
          ${paypalLine ? `<div class="line">${esc(paypalLine)}</div>` : ''}
          ${taxNote ? `<div class="line">${esc(taxNote)}</div>` : ''}
          ${agbLine ? `<div class="line">${esc(agbLine)}</div>` : ''}
        </div>

        ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}

        <div class="footer">
          <div class="line"></div>
          <div class="cols">
            <div class="col">
              <div>${esc(c.companyName)}</div>
              <div class="muted">Inhaber ${esc(c.ownerName)}</div>
              <div class="muted">${esc(c.street)}</div>
              <div class="muted">${esc(c.zipCode)} ${esc(c.city)}</div>
            </div>
            <div class="col">
              <div class="muted">${esc(c.phone)}</div>
              <div class="muted">${esc(c.email)}</div>
              <div class="muted">${esc(c.website)}</div>
            </div>
            <div class="col">
              <div class="muted">${esc(c.bankName)}</div>
              <div class="muted">${esc(c.bankAccountName)}</div>
              <div class="muted">${esc(c.iban)}</div>
              <div class="muted">Paypal | ${esc(c.paypalEmail)}</div>
            </div>
          </div>
        </div>
      </div>
      ${
        opts.autoPrint
          ? `<script>
              window.addEventListener('load', () => {
                setTimeout(() => {
                  try { window.print(); } catch {}
                }, 250);
              });
            </script>`
          : ''
      }
    </body>
  </html>`;
}

async function resolveTemplate(invoice: Invoice, template?: InvoiceTemplate | null): Promise<InvoiceTemplate> {
  if (template) return template;
  const t = await fetchInvoiceTemplate(invoice.invoiceType);
  if (!t) {
    // Fallback minimal template.
    return {
      invoiceType: invoice.invoiceType,
      layoutId: String(invoice.layoutId || 'classic_v1'),
      defaultPaymentTerms: '',
      defaultPaymentInfo: '',
      defaultFooterText: '',
      defaultTaxNote: '',
      defaultAgbLink: '',
    };
  }
  return t;
}

async function resolveItems(invoice: Invoice, items?: InvoiceItem[] | null): Promise<InvoiceItem[]> {
  if (items && Array.isArray(items)) return items;
  if (!invoice.id) return [];
  try {
    return await getInvoiceItems(invoice.id);
  } catch {
    return [];
  }
}

function slugifyFilePart(input: string): string {
  return String(input || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-');
}

function toIsoDate(ms?: number): string {
  const d = ms ? new Date(ms) : new Date();
  return d.toISOString().slice(0, 10);
}

async function hashBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildFallbackPdfBlob(invoice: Invoice): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
  pdf.setFontSize(16);
  pdf.text(`${invoice.invoiceType} ${invoice.invoiceNo}`, 40, 50);
  pdf.setFontSize(10);
  pdf.text(`Datum: ${fmtDateDE(invoice.invoiceDate)}`, 40, 72);
  pdf.text(`Kunde: ${invoice.buyerName || '-'}`, 40, 88);
  return pdf.output('blob');
}

async function buildInvoicePdfBlobFromHtml(invoice: Invoice, html: string): Promise<Blob> {
  if (typeof document === 'undefined') return buildFallbackPdfBlob(invoice);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1200px';
  iframe.style.height = '2200px';
  iframe.style.opacity = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const done = () => resolve();
      const fail = () => reject(new Error('HTML iframe could not be loaded for PDF rendering'));
      iframe.addEventListener('load', done, { once: true });
      iframe.addEventListener('error', fail, { once: true });
      setTimeout(() => resolve(), 800);
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error('No iframe document for PDF rendering');

    if (doc.fonts?.ready) {
      try {
        await doc.fonts.ready;
      } catch {
        // ignore font loading failures
      }
    }

    doc.querySelectorAll('.no-print').forEach((el) => el.remove());
    const target = (doc.querySelector('.page') as HTMLElement | null) || doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(target.scrollWidth, 1200),
      windowHeight: Math.max(target.scrollHeight, 1800),
    });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;
    const pageHeightInSourcePx = Math.max(1, Math.floor((pageHeight * sourceWidth) / pageWidth));
    const ctxMain = canvas.getContext('2d');
    if (!ctxMain) throw new Error('2D context unavailable for source canvas');

    const chooseCutY = (fromY: number, idealCutY: number): number => {
      // Try to move page breaks to visually "quiet" lines to avoid cutting through text/rows.
      const minY = Math.max(fromY + Math.floor(pageHeightInSourcePx * 0.7), fromY + 120);
      const maxY = Math.min(sourceHeight, fromY + Math.floor(pageHeightInSourcePx * 1.08));
      let bestY = Math.min(idealCutY, maxY);
      let bestScore = Number.POSITIVE_INFINITY;
      const step = 2;
      const sampleColumns = 96;

      const scanStart = Math.max(minY, idealCutY - 180);
      const scanEnd = Math.min(maxY, idealCutY + 180);
      if (scanEnd <= scanStart) return bestY;

      const pixels = ctxMain.getImageData(0, scanStart, sourceWidth, scanEnd - scanStart).data;
      const lines = scanEnd - scanStart;

      for (let line = 0; line < lines; line += step) {
        const y = scanStart + line;
        let darkSamples = 0;
        for (let s = 0; s < sampleColumns; s++) {
          const x = Math.floor((s * (sourceWidth - 1)) / (sampleColumns - 1));
          const idx = (line * sourceWidth + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          // non-white-ish pixel
          if (r < 242 || g < 242 || b < 242) darkSamples += 1;
        }

        const darkRatio = darkSamples / sampleColumns;
        const distancePenalty = Math.abs(y - idealCutY) / 260;
        const score = darkRatio + distancePenalty;
        if (score < bestScore) {
          bestScore = score;
          bestY = y;
        }
      }

      return Math.max(minY, Math.min(bestY, maxY));
    };

    let offset = 0;
    let page = 0;
    while (offset < sourceHeight) {
      const remaining = sourceHeight - offset;
      let sliceHeight = Math.min(pageHeightInSourcePx, remaining);
      if (remaining > pageHeightInSourcePx) {
        const idealCutY = offset + sliceHeight;
        const adjustedCutY = chooseCutY(offset, idealCutY);
        sliceHeight = Math.max(1, adjustedCutY - offset);
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = sourceWidth;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable for PDF page rendering');
      ctx.drawImage(canvas, 0, offset, sourceWidth, sliceHeight, 0, 0, sourceWidth, sliceHeight);

      const image = pageCanvas.toDataURL('image/png');
      const renderedHeight = (sliceHeight * pageWidth) / sourceWidth;
      if (page > 0) pdf.addPage();
      pdf.addImage(image, 'PNG', 0, 0, pageWidth, renderedHeight, undefined, 'FAST');

      offset += sliceHeight;
      page += 1;
    }

    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

async function persistGeneratedInvoiceDocument(invoice: Invoice, html: string): Promise<void> {
  const customerId = String(invoice.companyId || '').trim();
  if (!customerId) return;

  const blob = await buildInvoicePdfBlobFromHtml(invoice, html);
  const contentHash = await hashBlobSha256(blob);
  const existing = await getDocumentsByCustomer(customerId);
  const duplicate = existing.find((doc) => doc.mimeType === 'application/pdf' && doc.contentHash === contentHash);
  if (duplicate) return;

  const now = Date.now();
  const typePart = slugifyFilePart(invoice.invoiceType || 'Beleg');
  const noPart = slugifyFilePart(invoice.invoiceNo || 'ohne-nummer');
  const datePart = toIsoDate(invoice.invoiceDate || now);
  const filename = `${typePart}_${noPart}_${datePart}.pdf`;
  const doc: CustomerDocument = {
    id: `doc_invoice_${now}_${Math.random().toString(16).slice(2)}`,
    customerId,
    filename,
    mimeType: 'application/pdf',
    sizeBytes: blob.size,
    category: invoice.invoiceType,
    contentHash,
    sourceRef: invoice.invoiceNo,
    source: 'manual',
    createdAt: now,
  };
  await addCustomerDocumentBlob(doc, blob);
}

export async function downloadInvoicePDF(invoice: Invoice, items?: InvoiceItem[], template?: InvoiceTemplate | null): Promise<void> {
  const tpl = await resolveTemplate(invoice, template);
  const its = await resolveItems(invoice, items);
  const html = await renderInvoiceHtml({ invoice, items: its, template: tpl, autoPrint: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoice.invoiceNo}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export async function openInvoicePDF(invoice: Invoice, items?: InvoiceItem[], template?: InvoiceTemplate | null): Promise<void> {
  // Backward-compatible "preview" action.
  await openInvoicePreview(invoice, items, template);
}

let invoicePreviewOverlayEl: HTMLDivElement | null = null;

function closeInvoicePreviewOverlay() {
  if (invoicePreviewOverlayEl && invoicePreviewOverlayEl.parentElement) {
    invoicePreviewOverlayEl.parentElement.removeChild(invoicePreviewOverlayEl);
  }
  invoicePreviewOverlayEl = null;
}

function openInvoiceHtmlOverlay(html: string, title: string, autoPrint: boolean): boolean {
  if (typeof document === 'undefined') return false;

  closeInvoicePreviewOverlay();
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483647';
  overlay.style.background = 'rgba(15,23,42,0.65)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '16px';

  const frame = document.createElement('div');
  frame.style.width = 'min(1400px, 96vw)';
  frame.style.height = 'min(94vh, 1100px)';
  frame.style.background = '#fff';
  frame.style.borderRadius = '14px';
  frame.style.overflow = 'hidden';
  frame.style.display = 'flex';
  frame.style.flexDirection = 'column';
  frame.style.boxShadow = '0 18px 60px rgba(0,0,0,0.35)';

  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex';
  toolbar.style.alignItems = 'center';
  toolbar.style.justifyContent = 'space-between';
  toolbar.style.padding = '10px 12px';
  toolbar.style.borderBottom = '1px solid #e2e8f0';
  toolbar.style.gap = '8px';

  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  titleEl.style.color = '#0f172a';
  titleEl.style.whiteSpace = 'nowrap';
  titleEl.style.overflow = 'hidden';
  titleEl.style.textOverflow = 'ellipsis';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '8px';

  const printBtn = document.createElement('button');
  printBtn.textContent = 'Drucken';
  printBtn.style.padding = '6px 10px';
  printBtn.style.borderRadius = '8px';
  printBtn.style.border = '1px solid #cbd5e1';
  printBtn.style.background = '#fff';
  printBtn.style.cursor = 'pointer';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Schließen';
  closeBtn.style.padding = '6px 10px';
  closeBtn.style.borderRadius = '8px';
  closeBtn.style.border = '1px solid #0f172a';
  closeBtn.style.background = '#0f172a';
  closeBtn.style.color = '#fff';
  closeBtn.style.cursor = 'pointer';

  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.style.border = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.srcdoc = html;

  printBtn.addEventListener('click', () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore print failures in restricted environments
    }
  });
  closeBtn.addEventListener('click', closeInvoicePreviewOverlay);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeInvoicePreviewOverlay();
  });

  actions.appendChild(printBtn);
  actions.appendChild(closeBtn);
  toolbar.appendChild(titleEl);
  toolbar.appendChild(actions);
  frame.appendChild(toolbar);
  frame.appendChild(iframe);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
  invoicePreviewOverlayEl = overlay;

  if (autoPrint) {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // ignore
      }
    }, 500);
  }
  return true;
}

export async function openInvoicePreview(invoice: Invoice, items?: InvoiceItem[], template?: InvoiceTemplate | null): Promise<void> {
  const tpl = await resolveTemplate(invoice, template);
  const its = await resolveItems(invoice, items);
  const html = await renderInvoiceHtml({ invoice, items: its, template: tpl, autoPrint: false });
  if (openInvoiceHtmlOverlay(html, `${invoice.invoiceType} ${invoice.invoiceNo}`, false)) {
    return;
  }

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export async function saveInvoicePdfViaPrintDialog(invoice: Invoice, items?: InvoiceItem[], template?: InvoiceTemplate | null): Promise<void> {
  const tpl = await resolveTemplate(invoice, template);
  const its = await resolveItems(invoice, items);
  const html = await renderInvoiceHtml({ invoice, items: its, template: tpl, autoPrint: true });
  // Persist generated PDF in customer documents (with dedupe via content hash).
  try {
    await persistGeneratedInvoiceDocument(invoice, html);
  } catch (error) {
    console.warn('Generated document could not be persisted:', error);
  }

  if (openInvoiceHtmlOverlay(html, `${invoice.invoiceType} ${invoice.invoiceNo}`, true)) {
    return;
  }

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
