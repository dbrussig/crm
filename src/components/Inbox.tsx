import { useEffect, useMemo, useRef, useState } from 'react';
import type { AISettings, Customer, GmailAttachmentSummary, InboxImportResult, ProductType, RentalRequest, PaymentKind, PaymentMethod, Invoice } from '../types';
import { getThread, listInboxThreadSummaries, markThreadProcessedWithClientId, type GmailThreadSummary } from '../services/googleGmailService';
import { detectDachboxRejectionReason, extractCustomerInfo, extractRentalInfo, generateReplySuggestion, suggestProductFromMessage } from '../services/messageService';
import { deleteKey, loadJson, saveJson } from '../services/_storage';
import { addPayment, getAllInvoices, getAllPayments, getAllRentalRequests } from '../services/sqliteService';
import { buildThreadPaymentAssignments, pickSuggestedInvoiceForPayment, type ThreadPaymentAssignment } from '../services/inboxPaymentMappingService';
import { generateConciergeReply, isAIAvailable } from '../services/aiService';
import { formatDisplayRef } from '../utils/displayId';

const CACHE_KEY = 'mietpark_crm_inbox_cache_v1';
const CACHE_VERSION = 1 as const;
const PAYMENT_REVIEW_KEY = 'mietpark_crm_payment_review_v1';
const PRIORITY_FILTER_KEY = 'mietpark_crm_inbox_priority_filter_v1';
const QUICK_ACTION_PREFS_KEY = 'mietpark_crm_inbox_quick_actions_v1';
const INBOX_AUTO_REFRESH_KEY = 'mietpark_crm_inbox_auto_refresh_v1';
const INBOX_AUTO_REFRESH_INTERVAL_MS = 30_000;

function getConfidenceAmpel(confidence?: number) {
  const c = typeof confidence === 'number' ? confidence : 0;
  if (c >= 0.8) {
    return {
      level: 'hoch',
      dotClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    };
  }
  if (c >= 0.6) {
    return {
      level: 'mittel',
      dotClass: 'bg-amber-500',
      badgeClass: 'bg-amber-50 border-amber-200 text-amber-700',
    };
  }
  return {
    level: 'niedrig',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 border-rose-200 text-rose-700',
  };
}

type ThreadPriority = 'sofort' | 'pruefen' | 'info';
type PriorityFilter = 'all' | 'focus';
type StatusFilter = 'all' | 'sofort' | 'antwort' | 'zahlung' | 'low_conf';
type QuickActionPrefs = {
  unavailable: boolean;
  payment: boolean;
  processed: boolean;
};
type SendChecklistState = {
  product: boolean;
  period: boolean;
  greeting: boolean;
  amount: boolean;
  mapping: boolean;
  paymentMarked: boolean;
  rejectionReason: boolean;
  rejectionText: boolean;
};
type PrimaryAction = 'payment_assign' | 'reject_template' | 'open_reply' | 'review_import' | 'open';

type ChecklistKey = keyof SendChecklistState;

function getChecklistConfig(action: PrimaryAction | undefined): {
  title: string;
  items: Array<{ key: ChecklistKey; label: string }>;
} {
  if (action === 'payment_assign') {
    return {
      title: 'Zahlungs-Checkliste',
      items: [
        { key: 'amount', label: 'Betrag geprüft' },
        { key: 'mapping', label: 'Vorgang zugeordnet' },
        { key: 'paymentMarked', label: 'Zahlung markiert/übernommen' },
      ],
    };
  }
  if (action === 'reject_template') {
    return {
      title: 'Ablehnungs-Checkliste',
      items: [
        { key: 'rejectionReason', label: 'Ablehnungsgrund geprüft' },
        { key: 'rejectionText', label: 'Ablehnungstext geprüft' },
      ],
    };
  }
  return {
    title: 'Versand-Checkliste',
    items: [
      { key: 'product', label: 'Produkt geprüft' },
      { key: 'period', label: 'Zeitraum geprüft' },
      { key: 'greeting', label: 'Anrede/Antworttext geprüft' },
    ],
  };
}

function getThreadPriority(opts: {
  customerLast: boolean;
  confidence?: number;
  paymentHint: boolean;
  paymentReviewed: boolean;
  blockedByRelingRule: boolean;
}): { level: ThreadPriority; label: string; badgeClass: string; dotClass: string; reason: string } {
  if ((opts.paymentHint && !opts.paymentReviewed) || opts.blockedByRelingRule) {
    return {
      level: 'sofort',
      label: 'Sofort',
      badgeClass: 'bg-rose-50 border-rose-200 text-rose-800',
      dotClass: 'bg-rose-500',
      reason: opts.blockedByRelingRule ? 'Reling/Fixpunkte-Regel prüfen' : 'Offene Zahlungszuordnung',
    };
  }
  if (opts.customerLast || (typeof opts.confidence === 'number' && opts.confidence < 0.6)) {
    return {
      level: 'pruefen',
      label: 'Prüfen',
      badgeClass: 'bg-amber-50 border-amber-200 text-amber-800',
      dotClass: 'bg-amber-500',
      reason: opts.customerLast ? 'Kunde wartet auf Antwort' : 'Niedrige Erkennungs-Konfidenz',
    };
  }
  return {
    level: 'info',
    label: 'Info',
    badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dotClass: 'bg-emerald-500',
    reason: 'Kein akuter Handlungsbedarf',
  };
}

function getPrimaryAction(opts: {
  paymentHint: boolean;
  paymentReviewed: boolean;
  blockedByRelingRule: boolean;
  customerLast: boolean;
  hasProduct: boolean;
  confidence?: number;
}): { type: PrimaryAction; label: string; helper: string } {
  if (opts.paymentHint && !opts.paymentReviewed) {
    return { type: 'payment_assign', label: 'Zahlung zuordnen', helper: 'PayPal-Eingang zuerst zuordnen' };
  }
  if (opts.blockedByRelingRule) {
    return { type: 'reject_template', label: 'Ablehnung vorbereiten', helper: 'Reling/Fixpunkte-Regel erkannt' };
  }
  if (opts.customerLast) {
    return { type: 'open_reply', label: 'Antwort vorbereiten', helper: 'Kunde wartet auf Antwort' };
  }
  if (opts.hasProduct && (typeof opts.confidence !== 'number' || opts.confidence >= 0.6)) {
    return { type: 'review_import', label: 'Import prüfen', helper: 'Produkt ausreichend erkannt' };
  }
  return { type: 'open', label: 'Öffnen', helper: 'Details manuell prüfen' };
}

function getConciergeMode(instruction: string): 'auto' | 'send_ready' | 'rework' {
  const value = (instruction || '').trim().toLowerCase();
  if (value.startsWith('/concierge weiter') || value.startsWith('ok') || value.startsWith('weiter')) return 'send_ready';
  if (value.startsWith('von mir')) return 'rework';
  return 'auto';
}

function isLikelyPaymentThreadHint(t: GmailThreadSummary): boolean {
  const from = String(t.from || '').toLowerCase();
  const subject = String(t.subject || '').toLowerCase();
  const snippet = String(t.snippet || '').toLowerCase();
  return (
    (from.includes('service@paypal.de') || /@paypal\./i.test(from)) &&
    (subject.includes('zahlung') || snippet.includes('zahlung') || subject.includes('du hast eine zahlung erhalten'))
  );
}

function parseFromHeader(fromHeader?: string): { name?: string; email?: string } {
  if (!fromHeader) return {};
  const m = /(.*?)(?:<([^>]+)>)?$/.exec(fromHeader.trim());
  const nameRaw = (m?.[1] || '').trim().replace(/^"|"$/g, '');
  const emailRaw = (m?.[2] || '').trim();
  const email = /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(emailRaw || fromHeader)?.[0];
  const name = nameRaw && nameRaw !== email ? nameRaw : undefined;
  return { name, email: email || undefined };
}

function pickCustomerEmail(opts: { fromHeader?: string; bodyText: string }): string | null {
  const OWN_DOMAINS = ['mietpark-saar-pfalz.com', 'mietpark-saar-pfalz.de'];
  const isOwn = (email: string) => OWN_DOMAINS.some((d) => email.toLowerCase().endsWith('@' + d));

  // Prefer explicit field from website contact-form mails.
  const byField =
    /e-?mail:\s*([^\s@<>\n\r]+@[^\s@<>\n\r]+\.[^\s@<>\n\r]+)/i.exec(opts.bodyText)?.[1] ||
    /\[([^\s@<>\n\r]+@[^\s@<>\n\r]+\.[^\s@<>\n\r]+)\]/.exec(opts.bodyText)?.[1];
  if (byField && !isOwn(byField)) return byField;

  const all = Array.from(opts.bodyText.matchAll(/[^\s@<>\[\]()]+@[^\s@<>\[\]()]+\.[^\s@<>\[\]()]+/g))
    .map((m) => m[0])
    .filter(Boolean);
  const bodyPick = all.find((e) => !isOwn(e));
  if (bodyPick) return bodyPick;

  const hdr = parseFromHeader(opts.fromHeader).email;
  if (hdr && !isOwn(hdr)) return hdr;

  return hdr || null;
}

