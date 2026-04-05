export enum RoofType {
  OPEN_RAILS = 'Offene Reling',
  FLUSH_RAILS = 'Geschlossene/Integrierte Reling',
  FIXED_POINTS = 'Fixpunkte',
  NORMAL_ROOF = 'Normales Dach (ohne Fixpunkte/Reling)',
  RAIN_GUTTER = 'Regenrinne',
  T_TRACK = 'T-Nut Schiene',
  UNKNOWN = 'Unbekannt / Konnte nicht ermittelt werden',
}

export interface VehicleData {
  make: string;
  model: string;
  year: string;
  hsn: string;
  tsn: string;
  customerName?: string;
  notes?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  vehicleData: VehicleData;
  roofResult?: string;
  vehiclePhotoUrl?: string;
}

export interface WebSource {
  title: string;
  uri: string;
}

export interface RoofAnalysisResult {
  roofType: RoofType;
  description: string;
  confidence: number; // 0..1
  reasoning: string;
  compatibleSystemsDescription: string;
  webSources?: WebSource[];
}

export interface Product {
  id: string;
  name: string;
  manufacturer: string;
  price: number;
  stock: number;
  compatibleRoofTypes: RoofType[];
  imageUrl: string;
  description?: string;
  warning?: string;
  recommendation?: string;
  bundleId?: string;
  bundlePartNumber?: number;
  isCompleteBundle?: boolean;
}

export type AIProvider = 'perplexica' | 'ollama' | 'gemini' | 'zai';

export interface AISettings {
  provider: AIProvider;
  apiKey?: string;
  endpoint?: string;
  enableWebSearch?: boolean;
  model?: string;
  temperature?: number;
}

export type Salutation = 'Herr' | 'Frau' | 'Divers';

export interface Customer {
  id: string;
  salutation?: Salutation;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    zipCode: string;
    country: string;
  };
  contactDate: number;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  googleContactResourceId?: string;
  // Optional photos to help identify the customer's roof rail type (Reling).
  // Stored locally as data URLs (e.g. "data:image/jpeg;base64,...") for IndexedDB JSON compatibility.
  //
  // Backward compatibility:
  // - `roofRailPhotoDataUrl` is kept as "primary" photo (first entry) for older code/exports.
  roofRailPhotoDataUrls?: string[];
  roofRailPhotoDataUrl?: string; // legacy primary photo

  // Manuelle Dachträger-Entscheidung (Recherche HSN/TSN oder Foto).
  assignedVehicleMake?: string;
  assignedVehicleModel?: string;
  assignedHsn?: string;
  assignedTsn?: string;
  assignedRelingType?: 'offen' | 'geschlossen' | 'keine' | 'unklar';
  assignedRoofRackInventoryKey?: string;
  roofRackDecisionNote?: string;
  roofRackDecisionUpdatedAt?: number;
}

export type DocumentCategory = 'Angebot' | 'Auftrag' | 'Rechnung' | 'Ausweis' | 'Sonstiges';

export interface CustomerDocument {
  id: string;
  customerId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  category?: DocumentCategory;
  contentHash?: string;
  sourceRef?: string;
  // Provenance
  source: 'gmail' | 'manual';
  gmailThreadId?: string;
  gmailMessageId?: string;
  gmailAttachmentId?: string;
  createdAt: number;
 }

export interface GoogleOAuthSettings {
  clientId: string;
  apiKey?: string;
  enabled: boolean;
  contactsEnabled?: boolean;
  contactsScopes?: string[];
  calendarEnabled?: boolean;
  calendarScopes?: string[];
  gmailEnabled?: boolean;
  gmailScopes?: string[];
}

export type MailTransportMode = 'gmail_web' | 'smtp_app_password';

export interface MailTransportSettings {
  mode: MailTransportMode;
  bridgeUrl: string; // local mail bridge endpoint, e.g. http://127.0.0.1:8787/send
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean; // true => SMTPS (465), false => STARTTLS (587)
  smtpUser: string;
  smtpAppPassword: string;
  fromEmail: string;
  fromName?: string;
}

// CRM
export type ProductType = 'Dachbox XL' | 'Dachbox M' | 'Fahrradträger' | 'Heckbox' | 'Hüpfburg';
export type RentalStatus =
  | 'neu'
  | 'info_fehlt'
  | 'check_verfuegbarkeit'
  | 'angebot_gesendet'
  | 'angenommen'
  | 'uebergabe_rueckgabe'
  | 'abgeschlossen'
  | 'archiviert'
  | 'abgelehnt'
  | 'storniert'
  | 'noshow';
