/**
 * InvoiceEditor Component
 * Einheitliche UI für Angebot, Auftrag, Rechnung
 * SubTotal-ähnlicher Workflow
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { ArrowRight, ChevronDown, Download, Eye, FileText, Mail, Save, Send, Truck } from 'lucide-react';
import { Invoice, InvoiceItem, InvoiceType, InvoiceState, Customer, InvoiceTemplate, Payment } from '../types';
import type { InvoiceFormValues } from './invoice/types';
import InvoicePickupReturnBlock from './invoice/InvoicePickupReturnBlock';
import { fetchInvoiceTemplate } from '../services/invoiceService';
import { getDefaultInvoiceLayoutId, getInvoiceLayout } from '../config/invoiceLayouts';
import { getCompanyProfile } from '../config/companyProfile';
import { getPaymentsByInvoice } from '../services/sqliteService';
import InvoiceWorkflowBar from './InvoiceWorkflowBar';
import { useAutoSave } from '../hooks/useAutoSave';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import Accordion from './ui/Accordion';
import { useInvoiceExport } from '../hooks/useInvoiceExport';
import { useInvoiceDirtyTracking } from '../hooks/useInvoiceDirtyTracking';
import AutoSaveIndicator from './AutoSaveIndicator';
import RentalLineItems from './RentalLineItems';
import { DEFAULT_PRODUCT_KEY, DEFAULT_DURATION_LABEL, getSuggestedPrice } from '../config/rentalCatalog';
import InvoiceHeaderFields from './invoice/InvoiceHeaderFields';
import InvoiceCustomerBlock from './invoice/InvoiceCustomerBlock';
import { Card } from './invoice/Card';

export type { InvoiceFormValues };

// ─── Inline Status Hook ───────────────────────────────────────────

function useInlineStatus() {
  const [status, setStatus] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (s: { tone: 'error' | 'info'; text: string }, minDisplayMs = 4000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus(s);
    timerRef.current = setTimeout(() => {
      setStatus(null);
      timerRef.current = null;
    }, minDisplayMs);
  };

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus(null);
  };

  return { status, show, clear };
}

// ─── More Actions Dropdown Hook ────────────────────────────────────

function useMoreActionsDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, wrapRef };
}

// ─── Main Component ───────────────────────────────────────────────

interface InvoiceEditorProps {
  invoice?: Partial<Invoice>;
  items?: InvoiceItem[];
  customers: Customer[];
  onSave: (invoice: Partial<Invoice>, items: InvoiceItem[]) => void;
  onSend?: (invoiceId: string) => void;
  onConvertToOrder?: (invoiceId: string) => void;
  onConvertToInvoice?: (invoiceId: string) => void;
  onReissue?: (invoiceId: string) => void;
}

export const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
  invoice: initialInvoice,
  items: initialItems = [],
  customers,
  onSave,
  onSend,
  onConvertToOrder,
  onConvertToInvoice,
  onReissue,
}) => {
  const company = useMemo(() => getCompanyProfile(), []);

  // ─── Form ──────────────────────────────────────────────────────

  const methods = useForm<{
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    companyId: string;
    buyerName: string;
    buyerAddress: string;
    salutation: string;
    introText: string;
    servicePeriodStart: string;
    servicePeriodEnd: string;
    depositPercent: number;
    depositText: string;
    depositEnabled: boolean;
    depositReceivedEnabled: boolean;
    depositReceivedAmount: number;
    paymentTerms: string;
    paymentInfo: string;
    paypalText: string;
    footerText: string;
    taxNote: string;
    agbText: string;
    agbLink: string;
    items: InvoiceItem[];
  }>({
    defaultValues: {
      invoiceNo: initialInvoice?.invoiceNo || '',
      invoiceDate: initialInvoice?.invoiceDate
        ? new Date(initialInvoice.invoiceDate).toISOString().substring(0, 10)
        : new Date().toISOString().substring(0, 10),
      dueDate: initialInvoice?.dueDate ? new Date(initialInvoice.dueDate).toISOString().substring(0, 10) : '',
      currency: initialInvoice?.currency || 'EUR',
      companyId: initialInvoice?.companyId || '',
      buyerName: initialInvoice?.buyerName || '',
      buyerAddress: initialInvoice?.buyerAddress || '',
      salutation: initialInvoice?.salutation || '',
      introText: initialInvoice?.introText || '',
      servicePeriodStart: initialInvoice?.servicePeriodStart
        ? new Date(initialInvoice.servicePeriodStart).toISOString().substring(0, 10) : '',
      servicePeriodEnd: initialInvoice?.servicePeriodEnd
        ? new Date(initialInvoice.servicePeriodEnd).toISOString().substring(0, 10) : '',
      depositPercent: typeof initialInvoice?.depositPercent === 'number' ? initialInvoice.depositPercent : 0,
      depositText: initialInvoice?.depositText || '',
      depositEnabled: typeof initialInvoice?.depositEnabled === 'boolean' ? initialInvoice.depositEnabled : false,
      depositReceivedEnabled: Boolean(initialInvoice?.depositReceivedEnabled),
      depositReceivedAmount: typeof initialInvoice?.depositReceivedAmount === 'number'
        ? Number(initialInvoice.depositReceivedAmount) : 0,
      paymentTerms: initialInvoice?.paymentTerms || '',
      paymentInfo: initialInvoice?.paymentInfo || '',
      paypalText: initialInvoice?.paypalText || '',
      footerText: initialInvoice?.footerText || '',
      taxNote: initialInvoice?.taxNote || '',
      agbText: initialInvoice?.agbText || '',
      agbLink: initialInvoice?.agbLink || '',
      items: initialItems.length > 0 ? initialItems : [{ id: 'temp_1', invoiceId: '', name: '', orderIndex: 0, unitPrice: 0, quantity: 1, taxPercent: 0, unit: 'Stück', createdAt: Date.now() }],
    },
  });

  const { setValue, watch, getValues, control } = methods;
  const { fields, append, remove, update } = useFieldArray({ control, name: 'items', keyName: 'rhfId' });

  // ─── Local State ───────────────────────────────────────────────

  const { status: inlineStatus, show: showStatus, clear: clearStatus } = useInlineStatus();
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const moreActions = useMoreActionsDropdown();
  const depositReceivedAmountRef = useRef<HTMLInputElement | null>(null);

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(initialInvoice?.invoiceType || 'Angebot');
  const [state, setState] = useState<InvoiceState>(initialInvoice?.state || 'entwurf');
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [layoutId, setLayoutId] = useState<string>(initialInvoice?.layoutId || getDefaultInvoiceLayoutId(invoiceType));
  const [linkedPayments, setLinkedPayments] = useState<Payment[]>([]);
  const [linkedPaymentsLoading, setLinkedPaymentsLoading] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Update state when initialInvoice changes (e.g., after save)
  useEffect(() => {
    if (initialInvoice?.state) {
      setState(initialInvoice.state);
    }
  }, [initialInvoice?.state]);

  // ─── Watched Fields (reactive for JSX rendering) ───────────────
  // Gruppiert für bessere Performance (~7 statt 21 Subscriptions)

  // Gruppe 1: Header-Felder (Typ, Nummer, Layout, Datum)
  const [invoiceNo, invoiceDate, dueDate] = watch(['invoiceNo', 'invoiceDate', 'dueDate']);

  // Gruppe 2: Kunden-Felder (für Validation-Feedback)
  const [companyId, buyerName, buyerAddress, salutation] = watch(['companyId', 'buyerName', 'buyerAddress', 'salutation']);

  // Gruppe 3: Zeitraum & Intro
  const [servicePeriodStart, servicePeriodEnd, introText] = watch(['servicePeriodStart', 'servicePeriodEnd', 'introText']);

  // Gruppe 4: Anzahlung (für Berechnungen)
  const [depositEnabled, depositPercent, depositText] = watch(['depositEnabled', 'depositPercent', 'depositText']);

  // Gruppe 5: Kautionsbestätigung (für UI)
  const [depositReceivedEnabled, depositReceivedAmount] = watch(['depositReceivedEnabled', 'depositReceivedAmount']);

  // Gruppe 6: Erweiterte Text-Blöcke
  const [paymentTerms, paymentInfo, paypalText, footerText, taxNote, agbText, agbLink] = watch([
    'paymentTerms', 'paymentInfo', 'paypalText', 'footerText', 'taxNote', 'agbText', 'agbLink'
  ]);

  // Single subscription für Dirty-Tracking
  const _formVersion = watch();

  // ─── Derived State ─────────────────────────────────────────────

  const layout = useMemo(() => getInvoiceLayout(layoutId), [layoutId]);
  const hasBuyerName = buyerName.trim().length > 0;
  const hasBuyerAddress = buyerAddress.trim().length > 0;
  const canSave = hasBuyerName && hasBuyerAddress;
  const isDepositSupportedType = invoiceType === 'Angebot' || invoiceType === 'Auftrag';
  const hasAdvancedTextBlocks = layout.editorBlocks.some(
    (b) => b === 'payment' || b === 'paypal' || b === 'taxNote' || b === 'agbLink' || b === 'footer'
  );
  const hasNonEmptyAdvancedFields = [paymentTerms, paypalText, taxNote, agbText, agbLink, footerText]
    .some((v) => String(v || '').trim().length > 0);

  // ─── Helpers ───────────────────────────────────────────────────

  const resolvePlaceholders = (s: string) => {
    const name = buyerName?.trim() || '{{name}}';
    const validUntil = (() => {
      try {
        const base = new Date(invoiceDate);
        base.setDate(base.getDate() + 7);
        return base.toLocaleDateString('de-DE');
      } catch { return ''; }
    })();
    return String(s || '')
      .replaceAll('{{name}}', name).replaceAll('{{client}}', name).replaceAll('{client}', name)
      .replaceAll('{{paypalMeUrl}}', company.paypalMeUrl)
      .replaceAll('{{agbsUrl}}', company.agbsUrl)
      .replaceAll('{{validUntil}}', validUntil);
  };

  const buildInvoice = (): Invoice => {
    const v = getValues();
    return {
      id: initialInvoice?.id || 'temp', invoiceType, invoiceNo: v.invoiceNo,
      companyId: v.companyId,
      invoiceDate: new Date(v.invoiceDate).getTime(),
      dueDate: v.dueDate ? new Date(v.dueDate).getTime() : undefined,
      currency: v.currency, state,
      buyerName: v.buyerName, buyerAddress: v.buyerAddress, salutation: v.salutation,
      introText: v.introText,
      servicePeriodStart: v.servicePeriodStart ? new Date(v.servicePeriodStart).getTime() : undefined,
      servicePeriodEnd: v.servicePeriodEnd ? new Date(v.servicePeriodEnd).getTime() : undefined,
      depositPercent: v.depositPercent, depositText: v.depositText, depositEnabled: v.depositEnabled,
      depositReceivedEnabled: v.depositReceivedEnabled, depositReceivedAmount: v.depositReceivedAmount,
      paymentTerms: v.paymentTerms, paymentInfo: v.paymentInfo, paypalText: v.paypalText,
      footerText: v.footerText, taxNote: v.taxNote, agbText: v.agbText, agbLink: v.agbLink,
      layoutId, createdAt: Date.now(), updatedAt: Date.now(),
    };
  };

  const buildInvoiceData = (): Partial<Invoice> => {
    const { createdAt, updatedAt, ...rest } = buildInvoice();
    return rest;
  };

  // ─── Dirty Tracking ────────────────────────────────────────────

  const { isDirty, setIsDirty, resetDirtyBaseline } = useInvoiceDirtyTracking({
    getValues: getValues as () => Record<string, unknown>,
    fields: fields as InvoiceItem[],
    externalState: { invoiceType, state, selectedCustomerId: companyId, layoutId },
    formVersion: _formVersion,
    template,
  });

  // ─── Export Hook ────────────────────────────────────────────────

  const exportHandlers = useInvoiceExport({
    buildInvoice,
    getFields: () => fields as InvoiceItem[],
    template,
    customers,
    selectedCustomerId: companyId,
    buyerName,
    showStatus,
    clearStatus,
    requestConfirm,
  });

  // ─── Totals ────────────────────────────────────────────────────

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    const taxRates = new Set<number>();
    fields.forEach((item) => {
      const itemTotal = item.unitPrice * item.quantity;
      subtotal += itemTotal;
      tax += itemTotal * (item.taxPercent / 100);
      if (item.taxPercent > 0) taxRates.add(item.taxPercent);
    });
    const total = subtotal + tax;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      hasTax: tax > 0,
      effectiveTaxRate: subtotal > 0 ? Math.round((tax / subtotal) * 10000) / 100 : 0,
      singleTaxRate: taxRates.size === 1 ? [...taxRates][0] : undefined,
    };
  }, [fields]);

  const depositAmountPreview = isDepositSupportedType && depositEnabled && depositPercent > 0
    ? Math.round((totals.total * (depositPercent / 100)) * 100) / 100 : 0;
  const grandTotalPreview = Math.round((totals.total + (depositText && depositAmountPreview > 0 ? depositAmountPreview : 0)) * 100) / 100;
  const linkedPaymentsTotal = useMemo(() => linkedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [linkedPayments]);

  // ─── Effects ───────────────────────────────────────────────────

  // Linked Payments
  useEffect(() => {
    let cancelled = false;
    const invoiceId = String(initialInvoice?.id || '').trim();
    if (!invoiceId) { setLinkedPayments([]); setLinkedPaymentsLoading(false); return; }
    setLinkedPaymentsLoading(true);
    getPaymentsByInvoice(invoiceId)
      .then((rows) => { if (!cancelled) setLinkedPayments(rows); })
      .catch(() => { if (!cancelled) setLinkedPayments([]); })
      .finally(() => { if (!cancelled) setLinkedPaymentsLoading(false); });
    return () => { cancelled = true; };
  }, [initialInvoice?.id]);

  // Template laden bei Typ-Änderung
  useEffect(() => {
    const loadTemplate = async () => {
      const tpl = await fetchInvoiceTemplate(invoiceType);
      if (tpl) {
        setTemplate(tpl);
        setLayoutId((cur) => (initialInvoice?.id ? cur : (cur || tpl.layoutId || getDefaultInvoiceLayoutId(invoiceType))));
        const batchOpts = { shouldDirty: false };
        if (!initialInvoice?.introText) setValue('introText', resolvePlaceholders(tpl.defaultIntroText || ''), batchOpts);
        if (!initialInvoice?.paymentTerms) setValue('paymentTerms', tpl.defaultPaymentTerms, batchOpts);
        if (!initialInvoice?.paymentInfo) setValue('paymentInfo', tpl.defaultPaymentInfo, batchOpts);
        if (!initialInvoice?.paypalText) setValue('paypalText', resolvePlaceholders(tpl.defaultPaypalText || ''), batchOpts);
        if (!initialInvoice?.footerText) setValue('footerText', tpl.defaultFooterText, batchOpts);
        if (!initialInvoice?.taxNote) setValue('taxNote', tpl.defaultTaxNote, batchOpts);
        if (!initialInvoice?.agbText) setValue('agbText', resolvePlaceholders(tpl.defaultAgbText || ''), batchOpts);
        if (!initialInvoice?.agbLink) setValue('agbLink', tpl.defaultAgbLink, batchOpts);
        if (typeof initialInvoice?.depositPercent !== 'number' && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setValue('depositPercent', typeof tpl.defaultDepositPercent === 'number' ? tpl.defaultDepositPercent : 0, batchOpts);
        }
        if (!initialInvoice?.depositText && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setValue('depositText', resolvePlaceholders(tpl.defaultDepositText || company.depositNote || ''), batchOpts);
        }
        if (!initialInvoice?.dueDate) {
          const d = layout.defaultsByType[invoiceType]?.dueDays;
          if (typeof d === 'number' && d > 0 && !getValues('dueDate')) {
            const base = new Date(getValues('invoiceDate'));
            base.setDate(base.getDate() + d);
            setValue('dueDate', base.toISOString().substring(0, 10), batchOpts);
          }
        }
      }
    };
    loadTemplate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceType]);

  // Kunde-Änderung wird jetzt direkt in InvoiceCustomerBlock gehandhabt

  // ─── Auto Save ─────────────────────────────────────────────────

  const autoSaveData = useMemo(
    () => ({ invoiceData: buildInvoiceData(), items: fields as InvoiceItem[] }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [_formVersion, invoiceType, state, layoutId, fields]
  );

  const { saveState } = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      onSave(data.invoiceData, data.items);
      resetDirtyBaseline();
    },
    isDirty,
    condition: canSave,
    delay: 1500,
  });

  // ─── Position CRUD ─────────────────────────────────────────────

  const addPosition = () => {
    const defaultPrice = getSuggestedPrice(DEFAULT_PRODUCT_KEY, DEFAULT_DURATION_LABEL);
    append({
      id: `temp_${Date.now()}`, invoiceId: '',
      name: `Dachbox 524L (XL) inkl. Träger – ${DEFAULT_DURATION_LABEL}`,
      orderIndex: fields.length,
      unitPrice: defaultPrice, quantity: 1, taxPercent: 0,
      unit: DEFAULT_DURATION_LABEL, createdAt: Date.now(),
    } as InvoiceItem);
  };

  const removePosition = (index: number) => {
    if (fields.length === 1) {
      showStatus({ tone: 'error', text: 'Mindestens eine Position ist erforderlich.' });
      return;
    }
    clearStatus();
    remove(index);
  };

  const updatePosition = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const current = fields[index] as InvoiceItem;
    update(index, { ...current, [field]: value });
  };

  // ─── Handlers ──────────────────────────────────────────────────

  const handleSave = async () => {
    setShowValidationErrors(true);
    if (!canSave) {
      showStatus({ tone: 'error', text: 'Bitte Name und Adresse im Kundenblock ausfüllen.' });
      return;
    }
    clearStatus();
    const hasNamedItems = fields.some((it: any) => it.name.trim().length > 0);
    const allZeroPrice = fields.every((it: any) => !it.unitPrice || it.unitPrice === 0);
    if (hasNamedItems && allZeroPrice) {
      const ok = await requestConfirm({
        title: 'Speichern bestätigen',
        message: '⚠️ Alle Positionen haben den Preis 0,00 €.\n\nTrotzdem speichern?',
        confirmLabel: 'Trotzdem speichern', cancelLabel: 'Abbrechen', danger: false,
      });
      if (!ok) return;
    }
    onSave(buildInvoiceData(), fields as InvoiceItem[]);
    resetDirtyBaseline();
    showStatus({ tone: 'info', text: 'Beleg gespeichert.' }, 3000);
  };

  const applyLayoutDefaults = (opts?: { force?: boolean }) => {
    const d = layout.defaultsByType[invoiceType];
    const force = Boolean(opts?.force);
    const b = { shouldDirty: false };
    if (force || !String(getValues('introText') || '').trim()) setValue('introText', resolvePlaceholders(d.introText), b);
    if (force || !String(getValues('paymentTerms') || '').trim()) setValue('paymentTerms', d.paymentTerms, b);
    if (force || !String(getValues('paymentInfo') || '').trim()) setValue('paymentInfo', d.paymentInfo, b);
    if (force || !String(getValues('paypalText') || '').trim()) setValue('paypalText', resolvePlaceholders(d.paypalText), b);
    if (force || !String(getValues('footerText') || '').trim()) setValue('footerText', d.footerText, b);
    if (force || !String(getValues('taxNote') || '').trim()) setValue('taxNote', d.taxNote, b);
    if (force || !String(getValues('agbText') || '').trim()) setValue('agbText', resolvePlaceholders(d.agbText), b);
    if (force || !String(getValues('agbLink') || '').trim()) setValue('agbLink', template?.defaultAgbLink || getValues('agbLink') || '', b);
    if (force || !getValues('depositPercent')) setValue('depositPercent', typeof d.depositPercent === 'number' ? d.depositPercent : 0, b);
    if (force || !String(getValues('depositText') || '').trim()) setValue('depositText', resolvePlaceholders(d.depositText || company.depositNote || ''), b);
    if ((force || !getValues('dueDate')) && typeof d.dueDays === 'number' && d.dueDays > 0) {
      const base = new Date(getValues('invoiceDate'));
      base.setDate(base.getDate() + d.dueDays);
      setValue('dueDate', base.toISOString().substring(0, 10), b);
    }
  };

  // ─── Status Badge ──────────────────────────────────────────────

  const statusColors: Record<string, string> = {
    entwurf: 'bg-gray-100 text-gray-800', gesendet: 'bg-blue-100 text-blue-800',
    angenommen: 'bg-green-100 text-green-800', storniert: 'bg-red-100 text-red-800',
    archiviert: 'bg-slate-200 text-slate-800',
  };

  const workflowActionLabel = useMemo(() => {
    if (!initialInvoice?.id) return undefined;
    if (invoiceType === 'Angebot' && onConvertToOrder) return 'Als Auftrag fortführen';
    if (invoiceType === 'Auftrag' && onConvertToInvoice) return 'Als Rechnung fortführen';
    return undefined;
  }, [initialInvoice?.id, invoiceType, onConvertToOrder, onConvertToInvoice]);

  const [workflowAdvancing, setWorkflowAdvancing] = useState(false);

  const handleWorkflowAdvance = async () => {
    if (!initialInvoice?.id) {
      showStatus({ tone: 'error', text: 'Bitte speichern Sie den Beleg zuerst.' });
      return;
    }
    if (workflowAdvancing) return;
    setWorkflowAdvancing(true);
    try {
      if (invoiceType === 'Angebot' && onConvertToOrder) {
        await onConvertToOrder(initialInvoice.id);
        return;
      }
      if (invoiceType === 'Auftrag' && onConvertToInvoice) {
        await onConvertToInvoice(initialInvoice.id);
      }
    } catch (e: any) {
      showStatus({ tone: 'error', text: e?.message || 'Konvertierung fehlgeschlagen.' });
    } finally {
      setWorkflowAdvancing(false);
    }
  };

  // ─── Button Classes ────────────────────────────────────────────

  const baseBtn = 'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const primaryBtn = `${baseBtn} bg-slate-900 text-white hover:bg-slate-800`;
  const secondaryBtn = `${baseBtn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

  // ─── Deposit Setters ───────────────────────────────────────────

  const setDepositEnabled = (next: boolean | ((prev: boolean) => boolean)) => {
    const prev = Boolean(getValues('depositEnabled'));
    const resolved = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
    setValue('depositEnabled', resolved);
  };
  const setDepositPercent = (next: number) => setValue('depositPercent', next);
  const setDepositReceivedEnabled = (next: boolean | ((prev: boolean) => boolean)) => {
    const prev = Boolean(getValues('depositReceivedEnabled'));
    const resolved = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
    setValue('depositReceivedEnabled', resolved);
  };
  const setDepositReceivedAmount = (next: number) => setValue('depositReceivedAmount', next);

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <FormProvider {...methods}>
    <div className="flex flex-col h-full bg-slate-50">
      {confirmDialog}

      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Beleg Editor</h2>
          <div className="flex items-center gap-3">
            <AutoSaveIndicator state={saveState} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 space-y-6">

        {/* Workflow Bar - prominent at top */}
        <div className="mb-2">
          <InvoiceWorkflowBar 
            currentType={invoiceType} 
            nextActionLabel={workflowActionLabel} 
            onAdvance={handleWorkflowAdvance}
          />
        </div>

        {/* Inline Status */}
        {inlineStatus && (
          <div className={[
            'mb-4 rounded-md border px-3 py-2 text-sm',
            inlineStatus.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-700',
          ].join(' ')}>
            {inlineStatus.text}
          </div>
        )}

        {/* Karte 1: Kopfdaten */}
        <Card title="Kopfdaten">
          <InvoiceHeaderFields
            invoiceType={invoiceType}
            onTypeChange={setInvoiceType}
            typeDisabled={!!initialInvoice?.id}
            invoiceNo={invoiceNo}
            onInvoiceNoChange={(v: string) => setValue('invoiceNo', v)}
            invoiceNoDisabled={!!initialInvoice?.id}
            state={state}
            onStateChange={setState}
            layoutId={layoutId}
            onLayoutChange={setLayoutId}
            onApplyDefaults={async () => {
              const ok = await requestConfirm({
                title: 'Default-Texte anwenden?',
                message: 'Default-Texte fuer dieses Layout anwenden?\n\nBestehende Texte werden ueberschrieben.',
                confirmLabel: 'Anwenden', cancelLabel: 'Abbrechen', danger: false,
              });
              if (!ok) return;
              applyLayoutDefaults({ force: true });
            }}
            invoiceDate={invoiceDate}
            onDateChange={(v: string) => setValue('invoiceDate', v)}
            dueDate={dueDate}
            onDueDateChange={(v: string) => setValue('dueDate', v)}
          />
        </Card>

        {/* Karte 2: Empfänger */}
        <Card title="Empfänger">
          <InvoiceCustomerBlock customers={customers} />
        </Card>

        {/* Verknüpfte Zahlungen */}
        {initialInvoice?.id && (
          <div className="mb-6 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <h3 className="text-sm font-medium text-emerald-900 mb-2">Verknüpfte Zahlungen</h3>
            {linkedPaymentsLoading ? (
              <div className="text-sm text-emerald-800">Zahlungen werden geladen…</div>
            ) : linkedPayments.length === 0 ? (
              <div className="text-sm text-emerald-800">Noch keine Zahlungen zugeordnet.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-emerald-900">
                  {linkedPayments.length} Zahlung{linkedPayments.length === 1 ? '' : 'en'} • Summe {linkedPaymentsTotal.toFixed(2)} €
                </div>
                <div className="max-h-40 overflow-auto rounded border border-emerald-200 bg-white">
                  {linkedPayments.map((p) => (
                    <div key={p.id} className="px-3 py-2 text-sm border-b last:border-b-0 border-emerald-100">
                      <div className="font-medium text-gray-900">{(Number(p.amount) || 0).toFixed(2)} € • {p.kind}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(p.receivedAt || p.createdAt).toLocaleDateString('de-DE')} • {p.method}{p.payerName ? ` • ${p.payerName}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Intro / Anschreiben */}
        {layout.editorBlocks.includes('intro') && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Text (oben)</h3>
            <textarea id="invoice-intro" value={introText}
              onChange={(e) => setValue('introText', e.target.value)} rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Hallo ...\n\nWie besprochen ...\n\nBesten Dank!" />
          </div>
        )}

        {/* Mietzeitraum */}
        {layout.editorBlocks.includes('servicePeriod') && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Mietzeitraum (optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-period-start">Von</label>
                <input id="invoice-period-start" type="date" value={servicePeriodStart}
                  onChange={(e) => setValue('servicePeriodStart', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-period-end">Bis</label>
                <input id="invoice-period-end" type="date" value={servicePeriodEnd}
                  onChange={(e) => setValue('servicePeriodEnd', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Karte 2b: Abholung & Rückgabe */}
        {layout.editorBlocks.includes('servicePeriod') && (
          <Card title="Abholung &amp; Rückgabe">
            <InvoicePickupReturnBlock />
          </Card>
        )}

        {/* Karte 3: Positionen */}
        <Card title="Positionen" noPadding>
          <RentalLineItems
            items={fields as InvoiceItem[]}
            onAdd={addPosition} onRemove={removePosition} onUpdate={updatePosition}
          />
        </Card>

        {/* Karte 4: Summen - kompakt für Kleinunternehmer */}
        <div className="flex justify-end">
          <Card className="w-full max-w-sm">
            <div className="space-y-2">
              {isDepositSupportedType && depositEnabled && depositText && depositAmountPreview > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Anzahlung ({depositPercent || 0}%):</span>
                  <span className="font-medium">{depositAmountPreview.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200">
                <span>Gesamtbetrag:</span>
                <span>{grandTotalPreview.toFixed(2)} €</span>
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Keine Umsatzsteuer gem. §&nbsp;19 UStG
              </p>
            </div>
          </Card>
        </div>

        {/* Anzahlung */}
        {isDepositSupportedType && layout.editorBlocks.includes('deposit') && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Anzahlung ({invoiceType})</h3>
            <div className="mb-3">
              <button type="button" title="Anzahlungsblock ein- oder ausblenden"
                onClick={() => {
                  setDepositEnabled((v) => {
                    const next = !v;
                    if (next) {
                      if (!(Number(depositPercent) > 0)) {
                        const d = layout.defaultsByType[invoiceType];
                        setDepositPercent(typeof d.depositPercent === 'number' ? d.depositPercent : 50);
                      }
                      if (!String(depositText || '').trim()) {
                        const d = layout.defaultsByType[invoiceType];
                        setValue('depositText', resolvePlaceholders(d.depositText || company.depositNote || 'Anzahlung'));
                      }
                    }
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-md text-sm border ${depositEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                aria-pressed={depositEnabled ? 'true' : 'false'}>
                {depositEnabled ? 'Anzahlung aktiv' : 'Anzahlung aktivieren'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-deposit-percent">Prozent</label>
                <input id="invoice-deposit-percent" type="number" min="0" max="100" step="1" value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value))} disabled={!depositEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-deposit-text">Text</label>
                <input id="invoice-deposit-text" type="text" value={depositText}
                  onChange={(e) => setValue('depositText', e.target.value)} disabled={!depositEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Anzahlung 50 % nach Angebotsannahme" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Optional: Wird im PDF als zusätzliche Zeile in der Tabelle angezeigt (Betrag = Gesamt * Prozent).
            </p>
          </div>
        )}

        {/* Erweiterte Texte */}
        {hasAdvancedTextBlocks && (
          <Accordion title="Erweiterte Texte & Bedingungen anpassen" defaultOpen={false}>
            <div className="space-y-6">
              {layout.editorBlocks.includes('payment') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Zahlungsbedingungen</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-payment-terms">Bedingungen</label>
                    <textarea id="invoice-payment-terms" value={paymentTerms}
                      onChange={(e) => setValue('paymentTerms', e.target.value)} rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" />
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-payment-info">Zahlungsinfo (optional)</label>
                    <input id="invoice-payment-info" type="text" value={paymentInfo}
                      onChange={(e) => setValue('paymentInfo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="PayPal: https://paypal.me/..." />
                  </div>
                </div>
              )}
              {layout.editorBlocks.includes('paypal') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">PayPal Zeile</h3>
                  <input id="invoice-paypal-text" type="text" value={paypalText}
                    onChange={(e) => setValue('paypalText', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder={`Zahlungslink Paypal ${company.paypalMeUrl}`} />
                </div>
              )}
              {layout.editorBlocks.includes('taxNote') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Steuerhinweis</h3>
                  <textarea id="invoice-tax-note" value={taxNote}
                    onChange={(e) => setValue('taxNote', e.target.value)} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    title="Steuerhinweis für den Beleg"
                    placeholder="z.B. Steuerfrei nach § 19 UStG" />
                </div>
              )}
              {layout.editorBlocks.includes('agbLink') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Links</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-agb-text">AGB Text (wie im PDF)</label>
                    <input id="invoice-agb-text" type="text" value={agbText}
                      onChange={(e) => setValue('agbText', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={`Bitte beachten Sie die gültigen AGBs auf meiner Homepage : ${company.agbsUrl}`} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-agb-link">AGB Link</label>
                    <input id="invoice-agb-link" type="text" value={agbLink}
                      onChange={(e) => setValue('agbLink', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" />
                  </div>
                </div>
              )}
              {layout.editorBlocks.includes('footer') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Footer / Hinweis</h3>
                  <textarea id="invoice-footer" value={footerText}
                    onChange={(e) => setValue('footerText', e.target.value)} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    title="Footer / Hinweis für den Beleg"
                    placeholder="z.B. Bei Rückfragen stehe ich Ihnen gerne zur Verfügung" />
                </div>
              )}
            </div>
          </Accordion>
        )}

        </div>{/* End max-w-5xl container */}
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 z-20 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Links: Vorschau + Export-Dropdown */}
            <div className="flex items-center gap-2">
              <button 
                onClick={exportHandlers.handlePreviewPdf} 
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                title="PDF Vorschau öffnen" 
                disabled={!template}
              >
                <Eye size={14} aria-hidden="true" /> Vorschau
              </button>
              <div className="relative" ref={moreActions.wrapRef}>
                <button 
                  type="button" 
                  onClick={() => moreActions.setOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60" 
                  title="Weitere Aktionen"
                  aria-haspopup="menu" 
                  aria-expanded={moreActions.open}
                >
                  Export <ChevronDown size={14} aria-hidden="true" />
                </button>
                {moreActions.open && (
                  <div className="absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden" role="menu">
                    <button 
                      type="button" 
                      role="menuitem"
                      onClick={() => { moreActions.setOpen(false); void exportHandlers.handleSavePdf(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!template} 
                      title="PDF lokal speichern"
                    >
                      <FileText size={14} aria-hidden="true" /> Als PDF speichern
                    </button>
                    <button 
                      type="button" 
                      role="menuitem"
                      onClick={() => { moreActions.setOpen(false); void exportHandlers.handleMailCustomer(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!template} 
                      title="Öffnet Gmail-Entwurf"
                    >
                      <Mail size={14} aria-hidden="true" /> Per Mail senden
                    </button>
                    <button 
                      type="button" 
                      role="menuitem"
                      onClick={() => { moreActions.setOpen(false); exportHandlers.handleDownloadHtml(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!template} 
                      title="druckbare HTML-Datei herunterladen"
                    >
                      <Download size={14} aria-hidden="true" /> HTML Download
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Rechts: Senden + Speichern + Workflow-CTA */}
            <div className="flex items-center gap-2">
              {onSend && initialInvoice?.id && state === 'entwurf' && (
                <button 
                  onClick={() => onSend(initialInvoice.id!)} 
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60" 
                  title="Belegstatus auf gesendet setzen"
                >
                  <Send size={14} aria-hidden="true" /> Senden
                </button>
              )}
              <button 
                onClick={handleSave} 
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60" 
                title="Beleg speichern" 
                disabled={!canSave}
              >
                <Save size={14} aria-hidden="true" /> Speichern
              </button>
              {workflowActionLabel && initialInvoice?.id && (
                <button
                  type="button"
                  onClick={handleWorkflowAdvance}
                  disabled={workflowAdvancing}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={workflowActionLabel}
                >
                  {workflowAdvancing
                    ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    : <ArrowRight size={14} aria-hidden="true" />}
                  {workflowAdvancing ? 'Wird erstellt…' : workflowActionLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </FormProvider>
  );
};