function stripQuotedText(text: string): string {
  const src = String(text || '').replace(/\r\n/g, '\n');
  if (!src.trim()) return '';

  const lines = src.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (
      /^am\s.+schrieb/i.test(l) ||
      /^on\s.+wrote:/i.test(l) ||
      /^von:\s/i.test(l) ||
      /^from:\s/i.test(l) ||
      /^gesendet:\s/i.test(l) ||
      /^subject:\s/i.test(l) ||
      /^betreff:\s/i.test(l) ||
      /^-{2,}\s*original message/i.test(l) ||
      /^>{1,}/.test(l)
    ) {
      break;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

type InboxCacheV1 = {
  version: typeof CACHE_VERSION;
  savedAt: number;
  threads: GmailThreadSummary[];
  nextPageToken?: string;
  selectedThreadId?: string | null;
  selectedThread?: any | null;
  threadDetailsById: Record<string, any>;
};

type ImportDraft = {
  emailFrom: string;
  customerNameHint?: { firstName?: string; lastName?: string };
  customerAddressHint?: { street?: string; zipCode?: string; city?: string; country?: string };
  customerPhoneHint?: string;
  contactDate?: number;
  gmailThreadId?: string | null;
  productType: ProductType;
  rentalStart?: number;
  rentalEnd?: number;
  rawText: string;
};

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function unavailableTemplate(productType: ProductType): string {
  return (
    `Leider ist in dem Zeitraum das Mietgerät ${productType} nicht verfügbar.\n` +
    `Vielen Dank für ihr Verständnis\n\n` +
    `Viele Grüße Daniel Brußig\n` +
    `Mietpark Saar-Pfalz\n\n` +
    `📞 Mobil: +49 173 7615995\n` +
    `☎️ Telefon: +49 6841 9800622\n\n` +
    `📧 E-Mail: kontakt@mietpark-saar-pfalz.com\n` +
    `🌐 Webseite: www.mietpark-saar-pfalz.com\n\n\n` +
    `Unternehmensadresse:\n` +
    `Kastanienweg 17\n` +
    `66424 Homburg\n` +
    `Deutschland`
  );
}

function relingRejectTemplate(): string {
  return (
    `vielen Dank für Ihre Anfrage.\n\n` +
    `Für Dachbox-Vermietungen benötigen wir eine offene oder geschlossene Reling. ` +
    `Bei Fahrzeugen ohne Reling bzw. nur mit Fixpunkten können wir leider keine sichere Montage anbieten.\n\n` +
    `Viele Grüße Daniel Brußig\n` +
    `Mietpark Saar-Pfalz\n\n` +
    `📞 Mobil: +49 173 7615995\n` +
    `☎️ Telefon: +49 6841 9800622\n\n` +
    `📧 E-Mail: kontakt@mietpark-saar-pfalz.com\n` +
    `🌐 Webseite: www.mietpark-saar-pfalz.com`
  );
}

function sanitizeThreadForCache(thread: any) {
  if (!thread || typeof thread !== 'object') return thread;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  // Keep last messages; bodies can be huge (HTML, signatures, full quotes).
  const tail = messages.slice(Math.max(0, messages.length - 12)).map((m: any) => ({
    id: m?.id,
    from: m?.from,
    date: m?.date,
    body: typeof m?.body === 'string' ? truncateText(m.body, 25_000) : '',
    attachments: Array.isArray(m?.attachments) ? m.attachments : [],
  }));
  return {
    id: thread.id,
    subject: thread.subject,
    from: thread.from,
    date: thread.date,
    messages: tail,
  };
}

function parseEuroAmount(text: string): number | null {
  const m =
    /(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*(?:€|eur)\b/i.exec(text) ||
    /(\d+(?:[.,]\d{2}))\s*(?:€|eur)\b/i.exec(text);
  if (!m?.[1]) return null;
  const raw = m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const val = Number(raw);
  return Number.isFinite(val) ? val : null;
}

function extractPayPalPayment(allText: string, meta: { from?: string; subject?: string; snippet?: string; lastDate?: any; messages?: any[] }) {
  const fromLower = String(meta.from || '').toLowerCase();
  const subjLower = String(meta.subject || '').toLowerCase();
  const snipLower = String(meta.snippet || '').toLowerCase();
  const isPayPalSender =
    fromLower.includes('<service@paypal.de>') ||
    fromLower.includes('service@paypal.de') ||
    /@paypal\./i.test(String(meta.from || ''));
  const isPayPalSubject = subjLower.includes('du hast eine zahlung erhalten');
  const looksLikePayPal = isPayPalSender && (isPayPalSubject || subjLower.includes('zahlung') || snipLower.includes('zahlung'));

  if (!looksLikePayPal) return null;

  const amount = parseEuroAmount(allText) ?? parseEuroAmount(String(meta.snippet || ''));
  const payerName =
    /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß'`\u2019\- ]{2,80}?)\s+hat dir\s+/i.exec(allText)?.[1]?.trim() ||
    /von\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß'`\u2019\- ]{2,80})\s*$/im.exec(allText)?.[1]?.trim();
  const tx =
    /(Transaktions(?:code|nummer|id)|Transaction(?:\s*ID)?)[^A-Z0-9]*([A-Z0-9]{10,})/i.exec(allText)?.[2]?.trim();

  // Use the latest message date for a payment mail.
  const toMs = (d: any) => {
    if (!d) return 0;
    if (typeof d === 'number') return d;
    const t = Date.parse(String(d));
    return Number.isFinite(t) ? t : 0;
  };
  const msgDates = (meta.messages || []).map((m: any) => toMs(m?.date)).filter((n: number) => n > 0);
  const receivedAt = msgDates.length ? Math.max(...msgDates) : toMs(meta.lastDate) || Date.now();

  if (!amount) return null; // If we cannot detect an amount, don't treat it as payment.

  return {
    amount,
    currency: 'EUR',
    payerName: payerName || undefined,
    providerTransactionId: tx || undefined,
    receivedAt,
  };
}

async function loadInboxCache(): Promise<InboxCacheV1 | null> {
  try {
    const parsed = await loadJson<any>(CACHE_KEY, null);
    if (!parsed || parsed.version !== CACHE_VERSION) return null;
    if (!Array.isArray(parsed.threads)) return null;
    return parsed as InboxCacheV1;
  } catch {
    return null;
  }
}

async function saveInboxCache(cache: InboxCacheV1) {
  try {
    await saveJson(CACHE_KEY, cache);
  } catch {
    // Ignore: cache is best-effort.
  }
}

export default function Inbox(props: {
  clientId: string;
  aiSettings: AISettings;
  customers: Customer[];
  onOpenSettings?: () => void;
  onImport: (data: {
    emailFrom: string;
    customerNameHint?: { firstName?: string; lastName?: string };
    customerAddressHint?: { street?: string; zipCode?: string; city?: string; country?: string };
    customerPhoneHint?: string;
    contactDate?: number;
    gmailThreadId?: string | null;
    gmailAttachments?: GmailAttachmentSummary[];
    productType: ProductType;
    rentalStart?: number;
    rentalEnd?: number;
    rawText: string;
  }) => Promise<InboxImportResult | void>;
}) {
  const [threads, setThreads] = useState<GmailThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(INBOX_AUTO_REFRESH_KEY);
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });
  const [prioritizeNeedsReply, setPrioritizeNeedsReply] = useState<boolean>(true);
  const [onlyNeedsReply, setOnlyNeedsReply] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(() => {
    const v = localStorage.getItem(PRIORITY_FILTER_KEY);
    return v === 'all' ? 'all' : 'focus';
  });
  const [quickActionPrefs, setQuickActionPrefs] = useState<QuickActionPrefs>(() => {
    try {
      const raw = localStorage.getItem(QUICK_ACTION_PREFS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        unavailable: parsed?.unavailable !== false,
        payment: parsed?.payment !== false,
        processed: parsed?.processed !== false,
      };
    } catch {
      return { unavailable: true, payment: true, processed: true };
    }
  });
  const [archiveAfterImport, setArchiveAfterImport] = useState<boolean>(() => {
    const v = localStorage.getItem('mietpark_crm_archive_after_import');
    return v === null ? true : v === 'true';
  });
  const [threadDetailsById, setThreadDetailsById] = useState<Record<string, any>>({});
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<InboxImportResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAttachments, setReviewAttachments] = useState<GmailAttachmentSummary[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [importMapOpen, setImportMapOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<GmailAttachmentSummary[]>([]);
  const [paymentAssignOpen, setPaymentAssignOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [paymentRentals, setPaymentRentals] = useState<RentalRequest[] | null>(null);
  const [paymentInvoicesByRentalId, setPaymentInvoicesByRentalId] = useState<Record<string, Invoice[]>>({});
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentRentalId, setPaymentRentalId] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentCurrency, setPaymentCurrency] = useState<string>('EUR');
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('Anzahlung');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PayPal');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [paymentProviderTx, setPaymentProviderTx] = useState<string>('');
  const [paymentPayerName, setPaymentPayerName] = useState<string>('');
  const [paymentReceivedAt, setPaymentReceivedAt] = useState<number>(Date.now());
  const [paymentSuggestedRentalId, setPaymentSuggestedRentalId] = useState<string>('');
  const [paymentSuggestedInvoiceId, setPaymentSuggestedInvoiceId] = useState<string>('');
  const [paymentAssignmentByThreadId, setPaymentAssignmentByThreadId] = useState<Record<string, ThreadPaymentAssignment>>({});
  const pollInFlightRef = useRef(false);
  const [paymentReviewedByThreadId, setPaymentReviewedByThreadId] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(PAYMENT_REVIEW_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [lowConfidenceApproved, setLowConfidenceApproved] = useState(false);
  const [conciergeInstruction, setConciergeInstruction] = useState('');
  const [conciergeReply, setConciergeReply] = useState('');
  const [conciergeApproved, setConciergeApproved] = useState(false);
  const [conciergeBusy, setConciergeBusy] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const [shortcutUnavailableProduct, setShortcutUnavailableProduct] = useState<ProductType>('Dachbox XL');
  const [rejectRuleOverride, setRejectRuleOverride] = useState(false);
  const [manualProductOverride, setManualProductOverride] = useState<ProductType | ''>('');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [sendChecklist, setSendChecklist] = useState<SendChecklistState>({
    product: false,
    period: false,
    greeting: false,
    amount: false,
    mapping: false,
    paymentMarked: false,
    rejectionReason: false,
    rejectionText: false,
  });

  const canUse = Boolean(props.clientId?.trim());

  const markPaymentReviewed = (threadId?: string | null, reviewed = true) => {
    if (!threadId) return;
    setPaymentReviewedByThreadId((prev) => {
      const next = { ...prev, [threadId]: reviewed };
      try {
        localStorage.setItem(PAYMENT_REVIEW_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSendChecklist((prev) => ({
      ...prev,
      paymentMarked: reviewed,
      ...(reviewed ? {} : { amount: false, mapping: false }),
    }));
  };

  const resetSendChecklist = () => {
    setSendChecklist({
      product: false,
      period: false,
      greeting: false,
      amount: false,
      mapping: false,
      paymentMarked: false,
      rejectionReason: false,
      rejectionText: false,
    });
  };

  const setReplyDraft = (next: string) => {
    setConciergeReply(next);
    setConciergeApproved(false);
    resetSendChecklist();
  };

  const paymentInvoicesForSelectedRental = useMemo(
    () => (paymentRentalId ? (paymentInvoicesByRentalId[paymentRentalId] || []) : []),
    [paymentInvoicesByRentalId, paymentRentalId]
  );

  useEffect(() => {
    let cancelled = false;
    const threadIds = new Set((threads || []).map((t) => String(t.id || '')).filter(Boolean));
    if (threadIds.size === 0) {
      setPaymentAssignmentByThreadId({});
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const [payments, invoices] = await Promise.all([getAllPayments(), getAllInvoices()]);
        if (cancelled) return;
        const assignments = buildThreadPaymentAssignments(payments, invoices, threadIds);
        setPaymentAssignmentByThreadId(assignments);
      } catch {
        if (!cancelled) setPaymentAssignmentByThreadId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threads]);

  const applyRejectReplyDraft = () => {
    setReplyDraft(relingRejectTemplate());
    setSendChecklist((prev) => ({
      ...prev,
      rejectionReason: true,
      rejectionText: true,
    }));
  };

  const applyUnavailableReplyDraft = (productType: ProductType) => {
    setReplyDraft(unavailableTemplate(productType));
    setSendChecklist((prev) => ({
      ...prev,
      product: true,
      period: true,
      greeting: true,
    }));
  };

  const isUsEmail = (email?: string) => {
    const e = (email || '').toLowerCase();
    return e.endsWith('@mietpark-saar-pfalz.com') || e.endsWith('@mietpark-saar-pfalz.de');
  };

  const displayForThread = (t: GmailThreadSummary) => {
    const first = parseFromHeader(t.from);
    const last = parseFromHeader((t as any).lastFrom);

    // Prefer the last non-us sender (usually the customer).
    const candidate = last.email && !isUsEmail(last.email) ? last : first;

    const name = candidate.name || undefined;
    const email = candidate.email || undefined;

    const lastIsUs = last.email ? isUsEmail(last.email) : (first.email ? isUsEmail(first.email) : false);
    const who = lastIsUs ? 'Wir zuletzt' : 'Kunde zuletzt';

    // Best-effort extraction for list chips from subject+snippet.
    const hintText = `${t.subject || ''}\n${t.snippet || ''}`;
    const suggestion = suggestProductFromMessage(hintText);
    const rejectionCheck = detectDachboxRejectionReason(hintText);
    const product = suggestion?.productType;
    const rental = extractRentalInfo(hintText);
    const paymentHint = isLikelyPaymentThreadHint(t);
    const paymentReviewed = Boolean(paymentReviewedByThreadId[t.id]);
    const blockedByRelingRule = Boolean(rejectionCheck.shouldReject);
    const priority = getThreadPriority({
      customerLast: !lastIsUs,
      confidence: suggestion?.confidence,
      paymentHint,
      paymentReviewed,
      blockedByRelingRule,
    });
    const primaryAction = getPrimaryAction({
      paymentHint,
      paymentReviewed,
      blockedByRelingRule,
      customerLast: !lastIsUs,
      hasProduct: Boolean(product),
      confidence: suggestion?.confidence,
    });

    return {
      name,
      email,
      who,
      lastIsUs,
      product,
      confidence: suggestion?.confidence,
      paymentHint,
      paymentReviewed,
      blockedByRelingRule,
      priority,
      primaryAction,
      rentalStart: rental.rentalStart,
      rentalEnd: rental.rentalEnd,
    };
  };

  const threadsForList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const toTs = (t: GmailThreadSummary) => {
      const internal = (t as any).lastInternalDate;
      if (typeof internal === 'number' && Number.isFinite(internal)) return internal;
      const raw = (t as any).lastDate || t.date;
      const parsed = raw ? Date.parse(String(raw)) : NaN;
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const filtered = threads.filter((t) => {
      const d = displayForThread(t);
      if (onlyNeedsReply && d.lastIsUs) return false;
      if (priorityFilter === 'focus' && d.priority.level === 'info') return false;
      if (statusFilter === 'sofort' && d.priority.level !== 'sofort') return false;
      if (statusFilter === 'antwort' && d.lastIsUs) return false;
      if (statusFilter === 'zahlung' && !d.paymentHint) return false;
      if (statusFilter === 'low_conf' && !(typeof d.confidence === 'number' && d.confidence < 0.6)) return false;
      if (!q) return true;
      const hay = `${d.name || ''} ${d.email || ''} ${(t.subject || '')} ${(t.snippet || '')}`.toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => {
      const da = displayForThread(a);
      const db = displayForThread(b);
      if (prioritizeNeedsReply) {
        const aNeeds = da.lastIsUs ? 1 : 0; // customer-last first
        const bNeeds = db.lastIsUs ? 1 : 0;
        if (aNeeds !== bNeeds) return aNeeds - bNeeds;
      }
      return toTs(b) - toTs(a);
    });

    return filtered;
  }, [threads, search, prioritizeNeedsReply, onlyNeedsReply, priorityFilter, paymentReviewedByThreadId, statusFilter]);

  const inboxStats = useMemo(() => {
    let needsReply = 0;
    let paymentHints = 0;
    let lowConfidence = 0;
    let urgent = 0;
    for (const t of threads) {
      const d = displayForThread(t);
      if (!d.lastIsUs) needsReply += 1;
      if (typeof d.confidence === 'number' && d.confidence < 0.6) lowConfidence += 1;
      if (isLikelyPaymentThreadHint(t)) paymentHints += 1;
      if (d.priority.level === 'sofort') urgent += 1;
    }
    return {
      total: threads.length,
      needsReply,
      paymentHints,
      lowConfidence,
      urgent,
    };
  }, [threads, paymentReviewedByThreadId]);

  useEffect(() => {
    if (cacheLoaded) return;
    let cancelled = false;
    (async () => {
      const cached = await loadInboxCache();
      if (cancelled) return;
      if (cached) {
        setThreads(cached.threads || []);
        setNextPageToken(cached.nextPageToken);
        setSelectedThreadId(cached.selectedThreadId ?? null);
        setSelectedThread(cached.selectedThread ?? null);
        setThreadDetailsById(cached.threadDetailsById || {});
      }
      setCacheLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheLoaded]);

  useEffect(() => {
    if (!cacheLoaded) return;
    const cache: InboxCacheV1 = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      threads: threads.slice(0, 120),
      nextPageToken,
      selectedThreadId,
      selectedThread: selectedThread ? sanitizeThreadForCache(selectedThread) : selectedThread,
      threadDetailsById,
    };
    void saveInboxCache(cache);
  }, [cacheLoaded, threads, nextPageToken, selectedThreadId, selectedThread, threadDetailsById]);

  const analysis = useMemo(() => {
    if (!selectedThread?.messages?.length) return null;
    const allTextRaw = selectedThread.messages.map((m: any) => m.body || '').join('\n\n');
    const allTextClean = selectedThread.messages.map((m: any) => stripQuotedText(m.body || '')).filter(Boolean).join('\n\n');
    const allText = allTextClean || allTextRaw;
    const hintText = [selectedThread.subject, selectedThread.snippet, allText].filter(Boolean).join('\n');
    const suggestion = suggestProductFromMessage(hintText);
    const rental = extractRentalInfo(allText);
    const customer = extractCustomerInfo(allText);
    const rejectionCheck = detectDachboxRejectionReason(allText);
    const fromEmail = pickCustomerEmail({ fromHeader: selectedThread.from, bodyText: allText }) ||
      pickCustomerEmail({ fromHeader: selectedThread.from, bodyText: allTextRaw });
    const reply = suggestion
      ? generateReplySuggestion(allText, suggestion, rental)
      : '';
    const payment = extractPayPalPayment(allTextRaw, {
      from: selectedThread.from,
      subject: selectedThread.subject,
      snippet: selectedThread.snippet,
      lastDate: (selectedThread as any).lastDate || selectedThread.date,
      messages: selectedThread.messages,
    });

    const toMs = (d: any) => {
      if (!d) return 0;
      if (typeof d === 'number') return d;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    };
    const headerTs = toMs(selectedThread.date);
    const msgDates = (selectedThread.messages || []).map((m: any) => toMs(m?.date)).filter((n: number) => n > 0);
    const firstTs = msgDates.length ? Math.min(...msgDates) : (headerTs || Date.now());

    return {
      fromEmail,
      allText,
      allTextRaw,
      suggestion,
      rejectionCheck,
      rental,
      customer,
      reply,
      contactDate: firstTs,
      payment,
    };
  }, [selectedThread]);

  useEffect(() => {
    if (!selectedThreadId) {
      setConciergeReply('');
      setConciergeInstruction('');
      setConciergeApproved(false);
      resetSendChecklist();
      setConciergeError(null);
      setImportMapOpen(false);
      setImportDraft(null);
      setPendingAttachments([]);
      setLowConfidenceApproved(false);
      setWizardStep(1);
      return;
    }
    setLowConfidenceApproved(false);
    setConciergeReply(analysis?.reply || '');
    setConciergeApproved(false);
    resetSendChecklist();
    setConciergeError(null);
    setShortcutUnavailableProduct((analysis?.suggestion?.productType as ProductType) || 'Dachbox XL');
    setRejectRuleOverride(false);
    setManualProductOverride('');
    setWizardStep(1);
  }, [selectedThreadId, analysis?.reply]);

  const sortedConversationMessages = useMemo(() => {
    const msgs = Array.isArray(selectedThread?.messages) ? [...selectedThread.messages] : [];
    const toMs = (d: any) => {
      if (!d) return 0;
      if (typeof d === 'number') return d;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    };
    // Newest -> oldest
    msgs.sort((a: any, b: any) => toMs(b?.date) - toMs(a?.date));
    return msgs;
  }, [selectedThread]);

  function persistArchiveSetting(next: boolean) {
    setArchiveAfterImport(next);
    localStorage.setItem('mietpark_crm_archive_after_import', String(next));
  }

  function persistPriorityFilter(next: PriorityFilter) {
    setPriorityFilter(next);
    localStorage.setItem(PRIORITY_FILTER_KEY, next);
  }

  function persistQuickActionPref(key: keyof QuickActionPrefs, next: boolean) {
    setQuickActionPrefs((prev) => {
      const updated = { ...prev, [key]: next };
      localStorage.setItem(QUICK_ACTION_PREFS_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function persistAutoRefresh(next: boolean) {
    setAutoRefreshEnabled(next);
    try {
      localStorage.setItem(INBOX_AUTO_REFRESH_KEY, String(next));
    } catch {
      // ignore
    }
  }

  async function loadInbox(
    more = false,
    opts?: { silent?: boolean; mergeExisting?: boolean }
  ) {
    if (!canUse) return;
    const silent = Boolean(opts?.silent);
    const mergeExisting = Boolean(opts?.mergeExisting);
    if (!silent) {
      setError(null);
      setLoading(true);
    }
    try {
      const resp = await listInboxThreadSummaries({
        clientId: props.clientId,
        maxResults: 20,
        pageToken: more ? nextPageToken : undefined,
      });
      setThreads((prev) => {
        const next = more
          ? [...prev, ...resp.threads]
          : (mergeExisting ? [...resp.threads, ...prev] : resp.threads);
        // De-dup by id (can happen when paging / cache merges).
        const seen = new Set<string>();
        const deduped = next.filter((t) => {
          if (!t?.id) return false;
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        // Keep inbox order stable: newest thread first.
        const toMs = (t: any) => {
          const d = (t as any)?.lastDate || t?.date;
          if (!d) return 0;
          if (typeof d === 'number') return d;
          const ts = Date.parse(String(d));
          return Number.isFinite(ts) ? ts : 0;
        };
        deduped.sort((a: any, b: any) => toMs(b) - toMs(a));
        return deduped;
      });
      setNextPageToken(resp.nextPageToken);
    } catch (e: any) {
      if (!silent) setError(e?.message || String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!canUse || !autoRefreshEnabled) return;
    const tick = async () => {
      if (document.hidden) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        await loadInbox(false, { silent: true, mergeExisting: true });
      } finally {
        pollInFlightRef.current = false;
      }
    };
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    const onFocus = () => {
      void tick();
    };
    const id = window.setInterval(() => {
      void tick();
    }, INBOX_AUTO_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [canUse, autoRefreshEnabled, props.clientId]);

  async function openThread(threadId: string) {
    if (!canUse) return;
    setError(null);
    setSelectedThreadId(threadId);
    // Instant render from cache if available.
    const cached = threadDetailsById[threadId];
    if (cached) setSelectedThread(cached);
    else setSelectedThread(null);
    setLoading(true);
    try {
      const t = await getThread({ clientId: props.clientId, threadId });
      setSelectedThread(t);
      setThreadDetailsById((prev) => ({ ...prev, [threadId]: sanitizeThreadForCache(t) }));
      return t;
    } catch (e: any) {
      setError(e?.message || String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function doImport(attachments: GmailAttachmentSummary[], draft?: ImportDraft) {
    const payload = draft || importDraft || null;
    if (!payload?.emailFrom) {
      alert('Konnte Absender-E-Mail nicht ermitteln.');
      return;
    }
    if (!payload.productType) {
      alert('Konnte Produkt nicht sicher erkennen. Bitte in Nachricht markieren/ergänzen.');
      return;
    }

    setImportFeedback(null);
    setImportSummary(null);
    const res = (await props.onImport({
      emailFrom: payload.emailFrom,
      customerNameHint: payload.customerNameHint,
      customerAddressHint: payload.customerAddressHint,
      customerPhoneHint: payload.customerPhoneHint,
      contactDate: payload.contactDate,
      gmailThreadId: payload.gmailThreadId ?? selectedThreadId,
      gmailAttachments: attachments,
      productType: payload.productType,
      rentalStart: payload.rentalStart,
      rentalEnd: payload.rentalEnd,
      rawText: payload.rawText,
    })) as InboxImportResult | void;
    setImportSummary(res || null);

    const stats = res?.attachmentStats;
    const summarizeAttachments = (s: InboxImportResult['attachmentStats']) => {
      const parts: string[] = [];
      if (!s) return '';
      if (s.pdfImported || s.pdfSkippedDuplicate || s.pdfSkippedTooLarge || s.pdfFailed) {
        const pdfBits: string[] = [];
        if (s.pdfImported) pdfBits.push(`${s.pdfImported} gespeichert`);
        if (s.pdfSkippedDuplicate) pdfBits.push(`${s.pdfSkippedDuplicate} Duplikat`);
        if (s.pdfSkippedTooLarge) pdfBits.push(`${s.pdfSkippedTooLarge} zu gross (>10 MB)`);
        if (s.pdfFailed) pdfBits.push(`${s.pdfFailed} fehlgeschlagen`);
        parts.push(`PDF: ${pdfBits.join(', ')}`);
      }
      if (s.imageImported || s.imageSkippedAlreadySet || s.imageFailed) {
        const imgBits: string[] = [];
        if (s.imageImported) imgBits.push(`${s.imageImported} als Reling-Foto gesetzt`);
        if (s.imageSkippedAlreadySet) imgBits.push(`${s.imageSkippedAlreadySet} übersprungen (Foto schon vorhanden)`);
        if (s.imageFailed) imgBits.push(`${s.imageFailed} fehlgeschlagen`);
        parts.push(`Bild: ${imgBits.join(', ')}`);
      }
      return parts.join(' | ');
    };

    if (stats) {
      setImportFeedback(summarizeAttachments(stats) || null);
    }

    if (selectedThreadId) {
      try {
        await markThreadProcessedWithClientId({
          clientId: props.clientId,
          threadId: selectedThreadId,
          archive: archiveAfterImport,
        });
        // Optimistic UI: remove from list; it will also disappear from INBOX when archived.
        setThreads((prev) => prev.filter((t) => t.id !== selectedThreadId));
        setThreadDetailsById((prev) => {
          const next = { ...prev };
          delete next[selectedThreadId];
          return next;
        });
        setSelectedThreadId(null);
        setSelectedThread(null);
      } catch (e: any) {
        // Import is done; labeling is best-effort.
        setError(`Import OK, aber Gmail Markierung fehlgeschlagen: ${e?.message || String(e)}`);
      }
    }
    const after = summarizeAttachments(res?.attachmentStats);
    const fallbackHint = res?.usedFallbackDates
      ? '\n\nHinweis: Zeitraum wurde nicht eindeutig erkannt und automatisch vorbelegt.'
      : '';

    alert(`In CRM übernommen.${after ? `\n\nAnhänge: ${after}` : ''}${fallbackHint}`);
    setImportMapOpen(false);
    setImportDraft(null);
    setPendingAttachments([]);
  }

  async function importSelected() {
    if (!analysis?.fromEmail) {
      alert('Konnte Absender-E-Mail nicht ermitteln.');
      return;
    }
    const selectedProductType = (manualProductOverride || analysis.suggestion?.productType) as ProductType | undefined;
    if (!selectedProductType) {
      alert('Konnte Produkt nicht sicher erkennen. Bitte in Nachricht markieren/ergänzen.');
      return;
    }

    const attachments: GmailAttachmentSummary[] = (() => {
      const msgs = Array.isArray(selectedThread?.messages) ? selectedThread.messages : [];
      const out: GmailAttachmentSummary[] = [];
      for (const m of msgs) {
        const arr = Array.isArray(m?.attachments) ? m.attachments : [];
        for (const a of arr) {
          if (!a?.messageId || !a?.attachmentId) continue;
          out.push(a as GmailAttachmentSummary);
        }
      }
      return out;
    })();

    const nameFromHeader = parseFromHeader(selectedThread?.from).name || '';
    const nameParts = nameFromHeader.split(/\s+/).filter(Boolean);
    const fallbackFirstName = analysis.customer.firstName || (nameParts[0] || '');
    const fallbackLastName = analysis.customer.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');

    const draft: ImportDraft = {
      emailFrom: analysis.fromEmail,
      customerNameHint: { firstName: fallbackFirstName, lastName: fallbackLastName },
      customerAddressHint: analysis.customer.address,
      customerPhoneHint: analysis.customer.phone,
      contactDate: analysis.contactDate,
      gmailThreadId: selectedThreadId,
      productType: selectedProductType,
      rentalStart: analysis.rental.rentalStart,
      rentalEnd: analysis.rental.rentalEnd,
      rawText: analysis.allTextRaw || analysis.allText,
    };
    setImportDraft(draft);
    setPendingAttachments(attachments);
    setImportMapOpen(true);
  }

  async function continueImportFromMapping() {
    if (!importDraft) return;
    if (!importDraft.emailFrom?.trim()) {
      alert('Bitte eine Kunden-E-Mail eingeben.');
      return;
    }
    if (!importDraft.productType) {
      alert('Bitte ein Produkt auswählen.');
      return;
    }

    const normalizedEmail = importDraft.emailFrom.trim().toLowerCase();
    const existing = props.customers.find((c) => (c.email || '').trim().toLowerCase() === normalizedEmail);
    const existingPhotos = existing
      ? (Array.isArray((existing as any).roofRailPhotoDataUrls)
          ? (existing as any).roofRailPhotoDataUrls.filter(Boolean)
          : (existing as any).roofRailPhotoDataUrl ? [String((existing as any).roofRailPhotoDataUrl)] : [])
      : [];
    const hasRoofPhotos = existingPhotos.length > 0;

    const attachments = pendingAttachments;
    if (!attachments.length) {
      setImportMapOpen(false);
      await doImport([], importDraft);
      return;
    }

    const withDefaults = attachments.map((a) => {
      const mt = String(a.mimeType || '').toLowerCase();
      const name = String(a.filename || '').toLowerCase();
      const isPdf = mt === 'application/pdf' || name.endsWith('.pdf');
      const isImage = mt.startsWith('image/');
      const importAs: GmailAttachmentSummary['importAs'] =
        isPdf ? 'document' : isImage ? (hasRoofPhotos ? 'skip' : 'roof_photo') : 'skip';
      return { ...a, importAs };
    });

    setReviewAttachments(withDefaults);
    setImportMapOpen(false);
    setReviewOpen(true);
  }

  async function markSelectedProcessed() {
    if (!selectedThreadId) return;
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      await markThreadProcessedWithClientId({
        clientId: props.clientId,
        threadId: selectedThreadId,
        archive: archiveAfterImport,
      });
      setThreads((prev) => prev.filter((t) => t.id !== selectedThreadId));
      setThreadDetailsById((prev) => {
        const next = { ...prev };
        delete next[selectedThreadId];
        return next;
      });
      setSelectedThreadId(null);
      setSelectedThread(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function markThreadProcessed(threadId: string) {
    if (!threadId) return;
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      await markThreadProcessedWithClientId({
        clientId: props.clientId,
        threadId,
        archive: archiveAfterImport,
      });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      setThreadDetailsById((prev) => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
        setSelectedThread(null);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openPaymentAssignPrefilled(payment: {
    amount: number;
    currency: string;
    payerName?: string;
    providerTransactionId?: string;
    receivedAt?: number;
  }, context?: { subject?: string }) {
    setPaymentFeedback(null);
    setPaymentAssignOpen(true);
    setPaymentSuggestedRentalId('');
    setPaymentSuggestedInvoiceId('');
    setPaymentRentalId('');
    setPaymentInvoiceId('');
    setPaymentMethod('PayPal');
    setPaymentKind('Anzahlung');
    setPaymentAmount(Number(payment.amount) || 0);
    setPaymentCurrency(payment.currency || 'EUR');
    setPaymentPayerName(payment.payerName || '');
    setPaymentProviderTx(payment.providerTransactionId || '');
    setPaymentReceivedAt(payment.receivedAt || Date.now());
    setPaymentNote(`Zuordnung aus Postfach: ${context?.subject || ''}`.trim());
    setSendChecklist((prev) => ({
      ...prev,
      amount: Number(payment.amount) > 0,
      mapping: false,
      paymentMarked: false,
    }));
    try {
      const all = await getAllRentalRequests();
      setPaymentRentals(all);
      const allInvoices = await getAllInvoices();
      const invoicesByRental = allInvoices.reduce<Record<string, Invoice[]>>((acc, inv) => {
        const rentalId = String(inv.rentalRequestId || '').trim();
        if (!rentalId) return acc;
        if (!acc[rentalId]) acc[rentalId] = [];
        acc[rentalId].push(inv);
        return acc;
      }, {});
      setPaymentInvoicesByRentalId(invoicesByRental);

      // Prefer manual linking. Only auto-suggest if we have an unambiguous 1:1 match by payer name.
      const normalize = (s: string) =>
        (s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const payer = normalize(payment.payerName || '');
      if (payer) {
        const exactCustomers = props.customers.filter((c) => {
          const full = normalize(`${c.firstName || ''} ${c.lastName || ''}`.trim());
          return full && full === payer;
        });
        if (exactCustomers.length === 1) {
          const custId = exactCustomers[0].id;
          const isClosed = (s: any) =>
            s === 'archiviert' || s === 'abgeschlossen' || s === 'abgelehnt' || s === 'storniert' || s === 'noshow';
          const openForCustomer = all.filter((r) => r.customerId === custId && !isClosed(r.status));
          if (openForCustomer.length === 1) {
            const autoRentalId = openForCustomer[0].id;
            setPaymentSuggestedRentalId(autoRentalId);
            setPaymentRentalId(autoRentalId);
            const suggestion = pickSuggestedInvoiceForPayment(invoicesByRental[autoRentalId] || []);
            setPaymentSuggestedInvoiceId(suggestion?.id || '');
            setPaymentInvoiceId(suggestion?.id || '');
            setSendChecklist((prev) => ({ ...prev, mapping: true }));
          }
        }
      }
    } catch {
      setPaymentRentals(null);
      setPaymentInvoicesByRentalId({});
    }
  }

  function extractPaymentFromThread(thread: any) {
    if (!thread || !Array.isArray(thread.messages)) return null;
    const allTextRaw = thread.messages.map((m: any) => m.body || '').join('\n\n');
    return extractPayPalPayment(allTextRaw, {
      from: thread.from,
      subject: thread.subject,
      snippet: thread.snippet,
      lastDate: thread.lastDate || thread.date,
      messages: thread.messages,
    });
  }

  async function runPrimaryAction(thread: GmailThreadSummary) {
    const d = displayForThread(thread);
    const loaded = await openThread(thread.id);

    if (d.primaryAction.type === 'payment_assign') {
      const detectedPayment = extractPaymentFromThread(loaded);
      if (detectedPayment) {
        await openPaymentAssignPrefilled(detectedPayment, { subject: loaded?.subject || thread.subject });
      } else {
        setPaymentAssignOpen(true);
      }
      return;
    }
    if (d.primaryAction.type === 'reject_template') {
      applyRejectReplyDraft();
      return;
    }
    if (d.primaryAction.type === 'open_reply') {
      setConciergeApproved(false);
      return;
    }
  }

  async function generateConciergeSuggestion() {
    if (!analysis || !selectedThread) return;
    setConciergeError(null);
    setConciergeBusy(true);
    try {
      const aiReady = isAIAvailable(props.aiSettings);
      if (!aiReady) {
        setReplyDraft(analysis.reply || '');
        setConciergeError('z.AI ist nicht konfiguriert. Es wurde der Standardvorschlag verwendet.');
        return;
      }

      const generated = await generateConciergeReply({
        aiSettings: props.aiSettings,
        customerMessage: analysis.allText || '',
        threadSubject: selectedThread.subject,
        from: selectedThread.from,
        conversation: sortedConversationMessages.map((m: any) => ({
          from: m?.from,
          date: m?.date,
          body: m?.body,
        })),
        instruction: conciergeInstruction,
        previousDraft: conciergeReply,
      });
      setReplyDraft(generated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConciergeError(msg || 'Concierge-Antwort konnte nicht erzeugt werden.');
    } finally {
      setConciergeBusy(false);
    }
  }

  const gmailReplyHref = analysis?.fromEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(analysis.fromEmail)}&su=${encodeURIComponent('Re: ' + (selectedThread?.subject || ''))}&body=${encodeURIComponent(conciergeReply || '')}`
    : '';
  const aiReady = isAIAvailable(props.aiSettings);
  const selectedProductForImport = (manualProductOverride || analysis?.suggestion?.productType) as ProductType | undefined;
  const requiresConfidenceApproval = Boolean(analysis?.suggestion && analysis.suggestion.confidence < 0.6);
  const blockedByRelingRule = Boolean(analysis?.rejectionCheck?.shouldReject && !rejectRuleOverride);
  const importBlockedReason = (() => {
    if (!selectedProductForImport) return 'Kein Produkt erkannt – bitte Produkt manuell auswählen.';
    if (requiresConfidenceApproval && !lowConfidenceApproved) return 'Niedrige Konfidenz – bitte manuell bestätigen.';
    if (blockedByRelingRule) return analysis?.rejectionCheck?.reason || 'Reling/Fixpunkte-Regel blockiert den Import.';
    return '';
  })();
  const conciergeMode = getConciergeMode(conciergeInstruction);
  const selectedThreadSummary = selectedThreadId ? threads.find((t) => t.id === selectedThreadId) || null : null;
  const selectedThreadDisplay = selectedThreadSummary ? displayForThread(selectedThreadSummary) : null;
  const checklistConfig = getChecklistConfig(selectedThreadDisplay?.primaryAction.type);
  const sendChecklistDone = checklistConfig.items.length === 0
    ? true
    : checklistConfig.items.every((it) => Boolean(sendChecklist[it.key]));
  const wizardStep2Done = (() => {
    if (!selectedThreadDisplay) return Boolean(importSummary);
    if (selectedThreadDisplay.primaryAction.type === 'payment_assign') {
      return Boolean(paymentReviewedByThreadId[selectedThreadId || '']);
    }
    if (selectedThreadDisplay.primaryAction.type === 'review_import') {
      return Boolean(importSummary);
    }
    if (selectedThreadDisplay.primaryAction.type === 'reject_template') {
      return conciergeReply.trim() === relingRejectTemplate().trim() && sendChecklistDone;
    }
    return Boolean(conciergeReply.trim()) && sendChecklistDone;
  })();
  const wizardStep3Done = (() => {
    if (!selectedThreadDisplay) return Boolean((conciergeApproved && conciergeReply.trim() && sendChecklistDone) || importSummary);
    if (selectedThreadDisplay.primaryAction.type === 'payment_assign') {
      return Boolean(paymentReviewedByThreadId[selectedThreadId || '']);
    }
    if (selectedThreadDisplay.primaryAction.type === 'review_import') {
      return Boolean(importSummary);
    }
    return Boolean(conciergeApproved && conciergeReply.trim() && sendChecklistDone);
  })();
  const workflowSteps = [
    { label: '1) Thread lesen', done: Boolean(selectedThreadId) },
    { label: '2) Empfohlene Aktion', done: wizardStep2Done },
    { label: '3) Freigeben/Abschließen', done: wizardStep3Done },
  ];
  const canGoToStep2 = Boolean(selectedThreadId);
  const canGoToStep3 = wizardStep2Done;

  useEffect(() => {
    if (wizardStep === 2 && wizardStep2Done) {
      setWizardStep(3);
    }
  }, [wizardStep, wizardStep2Done]);
  const missingChecklistLabels = checklistConfig.items
    .filter((it) => !sendChecklist[it.key])
    .map((it) => it.label);
  const step2MissingReasons = (() => {
    if (!selectedThreadDisplay) return [];
    const t = selectedThreadDisplay.primaryAction.type;
    if (t === 'review_import') {
      return importSummary ? [] : ['Import noch nicht durchgeführt'];
    }
    if (t === 'payment_assign') {
      const reasons = [...missingChecklistLabels];
      if (!paymentReviewedByThreadId[selectedThreadId || '']) {
        reasons.push('Zahlung noch nicht final gespeichert/markiert');
      }
      return reasons;
    }
    if (t === 'reject_template') {
      const reasons = [...missingChecklistLabels];
      if (conciergeReply.trim() !== relingRejectTemplate().trim()) {
        reasons.push('Ablehnungstext noch nicht eingesetzt');
      }
      return reasons;
    }
    const reasons = [...missingChecklistLabels];
    if (!conciergeReply.trim()) reasons.push('Antworttext fehlt');
    return reasons;
  })();
  const step2GateMessage = wizardStep2Done
    ? 'Schritt 2 erledigt – bereit zum Versand.'
    : `Für Schritt 2 fehlt noch: ${step2MissingReasons.join(', ')}`;
  const canApproveAndOpenGmail = Boolean(gmailReplyHref && conciergeReply.trim() && wizardStep2Done);

  async function runSelectedPrimaryAction() {
    if (selectedThreadSummary) {
      const d = displayForThread(selectedThreadSummary);
      if (d.primaryAction.type === 'payment_assign') {
        const detectedPayment = analysis?.payment || extractPaymentFromThread(selectedThread);
        if (detectedPayment) {
          await openPaymentAssignPrefilled(detectedPayment, { subject: selectedThread?.subject || selectedThreadSummary.subject });
        } else {
          setPaymentAssignOpen(true);
        }
        return;
      }
      if (d.primaryAction.type === 'reject_template') {
        applyRejectReplyDraft();
        return;
      }
      if (d.primaryAction.type === 'review_import') {
        await importSelected();
        return;
      }
      if (d.primaryAction.type === 'open_reply') {
        setConciergeApproved(false);
        return;
      }
      return;
    }

    if (analysis?.payment) {
      await openPaymentAssignPrefilled(analysis.payment, { subject: selectedThread?.subject });
      return;
    }
    if (analysis?.rejectionCheck?.shouldReject) {
      applyRejectReplyDraft();
      return;
    }
    if (analysis?.suggestion?.productType) {
      await importSelected();
    }
  }

	  return (
	    <>
	    {importMapOpen && importDraft && (
	      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
	        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
	          <div className="flex items-center justify-between p-4 border-b border-slate-200">
	            <div>
	              <div className="text-sm text-slate-500">Import konfigurieren</div>
	              <div className="text-lg font-semibold text-slate-900">CRM-Übernahme prüfen</div>
	              <div className="text-xs text-slate-500 mt-1">Vor dem Import Felder prüfen und bei Bedarf korrigieren.</div>
	            </div>
	            <button
	              onClick={() => setImportMapOpen(false)}
	              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
	            >
	              Abbrechen
	            </button>
	          </div>
	          <div className="p-4 space-y-3">
	            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Kunden-E-Mail *</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={importDraft.emailFrom}
	                  onChange={(e) => setImportDraft((prev) => prev ? { ...prev, emailFrom: e.target.value } : prev)}
	                  placeholder="kunde@example.com"
	                />
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Produkt *</div>
	                <select
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
	                  value={importDraft.productType}
	                  onChange={(e) => setImportDraft((prev) => prev ? { ...prev, productType: e.target.value as ProductType } : prev)}
	                >
	                  <option value="Dachbox XL">Dachbox XL</option>
	                  <option value="Dachbox M">Dachbox M</option>
	                  <option value="Fahrradträger">Fahrradträger</option>
	                  <option value="Heckbox">Heckbox</option>
	                  <option value="Hüpfburg">Hüpfburg</option>
	                </select>
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Vorname</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={importDraft.customerNameHint?.firstName || ''}
	                  onChange={(e) =>
	                    setImportDraft((prev) =>
	                      prev
	                        ? {
	                            ...prev,
	                            customerNameHint: { ...(prev.customerNameHint || {}), firstName: e.target.value },
	                          }
	                        : prev
	                    )
	                  }
	                />
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Nachname</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={importDraft.customerNameHint?.lastName || ''}
	                  onChange={(e) =>
	                    setImportDraft((prev) =>
	                      prev
	                        ? {
	                            ...prev,
	                            customerNameHint: { ...(prev.customerNameHint || {}), lastName: e.target.value },
	                          }
	                        : prev
	                    )
	                  }
	                />
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Mietstart</div>
	                <input
	                  type="date"
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={importDraft.rentalStart ? new Date(importDraft.rentalStart).toISOString().slice(0, 10) : ''}
	                  onChange={(e) =>
	                    setImportDraft((prev) =>
	                      prev ? { ...prev, rentalStart: e.target.value ? new Date(e.target.value).getTime() : undefined } : prev
	                    )
	                  }
	                />
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Mietende</div>
	                <input
	                  type="date"
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={importDraft.rentalEnd ? new Date(importDraft.rentalEnd).toISOString().slice(0, 10) : ''}
	                  onChange={(e) =>
	                    setImportDraft((prev) =>
	                      prev ? { ...prev, rentalEnd: e.target.value ? new Date(e.target.value).getTime() : undefined } : prev
	                    )
	                  }
	                />
	              </label>
	            </div>
	            <div className="flex items-center justify-end gap-2">
	              <button
	                className="px-4 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
	                onClick={() => setImportMapOpen(false)}
	              >
	                Abbrechen
	              </button>
	              <button
	                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
	                onClick={continueImportFromMapping}
	              >
	                {pendingAttachments.length ? 'Weiter zur Anhang-Auswahl' : 'Import starten'}
	              </button>
	            </div>
	          </div>
	        </div>
	      </div>
	    )}
	    {paymentAssignOpen && (
	      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
	        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
	          <div className="flex items-center justify-between p-4 border-b border-slate-200">
	            <div>
	              <div className="text-sm text-slate-500">Zahlung zuordnen</div>
	              <div className="text-lg font-semibold text-slate-900">Anzahlung einem Vorgang zuordnen</div>
	              <div className="text-xs text-slate-500 mt-1">z.B. PayPal “Du hast eine Zahlung erhalten”</div>
	            </div>
	            <button
	              onClick={() => {
	                setPaymentAssignOpen(false);
	                setPaymentFeedback(null);
	              }}
	              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
	              disabled={paymentBusy}
	            >
	              Schließen
	            </button>
	          </div>

	          <div className="p-4 space-y-3">
	            {paymentFeedback && (
	              <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
	                {paymentFeedback}
	              </div>
	            )}
	            {!paymentFeedback && paymentSuggestedRentalId && (
	              <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3">
	                Vorschlag: Vorgang <span>{formatDisplayRef(paymentSuggestedRentalId)}</span> wurde vorausgewählt (1:1 Match über Zahler-Name).
	              </div>
	            )}

	            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Art</div>
	                <select
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
	                  value={paymentKind}
	                  onChange={(e) => setPaymentKind(e.target.value as any)}
	                  disabled={paymentBusy}
	                >
	                  <option value="Anzahlung">Anzahlung</option>
	                  <option value="Zahlung">Zahlung</option>
	                  <option value="Kaution">Kaution</option>
	                </select>
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Methode</div>
	                <select
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
	                  value={paymentMethod}
	                  onChange={(e) => setPaymentMethod(e.target.value as any)}
	                  disabled={paymentBusy}
	                >
	                  <option value="PayPal">PayPal</option>
	                  <option value="Ueberweisung">Überweisung</option>
	                  <option value="Bar">Bar</option>
	                  <option value="Karte">Karte</option>
	                  <option value="Sonstiges">Sonstiges</option>
	                </select>
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Betrag</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  type="number"
	                  step="0.01"
	                  value={paymentAmount || ''}
	                  onChange={(e) => {
                      const nextAmount = Number(e.target.value || 0);
                      setPaymentAmount(nextAmount);
                      setSendChecklist((prev) => ({ ...prev, amount: nextAmount > 0, paymentMarked: false }));
                    }}
	                  disabled={paymentBusy}
	                  aria-label="Zahlungsbetrag"
	                />
	              </label>
	              <label className="text-sm">
	                <div className="text-xs font-medium text-slate-700 mb-1">Waehrung</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={paymentCurrency}
	                  onChange={(e) => setPaymentCurrency(e.target.value)}
	                  disabled={paymentBusy}
	                  aria-label="Waehrung"
	                />
	              </label>
	              <label className="text-sm sm:col-span-2">
	                <div className="text-xs font-medium text-slate-700 mb-1">Zahler (Name)</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={paymentPayerName}
	                  onChange={(e) => setPaymentPayerName(e.target.value)}
	                  disabled={paymentBusy}
	                  placeholder="z.B. Tina Marczinkowsky"
	                />
	              </label>
	              <label className="text-sm sm:col-span-2">
	                <div className="text-xs font-medium text-slate-700 mb-1">Provider Referenz (optional)</div>
	                <input
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  value={paymentProviderTx}
	                  onChange={(e) => setPaymentProviderTx(e.target.value)}
	                  disabled={paymentBusy}
	                  placeholder="Transaktions-ID"
	                />
	              </label>
	            </div>

	            <div className="rounded-lg border border-slate-200 p-3">
	              <div className="flex items-center justify-between gap-2">
	                <div className="text-sm font-medium text-slate-900">Vorgang wählen</div>
	                <button
	                  className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
	                  onClick={async () => {
	                    setPaymentBusy(true);
	                    try {
	                      const [allRentals, allInvoices] = await Promise.all([getAllRentalRequests(), getAllInvoices()]);
	                      setPaymentRentals(allRentals);
                        const invoicesByRental = allInvoices.reduce<Record<string, Invoice[]>>((acc, inv) => {
                          const rentalId = String(inv.rentalRequestId || '').trim();
                          if (!rentalId) return acc;
                          if (!acc[rentalId]) acc[rentalId] = [];
                          acc[rentalId].push(inv);
                          return acc;
                        }, {});
                        setPaymentInvoicesByRentalId(invoicesByRental);
	                    } catch (e) {
	                      alert('Konnte Vorgänge nicht laden: ' + (e instanceof Error ? e.message : String(e)));
	                    } finally {
	                      setPaymentBusy(false);
	                    }
	                  }}
	                  disabled={paymentBusy}
	                  title="Vorgänge neu laden"
	                >
	                  Liste aktualisieren
	                </button>
	              </div>

	              <div className="mt-2 flex items-center gap-2">
	                <input
	                  className="flex-1 px-3 py-2 rounded-md border border-slate-200 text-sm"
	                  placeholder="Suchen (Kunde, Produkt, Zeitraum, Referenz)…"
	                  value={paymentSearch}
	                  onChange={(e) => setPaymentSearch(e.target.value)}
	                  disabled={paymentBusy}
	                />
	                <button
	                  className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
	                  onClick={() => setPaymentSearch('')}
	                  disabled={!paymentSearch || paymentBusy}
	                >
	                  Reset
	                </button>
	              </div>

	              <div className="mt-2">
	                <select
	                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
	                  value={paymentRentalId}
	                  onChange={(e) => {
                      const nextRentalId = e.target.value;
                      setPaymentRentalId(nextRentalId);
                      const suggestion = pickSuggestedInvoiceForPayment(paymentInvoicesByRentalId[nextRentalId] || []);
                      setPaymentSuggestedInvoiceId(suggestion?.id || '');
                      setPaymentInvoiceId(suggestion?.id || '');
                      setSendChecklist((prev) => ({ ...prev, mapping: Boolean(nextRentalId), paymentMarked: false }));
                    }}
	                  disabled={paymentBusy}
	                  aria-label="Vorgang auswählen"
	                >
	                  <option value="">Bitte Vorgang wählen…</option>
	                  {(paymentRentals || []).filter((r) => {
	                    const q = paymentSearch.trim().toLowerCase();
	                    if (!q) return true;
	                    const cust = props.customers.find((c) => c.id === r.customerId);
	                    const custLabel = cust ? `${cust.firstName || ''} ${cust.lastName || ''} ${cust.email || ''}` : '';
	                    const period = `${new Date(r.rentalStart).toLocaleDateString('de-DE')}–${new Date(r.rentalEnd).toLocaleDateString('de-DE')}`;
	                    const hay = `${r.id} ${r.productType} ${r.status} ${period} ${custLabel}`.toLowerCase();
	                    return hay.includes(q);
	                  }).slice(0, 200).map((r) => {
	                    const cust = props.customers.find((c) => c.id === r.customerId);
	                    const custName = cust ? `${cust.firstName || ''} ${cust.lastName || ''}`.trim() : 'Unbekannter Kunde';
	                    const period = `${new Date(r.rentalStart).toLocaleDateString('de-DE')}–${new Date(r.rentalEnd).toLocaleDateString('de-DE')}`;
	                    return (
	                      <option key={r.id} value={r.id}>
	                        {formatDisplayRef(r.id)} | {custName} | {r.productType} | {period} | {r.status}
	                      </option>
	                    );
	                  })}
	                </select>
	                <div className="mt-1 text-xs text-slate-500">
	                  Tipp: Suche nach Name oder Zeitraum. Standardmaessig werden bis zu 200 Treffer angezeigt.
	                </div>
	              </div>
	            </div>

              <div className="rounded-lg border border-slate-200 p-3 mt-3">
                <div className="text-sm font-medium text-slate-900">Rechnung/Auftrag zuordnen (optional)</div>
                <div className="mt-2">
                  <select
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm disabled:bg-slate-50"
                    value={paymentInvoiceId}
                    onChange={(e) => setPaymentInvoiceId(e.target.value)}
                    disabled={paymentBusy || !paymentRentalId}
                    aria-label="Rechnung oder Auftrag auswählen"
                  >
                    <option value="">
                      {paymentRentalId ? 'Ohne Belegzuordnung speichern' : 'Zuerst Vorgang wählen…'}
                    </option>
                    {paymentInvoicesForSelectedRental.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNo} | {inv.invoiceType} | {inv.state} | {new Date(inv.invoiceDate).toLocaleDateString('de-DE')}
                      </option>
                    ))}
                  </select>
                  {paymentSuggestedInvoiceId && paymentInvoiceId === paymentSuggestedInvoiceId && (
                    <div className="mt-1 text-xs text-emerald-700">
                      Vorschlag aktiv: passender Beleg wurde automatisch vorausgewählt.
                    </div>
                  )}
                  {paymentRentalId && paymentInvoicesForSelectedRental.length === 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      Für diesen Vorgang existiert noch kein Beleg.
                    </div>
                  )}
                </div>
              </div>

	            <label className="text-sm">
	              <div className="text-xs font-medium text-slate-700 mb-1">Notiz (optional)</div>
	              <textarea
	                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
	                rows={3}
	                value={paymentNote}
	                onChange={(e) => setPaymentNote(e.target.value)}
	                disabled={paymentBusy}
                placeholder="z.B. PayPal-Eingang aus Postfach"
	              />
	            </label>

	            <div className="flex items-center justify-end gap-2">
	              <button
	                className="px-4 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
	                onClick={() => setPaymentAssignOpen(false)}
	                disabled={paymentBusy}
	              >
	                Abbrechen
	              </button>
	              <button
	                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
	                onClick={async () => {
	                  if (!paymentRentalId) {
	                    alert('Bitte zuerst einen Vorgang auswählen.');
	                    return;
	                  }
	                  if (!paymentAmount || paymentAmount <= 0) {
	                    alert('Bitte einen gueltigen Betrag eingeben.');
	                    return;
	                  }
	                  setPaymentBusy(true);
	                  try {
	                    const rentals = paymentRentals || await getAllRentalRequests();
	                    const rental = rentals.find((r) => r.id === paymentRentalId);
                      const selectedInvoice = paymentInvoicesForSelectedRental.find((inv) => inv.id === paymentInvoiceId);
	                    const id = `pay_${Date.now()}`;
	                    await addPayment({
	                      id,
	                      rentalRequestId: paymentRentalId,
                        invoiceId: paymentInvoiceId || undefined,
	                      customerId: rental?.customerId,
	                      kind: paymentKind,
	                      method: paymentMethod,
	                      amount: Number(paymentAmount),
	                      currency: (paymentCurrency || 'EUR').trim() || 'EUR',
	                      receivedAt: paymentReceivedAt || Date.now(),
	                      note: paymentNote?.trim() || undefined,
	                      source: 'gmail',
	                      gmailThreadId: selectedThreadId || undefined,
	                      payerName: paymentPayerName?.trim() || undefined,
	                      providerTransactionId: paymentProviderTx?.trim() || undefined,
	                      createdAt: Date.now(),
	                    });
                      if (selectedThreadId) {
                        setPaymentAssignmentByThreadId((prev) => ({
                          ...prev,
                          [selectedThreadId]: {
                            amount: Number(paymentAmount),
                            currency: (paymentCurrency || 'EUR').trim() || 'EUR',
                            invoiceId: paymentInvoiceId || undefined,
                            invoiceNo: selectedInvoice?.invoiceNo,
                            receivedAt: paymentReceivedAt || Date.now(),
                          },
                        }));
                      }
	                    setPaymentFeedback(
                        `Zahlung gespeichert und Vorgang ${formatDisplayRef(paymentRentalId)} zugeordnet.` +
                        (selectedInvoice ? ` Beleg: ${selectedInvoice.invoiceNo}.` : '')
                      );
                      markPaymentReviewed(selectedThreadId, true);
                      setSendChecklist((prev) => ({
                        ...prev,
                        amount: Number(paymentAmount) > 0,
                        mapping: Boolean(paymentRentalId),
                        paymentMarked: true,
                      }));
	                  } catch (e) {
	                    alert('Konnte Zahlung nicht speichern: ' + (e instanceof Error ? e.message : String(e)));
	                  } finally {
	                    setPaymentBusy(false);
	                  }
	                }}
	                disabled={paymentBusy}
	              >
	                Zuordnen
	              </button>
	            </div>
	          </div>
	        </div>
	      </div>
	    )}
	    {reviewOpen && (
	      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
	        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div>
              <div className="text-sm text-slate-500">Anhänge übernehmen</div>
              <div className="text-lg font-semibold text-slate-900">Import-Review</div>
              <div className="text-xs text-slate-500 mt-1">
                PDF: als Dokument | Bild: als Reling-Foto oder überspringen
              </div>
            </div>
            <button
              onClick={() => setReviewOpen(false)}
              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
              disabled={reviewBusy}
            >
              Abbrechen
            </button>
          </div>

          <div className="p-4">
            <div className="space-y-2 max-h-[55vh] overflow-auto">
              {reviewAttachments.map((a, idx) => {
                const mt = String(a.mimeType || '').toLowerCase();
                const label = a.filename || a.attachmentId;
                const size = typeof a.sizeBytes === 'number' ? `${Math.round(a.sizeBytes / 1024)} KB` : '';
                return (
                  <div key={`${a.messageId}:${a.attachmentId}:${idx}`} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{label}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {mt || 'unbekannt'}{size ? ` | ${size}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <select
                        className="text-sm px-3 py-2 border border-slate-200 rounded-md bg-white"
                        value={a.importAs || 'skip'}
                        disabled={reviewBusy}
                        onChange={(e) => {
                          const v = e.target.value as any;
                          setReviewAttachments((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, importAs: v } : x))
                          );
                        }}
                      >
                        <option value="skip">Überspringen</option>
                        <option value="document">Als Dokument (PDF)</option>
                        <option value="roof_photo">Als Reling-Foto (Bild)</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                onClick={() => setReviewOpen(false)}
                disabled={reviewBusy}
              >
                Schließen
              </button>
              <button
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={async () => {
                  setReviewBusy(true);
                  try {
                    setReviewOpen(false);
                    await doImport(reviewAttachments);
                  } finally {
                    setReviewBusy(false);
                    setReviewAttachments([]);
                  }
                }}
                disabled={reviewBusy}
              >
                Import starten
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Postfach</h3>
            <p className="text-xs text-slate-500">Kunden-Konversationen, gefiltert und priorisiert.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => {
                const ok = confirm('Postfach-Cache lokal löschen?');
                if (!ok) return;
                void deleteKey(CACHE_KEY);
                setThreads([]);
                setNextPageToken(undefined);
                setSelectedThreadId(null);
                setSelectedThread(null);
                setThreadDetailsById({});
              }}
              disabled={loading}
              title="Löscht die lokal gespeicherten Postfach-Daten"
            >
              Cache leeren
            </button>
            <button
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
              onClick={() => loadInbox(false)}
              disabled={!canUse || loading}
            >
              Aktualisieren
            </button>
            <button
              className={[
                'px-3 py-2 rounded-md border text-sm',
                autoRefreshEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              ].join(' ')}
              onClick={() => persistAutoRefresh(!autoRefreshEnabled)}
              disabled={!canUse}
              title="Lädt das Postfach automatisch alle 30 Sekunden im Hintergrund nach"
            >
              Auto-Refresh {autoRefreshEnabled ? 'AN' : 'AUS'}
            </button>
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? 'Filter ausblenden' : 'Filter einblenden'}
            </button>
          </div>
        </div>

        {!canUse && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            Google OAuth Client ID fehlt. Bitte in Einstellungen setzen und Verbindung testen.
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {importFeedback && (
          <div className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800">Import-Feedback</div>
            <div className="mt-1">{importFeedback}</div>
          </div>
        )}

        {importSummary && (
          <div className="mt-3 text-sm text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3" role="status" aria-live="polite">
            <div className="font-semibold text-emerald-900">Import-Ergebnis</div>
            <div className="mt-1 grid gap-1">
              <div>
                Kunde: <strong>{importSummary.customerCreated ? 'neu angelegt' : 'bestehend aktualisiert/zugeordnet'}</strong>
              </div>
              <div>
                Vorgang: <strong>{importSummary.rentalAction === 'created' ? 'neu angelegt' : 'vorhanden aktualisiert/zugeordnet'}</strong>
                {importSummary.rentalId ? (
                  <span className="ml-2 text-xs text-slate-500">(Ref: {formatDisplayRef(importSummary.rentalId)})</span>
                ) : null}
              </div>
              {importSummary.usedFallbackDates ? (
                <div className="text-amber-800">
                  Zeitraum konnte nicht eindeutig erkannt werden. Standard-Zeitraum wurde vorbelegt.
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-md border border-slate-200 text-sm"
              placeholder="Suchen (Name, E-Mail, Betreff, Text)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Threads suchen"
            />
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => setSearch('')}
              disabled={!search}
              title="Suche leeren"
            >
              Reset
            </button>
          </div>
          {showFilters && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
              <button
                type="button"
                className={['px-2 py-1 text-xs', priorityFilter === 'focus' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
                onClick={() => persistPriorityFilter('focus')}
                title="Zeigt nur Sofort + Prüfen"
              >
                Fokus
              </button>
              <button
                type="button"
                className={['px-2 py-1 text-xs border-l border-slate-200', priorityFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
                onClick={() => persistPriorityFilter('all')}
                title="Zeigt alle Threads"
              >
                Alle
              </button>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prioritizeNeedsReply}
                onChange={(e) => setPrioritizeNeedsReply(e.target.checked)}
              />
              Kunde zuletzt zuerst
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyNeedsReply}
                onChange={(e) => setOnlyNeedsReply(e.target.checked)}
              />
              nur Antwort nötig
            </label>
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              <span className="text-[11px] text-slate-500">Quick-Actions</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={quickActionPrefs.unavailable}
                  onChange={(e) => persistQuickActionPref('unavailable', e.target.checked)}
                />
                Nicht verfügbar
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={quickActionPrefs.payment}
                  onChange={(e) => persistQuickActionPref('payment', e.target.checked)}
                />
                Zahlung
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={quickActionPrefs.processed}
                  onChange={(e) => persistQuickActionPref('processed', e.target.checked)}
                />
                Verarbeitet
              </label>
            </div>
          </div>
          )}
        </div>

        <div className="mt-3 space-y-2 max-h-[60vh] overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter((v) => (v === 'sofort' ? 'all' : 'sofort'))}
              className={[
                'rounded-md border p-2 text-left',
                statusFilter === 'sofort' ? 'border-rose-400 bg-rose-100' : 'border-rose-200 bg-rose-50'
              ].join(' ')}
            >
              <div className="text-[11px] text-rose-700">Sofort</div>
              <div className="text-sm font-semibold text-rose-900">{inboxStats.urgent}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((v) => (v === 'all' ? 'antwort' : 'all'))}
              className={[
                'rounded-md border p-2 text-left',
                statusFilter === 'all' ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-slate-50'
              ].join(' ')}
            >
              <div className="text-[11px] text-slate-500">Threads</div>
              <div className="text-sm font-semibold text-slate-900">{inboxStats.total}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((v) => (v === 'antwort' ? 'all' : 'antwort'))}
              className={[
                'rounded-md border p-2 text-left',
                statusFilter === 'antwort' ? 'border-amber-400 bg-amber-100' : 'border-amber-200 bg-amber-50'
              ].join(' ')}
            >
              <div className="text-[11px] text-amber-700">Antwort nötig</div>
              <div className="text-sm font-semibold text-amber-900">{inboxStats.needsReply}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((v) => (v === 'zahlung' ? 'all' : 'zahlung'))}
              className={[
                'rounded-md border p-2 text-left',
                statusFilter === 'zahlung' ? 'border-emerald-400 bg-emerald-100' : 'border-emerald-200 bg-emerald-50'
              ].join(' ')}
            >
              <div className="text-[11px] text-emerald-700">Zahlungs-Mails</div>
              <div className="text-sm font-semibold text-emerald-900">{inboxStats.paymentHints}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((v) => (v === 'low_conf' ? 'all' : 'low_conf'))}
              className={[
                'rounded-md border p-2 text-left',
                statusFilter === 'low_conf' ? 'border-rose-400 bg-rose-100' : 'border-rose-200 bg-rose-50'
              ].join(' ')}
            >
              <div className="text-[11px] text-rose-700">Niedrige Konfidenz</div>
              <div className="text-sm font-semibold text-rose-900">{inboxStats.lowConfidence}</div>
            </button>
          </div>

          {threadsForList.map((t) => (
            <div
              key={t.id}
              className={[
                'w-full text-left p-3 rounded-lg border transition',
                selectedThreadId === t.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
              onClick={() => openThread(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void openThread(t.id);
                }
              }}
            >
              {(() => {
                const d = displayForThread(t);
                const lastDate = (t as any).lastDate || t.date;
                const dateStr = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
                const timeStr = lastDate ? new Date(lastDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                const period =
                  d.rentalStart && d.rentalEnd
                    ? `${new Date(d.rentalStart).toLocaleDateString('de-DE')}–${new Date(d.rentalEnd).toLocaleDateString('de-DE')}`
                    : null;
                const paymentAssignment = paymentAssignmentByThreadId[t.id];

                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                          {(t as any).isUnread ? <span className="w-2 h-2 rounded-full bg-blue-600" title="Ungelesen" /> : null}
                          <span className="truncate">{d.name || d.email || 'Unbekannter Absender'}</span>
                        </div>
                        <div className="text-xs text-slate-600 truncate">
                          {t.subject || '(kein Betreff)'}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0 text-right">
                        <div>{dateStr}</div>
                        <div>{timeStr}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                      <span
                        className={[
                          'text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1',
                          d.priority.badgeClass,
                        ].join(' ')}
                        title={d.priority.reason}
                      >
                        <span className={['inline-block w-1.5 h-1.5 rounded-full', d.priority.dotClass].join(' ')} />
                        {d.priority.label}
                      </span>
                      <span
                        className={[
                          'text-[11px] px-2 py-0.5 rounded-full border',
                          d.lastIsUs ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-800',
                        ].join(' ')}
                      >
                        {d.who}
                      </span>
                      {d.product && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 border-slate-200 text-slate-700">
                          {d.product}
                        </span>
                      )}
                      {typeof d.confidence === 'number' && (
                        <span
                          className={[
                            'text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1',
                            getConfidenceAmpel(d.confidence).badgeClass,
                          ].join(' ')}
                          title={`Erkennungssicherheit: ${Math.round(d.confidence * 100)}%`}
                        >
                          <span className={['inline-block w-1.5 h-1.5 rounded-full', getConfidenceAmpel(d.confidence).dotClass].join(' ')} />
                          {Math.round(d.confidence * 100)}%
                        </span>
                      )}
                      {d.paymentHint && (
                        <span
                          className={[
                            'text-[11px] px-2 py-0.5 rounded-full border',
                            d.paymentReviewed
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-amber-50 border-amber-200 text-amber-700',
                          ].join(' ')}
                        >
                          {d.paymentReviewed ? 'Zahlung geprüft' : 'Zahlung offen'}
                        </span>
                      )}
                      {paymentAssignment?.invoiceNo && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                          Zugeordnet: {paymentAssignment.invoiceNo}
                        </span>
                      )}
                      {period && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 border-slate-200 text-slate-700">
                          {period}
                        </span>
                      )}
                      {(t as any).messageCount ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 border-slate-200 text-slate-500">
                          {(t as any).messageCount} Msg
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-slate-700 mt-2 line-clamp-2">{t.snippet}</div>
                    {paymentAssignment ? (
                      <div className="mt-1 text-[11px] text-emerald-800">
                        Zahlung: {paymentAssignment.amount.toFixed(2)} {paymentAssignment.currency}
                        {paymentAssignment.invoiceNo ? ` • Beleg ${paymentAssignment.invoiceNo}` : ''}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-500">Nächste Aktion:</span>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-slate-900 text-white text-xs hover:bg-slate-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          void runPrimaryAction(t);
                        }}
                        title={d.primaryAction.helper}
                      >
                        Empfohlen: {d.primaryAction.label}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openThread(t.id);
                        }}
                      >
                        Öffnen
                      </button>
                      <details className="relative">
                        <summary className="list-none px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-100 cursor-pointer">
                          Mehr
                        </summary>
                        <div className="absolute right-0 mt-1 w-52 rounded-md border border-slate-200 bg-white shadow p-1 z-10">
                          {quickActionPrefs.unavailable ? (
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-slate-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                const p = d.product || 'Dachbox XL';
                                setShortcutUnavailableProduct(p);
                                applyUnavailableReplyDraft(p);
                                void openThread(t.id);
                              }}
                            >
                              Nicht verfügbar
                            </button>
                          ) : null}
                          {quickActionPrefs.payment && d.paymentHint ? (
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-slate-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                markPaymentReviewed(t.id, !d.paymentReviewed);
                              }}
                            >
                              {d.paymentReviewed ? 'Zahlung geprüft' : 'Zahlung prüfen'}
                            </button>
                          ) : null}
                          {quickActionPrefs.processed ? (
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-slate-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                void markThreadProcessed(t.id);
                              }}
                            >
                              Verarbeitet
                            </button>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </>
                );
              })()}
            </div>
          ))}
          {nextPageToken && (
            <button
              className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => loadInbox(true)}
              disabled={loading}
            >
              Mehr laden
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Postfach-Detail</h3>
            <p className="text-xs text-slate-500">Schritt 1: Lesen · Schritt 2: Übernehmen · Schritt 3: Antwort freigeben</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 flex items-center gap-2">
              <input
                type="checkbox"
                checked={archiveAfterImport}
                onChange={(e) => persistArchiveSetting(e.target.checked)}
              />
              Nach Import archivieren
            </label>
            <button
              className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={markSelectedProcessed}
              disabled={!selectedThreadId || loading}
              title="Konversation als verarbeitet markieren (Label setzen, optional aus INBOX entfernen)"
            >
              Verarbeitet
            </button>
            <button
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
              onClick={importSelected}
              disabled={!selectedProductForImport || loading || (requiresConfidenceApproval && !lowConfidenceApproved) || blockedByRelingRule}
            >
              In CRM übernehmen
            </button>
          </div>
        </div>
        {requiresConfidenceApproval && (
          <div className="mt-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md p-2 flex items-center gap-2">
            <input
              id="import-low-confidence-approved"
              type="checkbox"
              checked={lowConfidenceApproved}
              onChange={(e) => setLowConfidenceApproved(e.target.checked)}
            />
            <label htmlFor="import-low-confidence-approved">
              Niedrige Konfidenz erkannt ({Math.round((analysis?.suggestion?.confidence || 0) * 100)}%). Ich habe Produkt und Zeitraum manuell geprüft.
            </label>
          </div>
        )}
        {analysis?.rejectionCheck?.shouldReject && (
          <div className="mt-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md p-2 flex items-center gap-2">
            <input
              id="reject-rule-override"
              type="checkbox"
              checked={rejectRuleOverride}
              onChange={(e) => setRejectRuleOverride(e.target.checked)}
            />
            <label htmlFor="reject-rule-override">
              Anfrage erkennt „ohne Reling/Fixpunkte“. Standard ist Ablehnung im Posteingang. Nur für Ausnahmefall trotzdem übernehmen.
            </label>
          </div>
        )}
        {!!importBlockedReason && (
          <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
            <strong>Warum gesperrt?</strong> {importBlockedReason}
            {!selectedProductForImport && (
              <div className="mt-2">
                <label className="text-[11px] font-medium text-amber-900">Produkt manuell auswählen</label>
                <select
                  className="mt-1 w-full px-2 py-1.5 rounded-md border border-amber-200 bg-white text-xs"
                  value={manualProductOverride}
                  onChange={(e) => setManualProductOverride(e.target.value as ProductType)}
                >
                  <option value="">Bitte auswählen…</option>
                  <option value="Dachbox XL">Dachbox XL</option>
                  <option value="Dachbox M">Dachbox M</option>
                  <option value="Fahrradträger">Fahrradträger</option>
                  <option value="Heckbox">Heckbox</option>
                  <option value="Hüpfburg">Hüpfburg</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-700 flex flex-wrap gap-1">
              {workflowSteps.map((s) => (
              <span
                  key={s.label}
                  className={[
                    'px-2 py-1 rounded-full border',
                    s.done ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600',
                  ].join(' ')}
                >
                  {s.label}
                </span>
              ))}
            </div>
            <span
              className={[
                'text-[11px] px-2 py-1 rounded-full border',
                aiReady ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800',
              ].join(' ')}
              title={aiReady ? 'z.AI ist aktiv' : 'z.AI fehlt (Provider/API-Key in Einstellungen setzen)'}
              >
              AI: {aiReady ? 'bereit' : 'nicht eingerichtet'}
              </span>
              {!aiReady && props.onOpenSettings ? (
                <button
                  type="button"
                  onClick={props.onOpenSettings}
                  className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                >
                  Jetzt konfigurieren
                </button>
              ) : null}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${wizardStep === 1 ? 33 : wizardStep === 2 ? 66 : 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              Aktueller Schritt: <strong>{wizardStep}/3</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60"
                onClick={() => setWizardStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))}
                disabled={wizardStep <= 1}
              >
                Zurück
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  if (wizardStep === 1 && canGoToStep2) setWizardStep(2);
                  if (wizardStep === 2 && canGoToStep3) setWizardStep(3);
                }}
                disabled={(wizardStep === 1 && !canGoToStep2) || (wizardStep === 2 && !canGoToStep3) || wizardStep >= 3}
              >
                Weiter
              </button>
            </div>
          </div>
        </div>

        {selectedThreadDisplay && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-indigo-900">Empfohlener Ablauf</div>
                <div className="text-xs text-indigo-800 mt-0.5">{selectedThreadDisplay.primaryAction.helper}</div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {[
                    { label: '1) Thread prüfen', done: Boolean(selectedThreadId) },
                    { label: '2) Empfohlene Aktion', done: wizardStep2Done },
                    { label: '3) Freigeben/Abschließen', done: wizardStep3Done },
                  ].map((s) => (
                    <span
                      key={s.label}
                      className={[
                        'px-2 py-1 rounded-full border',
                        s.done ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-indigo-200 text-indigo-700',
                      ].join(' ')}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-indigo-700 text-white text-sm hover:bg-indigo-800 disabled:opacity-60"
                onClick={runSelectedPrimaryAction}
                disabled={!selectedThreadId || loading || wizardStep < 2}
                title={selectedThreadDisplay.primaryAction.helper}
              >
                Empfohlen: {selectedThreadDisplay.primaryAction.label}
              </button>
            </div>
            <details className="mt-3 rounded-md border border-indigo-200 bg-white p-2">
              <summary className="cursor-pointer text-xs font-medium text-indigo-900 select-none">
                {checklistConfig.title} (Pflicht)
              </summary>
              <div className="mt-2 grid gap-1.5 text-xs text-indigo-900">
                {checklistConfig.items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(sendChecklist[item.key])}
                      onChange={(e) => {
                        setSendChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }));
                        setConciergeApproved(false);
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </details>
            <div
              className={[
                'mt-3 text-xs rounded-md border px-3 py-2',
                wizardStep2Done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900',
              ].join(' ')}
            >
              {step2GateMessage}
            </div>
          </div>
        )}

        {!selectedThread && (
          <div className="mt-4 text-sm text-slate-600">Wähle links einen Thread.</div>
        )}

	        {selectedThread && (
	          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <div><strong>Von:</strong> {selectedThread.from || '-'}</div>
              <div><strong>Betreff:</strong> {selectedThread.subject || '-'}</div>
              <div><strong>Datum:</strong> {selectedThread.date || '-'}</div>
            </div>

	            {analysis && (
	              <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                <div><strong>Erkanntes Produkt:</strong> {selectedProductForImport || '-'}</div>
                {analysis.suggestion ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>Konfidenz:</strong>
                    <span
                      className={[
                        'text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1',
                        getConfidenceAmpel(analysis.suggestion.confidence).badgeClass,
                      ].join(' ')}
                    >
                      <span className={['inline-block w-2 h-2 rounded-full', getConfidenceAmpel(analysis.suggestion.confidence).dotClass].join(' ')} />
                      {Math.round(analysis.suggestion.confidence * 100)}% ({getConfidenceAmpel(analysis.suggestion.confidence).level})
                    </span>
                    {analysis.suggestion.reason ? (
                      <span className="text-xs text-slate-500">{analysis.suggestion.reason}</span>
                    ) : null}
                  </div>
                ) : (
                  <div><strong>Konfidenz:</strong> -</div>
                )}
                <div><strong>Zeitraum:</strong> {analysis.rental.rentalStart ? new Date(analysis.rental.rentalStart).toLocaleDateString('de-DE') : '-'}{' '}
                  bis {analysis.rental.rentalEnd ? new Date(analysis.rental.rentalEnd).toLocaleDateString('de-DE') : '-'}</div>
                <div><strong>Kunden-E-Mail:</strong> {analysis.fromEmail || analysis.customer.email || '-'}</div>
                {analysis.rejectionCheck?.shouldReject && (
                  <div className="text-rose-800">
                    <strong>Ablehnung empfohlen:</strong> {analysis.rejectionCheck.reason}
                  </div>
                )}
                {analysis.customer.firstName && analysis.customer.lastName && (
                  <div><strong>Kunde (erkannt):</strong> {analysis.customer.firstName} {analysis.customer.lastName}</div>
                )}
                {analysis.customer.address?.street && (
                  <div>
                    <strong>Adresse (erkannt):</strong>{' '}
                    {[
                      analysis.customer.address.street,
                      [analysis.customer.address.zipCode, analysis.customer.address.city].filter(Boolean).join(' '),
                      analysis.customer.address.country,
                    ].filter(Boolean).join(', ')}
                  </div>
                )}
	              </div>
	            )}

	            {analysis?.payment && (
	              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
	                <div className="flex items-start justify-between gap-3">
	                  <div className="min-w-0">
	                    <div className="font-semibold text-emerald-900">PayPal Zahlung erkannt</div>
	                    <div className="text-emerald-900">
	                      <strong>Betrag:</strong> {analysis.payment.amount.toFixed(2)} {analysis.payment.currency}
	                    </div>
	                    {analysis.payment.payerName && (
	                      <div className="text-emerald-900">
	                        <strong>Zahler:</strong> {analysis.payment.payerName}
	                      </div>
	                    )}
	                    {analysis.payment.providerTransactionId && (
	                      <div className="text-emerald-900">
	                        <strong>Referenz:</strong> {analysis.payment.providerTransactionId}
	                      </div>
	                    )}
	                  </div>
	                  <button
	                    className="shrink-0 px-3 py-2 rounded-md bg-emerald-700 text-white text-sm hover:bg-emerald-800"
	                    onClick={async () => {
                        if (!analysis?.payment) return;
	                        await openPaymentAssignPrefilled(analysis.payment, { subject: selectedThread.subject });
	                    }}
	                  >
	                    Anzahlung zuordnen
	                  </button>
	                </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      className={[
                        'px-2 py-1 rounded border text-xs',
                        selectedThreadId && paymentReviewedByThreadId[selectedThreadId]
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : 'border-amber-300 bg-amber-100 text-amber-800',
                      ].join(' ')}
                      onClick={() => markPaymentReviewed(selectedThreadId, !(selectedThreadId && paymentReviewedByThreadId[selectedThreadId]))}
                    >
                      {selectedThreadId && paymentReviewedByThreadId[selectedThreadId] ? 'Zuordnung geprüft' : 'Als geprüft markieren'}
                    </button>
                  </div>
	                <div className="mt-2 text-xs text-emerald-900/80">
	                  Standard: manuell zuordnen. Auto-Vorschlag passiert nur bei einem eindeutigen 1:1 Match (Name passt und es gibt genau einen offenen Vorgang).
	                </div>
	              </div>
	            )}

            {analysis?.fromEmail && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">Shortcut: Nicht verfügbar</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Erstellt eine Pauschalantwort mit ausgewähltem Mietgerät und setzt sie in das Antwortfeld.
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
                        value={shortcutUnavailableProduct}
                        onChange={(e) => setShortcutUnavailableProduct(e.target.value as ProductType)}
                      >
                        <option value="Dachbox XL">Dachbox XL</option>
                        <option value="Dachbox M">Dachbox M</option>
                        <option value="Fahrradträger">Fahrradträger</option>
                        <option value="Heckbox">Heckbox</option>
                        <option value="Hüpfburg">Hüpfburg</option>
                      </select>
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={() => {
                          applyUnavailableReplyDraft(shortcutUnavailableProduct);
                        }}
                      >
                        Antwort einsetzen
                      </button>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">Quick-Actions</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={() => {
                          applyRejectReplyDraft();
                        }}
                      >
                        Ablehnungstext (Reling/Fixpunkte)
                      </button>
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={async () => {
                          const payment = analysis?.payment || extractPaymentFromThread(selectedThread);
                          if (payment) {
                            await openPaymentAssignPrefilled(payment, { subject: selectedThread?.subject });
                            return;
                          }
                          setPaymentAssignOpen(true);
                        }}
                      >
                        Als Zahlung markieren
                      </button>
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={markSelectedProcessed}
                      >
                        Nur als Nachricht markieren
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Concierge-Antwort</div>
                      <div className="text-xs text-slate-500">
                        Separates Antwortfeld zum Bearbeiten, Kopieren und Senden.
                      </div>
                    </div>
                    <button
                      className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                      onClick={generateConciergeSuggestion}
                      disabled={conciergeBusy || !aiReady}
                    >
                      {conciergeBusy ? 'Generiere…' : 'Antwort generieren'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={[
                        'px-2 py-1 rounded border text-xs hover:bg-slate-50',
                        conciergeMode === 'auto' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200',
                      ].join(' ')}
                      onClick={() => setConciergeInstruction('')}
                      aria-pressed={conciergeMode === 'auto'}
                    >
                      Modus: Auto
                    </button>
                    <button
                      className={[
                        'px-2 py-1 rounded border text-xs hover:bg-slate-50',
                        conciergeMode === 'send_ready' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200',
                      ].join(' ')}
                      onClick={() => setConciergeInstruction('/Concierge weiter')}
                      aria-pressed={conciergeMode === 'send_ready'}
                    >
                      Modus: Sendefertig
                    </button>
                    <button
                      className={[
                        'px-2 py-1 rounded border text-xs hover:bg-slate-50',
                        conciergeMode === 'rework' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200',
                      ].join(' ')}
                      onClick={() => setConciergeInstruction('von mir Ton freundlicher und kuerzer')}
                      aria-pressed={conciergeMode === 'rework'}
                    >
                      Modus: Überarbeiten
                    </button>
                    {!aiReady && (
                      <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        AI nicht aktiv: Einstellungen → Provider `zai` + API-Key
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 -mt-1">
                    {conciergeMode === 'auto' && 'Auto: interne Analyse für Daniel'}
                    {conciergeMode === 'send_ready' && 'Sendefertig: direkt kundenfähige Antwort'}
                    {conciergeMode === 'rework' && 'Überarbeiten: vorhandenen Entwurf gezielt anpassen'}
                  </div>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-700 mb-1">Daniel-Anweisung (optional)</div>
                    <input
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                      value={conciergeInstruction}
                      onChange={(e) => setConciergeInstruction(e.target.value)}
                      placeholder="/Concierge weiter oder von mir ..."
                    />
                  </label>

                  {conciergeError && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                      {conciergeError}
                    </div>
                  )}

                  <label className="block">
                    <div className="text-xs font-medium text-slate-700 mb-1">Antworttext</div>
                    <textarea
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm min-h-[190px]"
                      value={conciergeReply}
                      onChange={(e) => {
                        setConciergeReply(e.target.value);
                        setConciergeApproved(false);
                        resetSendChecklist();
                      }}
                      placeholder="Hier steht die generierte Antwort. Du kannst sie direkt anpassen."
                    />
                  </label>

                  <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700 select-none">
                      {checklistConfig.title} (Pflicht)
                    </summary>
                    <div className="mt-2 grid gap-1.5 text-xs text-slate-700">
                      {checklistConfig.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(sendChecklist[item.key])}
                            onChange={(e) => {
                              setSendChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }));
                              setConciergeApproved(false);
                            }}
                            disabled={!conciergeReply.trim()}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </details>

                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={conciergeApproved}
                      onChange={(e) => setConciergeApproved(e.target.checked)}
                      disabled={!conciergeReply.trim() || !wizardStep2Done}
                    />
                    E-Mail geprüft und zur manuellen Freigabe bestätigt
                  </label>
                  {!sendChecklistDone && conciergeReply.trim() && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                      Versand ist gesperrt, bis alle Pflicht-Haken gesetzt sind.
                    </div>
                  )}
                  {!conciergeApproved && conciergeReply.trim() && sendChecklistDone && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                      Versand ist gesperrt, bis die Freigabe gesetzt wurde.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="px-3 py-2 rounded-md bg-emerald-700 text-white text-sm hover:bg-emerald-800 disabled:opacity-60"
                      disabled={!canApproveAndOpenGmail || wizardStep < 3}
                      onClick={() => {
                        if (!canApproveAndOpenGmail || !gmailReplyHref || wizardStep < 3) return;
                        setConciergeApproved(true);
                        window.open(gmailReplyHref, '_blank', 'noopener,noreferrer');
                      }}
                      title={canApproveAndOpenGmail ? 'Setzt Freigabe und öffnet Gmail-Reply' : step2GateMessage}
                    >
                      Freigeben & in Gmail öffnen
                    </button>
                    <button
                      className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                      onClick={async () => {
                        await navigator.clipboard.writeText(conciergeReply || '');
                        alert('Antwort in Zwischenablage kopiert.');
                      }}
                      disabled={!conciergeReply.trim()}
                    >
                      Antwort kopieren
                    </button>
                    <a
                      className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                      href={gmailReplyHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!conciergeReply.trim() || !conciergeApproved || !sendChecklistDone || wizardStep < 3}
                      onClick={(e) => {
                        if (!conciergeReply.trim() || !conciergeApproved || !sendChecklistDone || wizardStep < 3) e.preventDefault();
                      }}
                    >
                      In Gmail antworten
                    </a>
                  </div>
                </div>
            )}

            <div className="max-h-[40vh] overflow-auto rounded-lg border border-slate-200 p-3 space-y-3">
              {sortedConversationMessages.map((m: any, idx: number) => {
                const parsed = parseFromHeader(m.from);
                const label = parsed.name || parsed.email || 'Unbekannt';
                const isUs = (parsed.email || '').toLowerCase().includes('@mietpark-saar-pfalz.');
                const body = String(m.body || '');
                const preview = body.length > 600 ? body.slice(0, 600).trimEnd() + '…' : body;
                return (
                  <div key={idx} className={isUs ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={[
                      'max-w-[92%] rounded-lg px-3 py-2 border text-sm',
                      isUs ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200',
                    ].join(' ')}>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between gap-3">
                        <span className="font-medium">{label}</span>
                        <span className="shrink-0">{m.date ? new Date(m.date).toLocaleString('de-DE') : ''}</span>
                      </div>
                      <div className="mt-2 text-slate-800 whitespace-pre-wrap text-xs">{preview}</div>
                      {body.length > 600 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-600 select-none">
                            Ganze Nachricht anzeigen
                          </summary>
                          <div className="mt-2 text-slate-800 whitespace-pre-wrap text-xs">
                            {body}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedThreadId && (
              <a
                className="text-sm text-blue-700 underline"
                href={`https://mail.google.com/mail/u/0/#inbox/${selectedThreadId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                In Gmail oeffnen
              </a>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