export type RelingType = 'offen' | 'geschlossen' | 'keine' | 'unklar';
export type Channel = 'WhatsApp' | 'E-Mail' | 'Telefonnotiz';
export type AvailabilityStatus = 'frei' | 'belegt' | 'unklar';

export interface Message {
  id: string;
  customerId?: string;
  rentalRequestId?: string;
  gmailThreadId?: string;
  message: string;
  channel: Channel;
  receivedAt: number;
  createdAt: number;
  isIncoming: boolean;
  suggestedProductType?: ProductType;
  extractedInfo?: {
    productType?: ProductType;
    rentalStart?: number;
    rentalEnd?: number;
    vehicleMake?: string;
    vehicleModel?: string;
    hsn?: string;
    tsn?: string;
    ahkPresent?: 'ja' | 'nein';
  };
}

export type PaymentMethod = 'PayPal' | 'Bar' | 'Karte' | 'Ueberweisung' | 'Sonstiges';
export type PaymentKind = 'Anzahlung' | 'Zahlung' | 'Kaution';

export interface Payment {
  id: string;
  rentalRequestId: string;
  customerId?: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amount: number;
  currency: string; // e.g. "EUR"
  receivedAt: number;
  note?: string;
  source: 'gmail' | 'manual';
  gmailThreadId?: string;
  gmailMessageId?: string;
  payerName?: string;
  payerEmail?: string;
  providerTransactionId?: string;
  createdAt: number;
}

export interface PriceOverride {
  originalPrice: number;
  overridePrice: number;
  reason: string;
  overriddenBy?: string; // User who made the change
  overriddenAt?: number; // Timestamp
}

export interface RentalRequest {
  id: string;
  customerId: string;
  productType: ProductType;
  status: RentalStatus;
  gmailThreadId?: string;

  title?: string;
  description?: string;

  rentalStart: number;
  rentalEnd: number;

  // Pricing option for products that can be rented with/without roof rack (Dachboxen).
  // true = include roof rack, false = customer has own rack.
  includeRoofRack?: boolean;

  pickupDate?: number;
  returnDate?: number;

  vehicleMake?: string;
  vehicleModel?: string;
  vehicleWidthMm?: number;
  hsn?: string;
  tsn?: string;
  relingType?: RelingType;
  // Intern gewählter Dachträger/Bestands-Schlüssel, um Doppelvermietung zu vermeiden.
  roofRackInventoryKey?: string;
  ahkPresent?: 'ja' | 'nein' | 'unklar';

  priceSnapshot?: number;
  priceOverride?: PriceOverride; // Manual price override with audit trail
  deposit?: number;
  isHighSeason?: boolean;

  missingInfo?: string[];

  messages?: Message[];

  googleEventId?: string;
  googleCalendarId?: string;
  availabilityStatus?: AvailabilityStatus;
  availabilityCheckedAt?: number;

  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  completedAt?: number;
  rejectedAt?: number;
  rejectedReason?: string;
  cancelledAt?: number;
  cancelledReason?: string;

  archivedAt?: number;
  archivedReason?: string;
}

export interface Resource {
  id: string;
  name: string;
  type: ProductType;
  itemPhotoDataUrl?: string;
  googleCalendarId: string;
  isActive: boolean;
  createdAt: number;
  dailyRate: number;
  deposit: number;
}

export type AccessoryCategory = 'Bundle' | 'Dachträger' | 'Fußsatz' | 'Querträger' | 'Kit' | 'Sonstiges';

