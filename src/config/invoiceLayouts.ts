import type { InvoiceType } from '../types';

export type InvoiceLayoutId = 'mietpark_v1' | 'classic_v1' | 'modern_v1';

export type InvoiceFieldKey =
  | 'buyer'
  | 'dates'
  | 'intro'
  | 'servicePeriod'
  | 'payment'
  | 'deposit'
  | 'paypal'
  | 'footer'
  | 'taxNote'
  | 'agbLink';

export type InvoiceLayout = {
  id: InvoiceLayoutId;
  label: string;
  description: string;
  // Which blocks are shown in the editor (in addition to the standard items table).
  editorBlocks: InvoiceFieldKey[];
  defaultsByType: Record<
    InvoiceType,
    {
      dueDays?: number; // if set and due date empty, auto-fill
      introText: string;
      paymentTerms: string;
      paymentInfo: string;
      paypalText: string;
      footerText: string;
      taxNote: string;
      agbText: string;
      agbLinkLabel: string;
      depositPercent?: number;
      depositText?: string;
      showPaypalQr?: boolean;
      numberLabel?: string;
      dateLabel?: string;
      dueLabel?: string;
    }
  >;
};

export const INVOICE_LAYOUTS: InvoiceLayout[] = [
  // Matches the user's real-world PDFs (SubTotal-like).
  {
    id: 'mietpark_v1',
    label: 'Mietpark (SubTotal)',
    description: 'Layout wie in deinen bestehenden PDFs (gruenes Heading, Logo rechts, kompakte Tabelle).',
    editorBlocks: ['buyer', 'dates', 'intro', 'servicePeriod', 'deposit', 'payment', 'paypal', 'taxNote', 'agbLink', 'footer'],
    defaultsByType: {
      Angebot: {
        dueDays: 7,
        introText: 'Hallo {client},\n\nanbei wie gewuenscht mein Angebot.\nDieses Angebot ist gueltig bis {{validUntil}}.\n\nBesten Dank!',
        paymentTerms: '',
        paymentInfo: 'Bezahlung in Bar bei Abholung, Paypal oder mit Kontaklos mit Karte',
        paypalText: 'Zahlungslink Paypal {{paypalMeUrl}}',
        footerText: '',
        taxNote: 'Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: 'Bitte beachten Sie die gültigen AGBs auf meiner Homepage : {{agbsUrl}}',
        agbLinkLabel: 'AGB',
        depositPercent: 50,
        depositText: 'Anzahlung 50 % nach Angebotsannahme',
        showPaypalQr: false,
        numberLabel: 'Angebotsnummer:',
        dateLabel: 'Angebotsdatum:',
        dueLabel: 'Fälligkeitsdatum:',
      },
      Auftrag: {
        dueDays: 0,
        introText: 'Hallo {client},\n\nanbei die Auftragsbestaetigung.\n\nBesten Dank und vielen Dank fuer ihr Vertrauen.',
        paymentTerms: '',
        paymentInfo: 'Bezahlung in Bar bei Abholung, Paypal oder mit Kontaklos mit Karte',
        paypalText: 'Zahlungslink Paypal {{paypalMeUrl}}',
        footerText: '',
        taxNote: 'Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: 'Bitte beachten Sie die gültigen AGBs auf meiner Homepage : {{agbsUrl}}',
        agbLinkLabel: 'AGB',
        showPaypalQr: true,
        numberLabel: 'Auftragsnummer:',
        dateLabel: 'Auftragsdatum:',
        dueLabel: 'Fälligkeitsdatum:',
      },
      Rechnung: {
        dueDays: 7,
        introText: 'Hallo {client},\n\nanbei die die Rechnung zu Ihrem Auftrag.',
        paymentTerms: '',
        paymentInfo: 'Bezahlung in Bar bei Abholung, Paypal oder mit Kontaklos mit Karte',
        paypalText: 'Zahlungslink Paypal {{paypalMeUrl}}',
        footerText: '',
        taxNote: 'Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: 'Bitte beachten Sie die gültigen AGBs auf meiner Homepage : {{agbsUrl}}',
        agbLinkLabel: 'AGB',
        showPaypalQr: true,
        numberLabel: 'Rechnungsnummer:',
        dateLabel: 'Rechnungsdatum:',
        dueLabel: 'Fälligkeitsdatum:',
      },
    },
  },
  {
    id: 'classic_v1',
    label: 'Classic A4',
    description: 'Klassisches A4 Layout (Fensterumschlag geeignet), klarer Tabellenfokus.',
    editorBlocks: ['buyer', 'dates', 'payment', 'taxNote', 'agbLink', 'footer'],
    defaultsByType: {
      Angebot: {
        dueDays: 7,
        introText: '',
        paymentTerms: 'Dieses Angebot ist gueltig fuer 7 Tage.',
        paymentInfo: 'Zahlung in Bar bei Abholung, PayPal oder kontaktlos mit Karte.',
        paypalText: '',
        footerText: 'Vielen Dank fuer Ihre Anfrage. Bei Rueckfragen melden Sie sich gerne.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
      Auftrag: {
        dueDays: 0,
        introText: '',
        paymentTerms: 'Zahlbar sofort.',
        paymentInfo: 'Zahlung in Bar bei Abholung, PayPal oder kontaktlos mit Karte.',
        paypalText: '',
        footerText: 'Vielen Dank. Abholung/Rueckgabe nach Absprache.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
      Rechnung: {
        dueDays: 7,
        introText: '',
        paymentTerms: 'Zahlbar innerhalb von 7 Tagen ohne Abzug.',
        paymentInfo: 'Zahlung per Ueberweisung oder PayPal moeglich.',
        paypalText: '',
        footerText: 'Vielen Dank fuer Ihr Vertrauen.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
    },
  },
  {
    id: 'modern_v1',
    label: 'Modern Minimal',
    description: 'Reduziertes Layout mit groesserer Typografie und kompaktem Footer.',
    editorBlocks: ['buyer', 'dates', 'payment', 'footer'],
    defaultsByType: {
      Angebot: {
        dueDays: 7,
        introText: '',
        paymentTerms: 'Gueltig fuer 7 Tage.',
        paymentInfo: 'Bar / PayPal / Karte.',
        paypalText: '',
        footerText: 'Wir freuen uns auf Ihre Rueckmeldung.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
      Auftrag: {
        dueDays: 0,
        introText: '',
        paymentTerms: 'Zahlbar sofort.',
        paymentInfo: 'Bar / PayPal / Karte.',
        paypalText: '',
        footerText: 'Abholung/Rueckgabe nach Absprache.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
      Rechnung: {
        dueDays: 7,
        introText: '',
        paymentTerms: 'Zahlbar innerhalb von 7 Tagen.',
        paymentInfo: 'Ueberweisung / PayPal.',
        paypalText: '',
        footerText: 'Vielen Dank.',
        taxNote: 'Gemaess §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
        agbText: '',
        agbLinkLabel: 'AGB',
      },
    },
  },
];

export function getInvoiceLayout(id?: string | null): InvoiceLayout {
  const picked = INVOICE_LAYOUTS.find((l) => l.id === id);
  return picked || INVOICE_LAYOUTS[0];
}

export function getDefaultInvoiceLayoutId(type: InvoiceType): InvoiceLayoutId {
  // Keep it stable but allow future per-type defaults.
  void type;
  return 'mietpark_v1';
}
