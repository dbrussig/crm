import type { InvoiceItem } from '../../types';

export interface InvoiceFormValues {
  // Header
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  
  // Kunde
  buyerName: string;
  buyerAddress: string;
  salutation: string;
  
  // Inhalt
  introText: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  
  // Anzahlung
  depositPercent: number;
  depositText: string;
  depositEnabled: boolean;
  depositReceivedEnabled: boolean;
  depositReceivedAmount: number;
  
  // Erweiterte Texte
  paymentTerms: string;
  paymentInfo: string;
  paypalText: string;
  footerText: string;
  taxNote: string;
  agbText: string;
  agbLink: string;
  
  // Positionen
  items: InvoiceItem[];
  
  // Meta (werden über separate State verwaltet, aber hier für Komplettheit)
  invoiceType: 'Angebot' | 'Auftrag' | 'Rechnung';
  state: 'entwurf' | 'gesendet' | 'angenommen' | 'storniert' | 'archiviert';
  companyId: string;
  layoutId: string;
}