export interface RentalAccessory {
  id: string;
  name: string;
  category: AccessoryCategory;
  // Eindeutiger Schlüssel für Verfügbarkeits- und Vorgangsverknüpfung
  inventoryKey: string;
  brand?: string;
  model?: string;
  lengthCm?: number;
  notes?: string;
  photoDataUrl?: string;
  compatibleRelingTypes?: RelingType[];
  minVehicleWidthCm?: number;
  maxVehicleWidthCm?: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProductSuggestion {
  productType: ProductType;
  confidence: number; // 0..1
  alternativeProductType?: ProductType;
  reason?: string;
}

export interface AvailabilityCheckResult {
  resourceId: string;
  resourceName: string;
  isAvailable: boolean;
  busyRanges?: Array<{
    start: string;
    end: string;
  }>;
  error?: string;
}

// Gmail (minimal, UI-facing)
export interface GmailThread {
  id: string;
  snippet: string;
}

export interface GmailAttachmentSummary {
  messageId: string;
  attachmentId: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  // Optional import hint coming from Inbox review UI.
  importAs?: 'skip' | 'document' | 'roof_photo';
}

export interface GmailMessageFormatted {
  id: string;
  from?: string;
  date?: string;
  body?: string;
  attachments?: GmailAttachmentSummary[];
}

export interface GmailThreadFormatted {
  id: string;
  subject?: string;
  from?: string;
  date?: string;
  messages?: GmailMessageFormatted[];
}

export interface InboxImportResult {
  attachmentStats?: {
    pdfImported: number;
    pdfSkippedDuplicate: number;
    pdfSkippedTooLarge: number;
    pdfFailed: number;
    imageImported: number;
    imageSkippedAlreadySet: number;
    imageFailed: number;
  };
  customerCreated?: boolean;
  rentalAction?: 'created' | 'updated';
  rentalId?: string;
  usedFallbackDates?: boolean;
}

// Invoices
export type InvoiceType = 'Angebot' | 'Auftrag' | 'Rechnung';
export type InvoiceState = 'entwurf' | 'gesendet' | 'angenommen' | 'storniert' | 'archiviert';

// SubTotal-derived invoice type profiles (labels + column visibility per invoice type).
export type SubTotalInvoiceTypeProfile = {
  source: 'subtotal';
  invoiceTypeId: number;
  name: string;
  heading?: string;
  color?: string;
  language?: string;
  taxMode?: number;
  labels: Partial<{
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    totalSum: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    tax: string;
    lineTotal: string;
  }>;
  // SubTotal stores these as ints; for our use, we store boolean "show" after decoding.
  show: Partial<{
    lineItemNo: boolean;
    description: boolean;
    quantity: boolean;
    unit: boolean;
    unitPrice: boolean;
    tax: boolean;
    lineTotal: boolean;
  }>;
};

export interface Invoice {
  id: string;
  rentalRequestId?: string; // Optional linkage to the source Vorgang
  invoiceType: InvoiceType;
  invoiceNo: string;
  invoiceDate: number;
  dueDate?: number;
  state: InvoiceState;
  currency: string;

  companyId: string; // customerId
  buyerName: string;
  buyerAddress: string;
  salutation?: string;

  // Optional text blocks to match existing SubTotal-style PDFs.
  introText?: string; // e.g. "Hallo ...\nWie besprochen ...\nBesten Dank!"
  servicePeriodStart?: number; // e.g. rental start (ms)
  servicePeriodEnd?: number; // e.g. rental end (ms)

  paymentTerms?: string;
  paymentInfo?: string;
  paypalText?: string; // e.g. "Zahlungslink Paypal https://paypal.me/..."
  footerText?: string;
  taxNote?: string;
  agbText?: string; // full sentence (not just URL)
  agbLink?: string; // legacy/simple URL
  layoutId?: string;

  depositPercent?: number; // e.g. 50 (used mainly for Angebot)
  depositText?: string; // e.g. "Anzahlung 50 % nach Angebotsannahme"
  depositEnabled?: boolean; // optional toggle for Angebot/Auftrag

  // Rechnung: optionaler Hinweis, dass eine Kaution dankend erhalten wurde.
  depositReceivedEnabled?: boolean;
  depositReceivedAmount?: number;

  // Optional linkage for follow-up documents (Folgebeleg/Storno/Reissue).
  reissuedFromInvoiceId?: string; // new invoice references old
  replacesInvoiceId?: string; // old invoice references new (best-effort)

  createdAt: number;
  updatedAt: number;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  orderIndex: number;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  taxPercent: number;
  createdAt: number;
}

export interface InvoiceTemplate {
  invoiceType: InvoiceType;
  layoutId: string;
  defaultPaymentTerms: string;
  defaultPaymentInfo: string;
  defaultIntroText?: string;
  defaultPaypalText?: string;
  defaultFooterText: string;
  defaultTaxNote: string;
  defaultAgbText?: string;
  defaultAgbLink: string;
  defaultDepositPercent?: number;
  defaultDepositText?: string;
}
