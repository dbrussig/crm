/**
 * InvoiceEditor Component
 * Einheitliche UI für Angebot, Auftrag, Rechnung
 * SubTotal-ähnlicher Workflow
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ChevronDown, Download, Eye, FileText, Mail, Save, Send, X } from 'lucide-react';
import { Invoice, InvoiceItem, InvoiceType, InvoiceState, Customer, InvoiceTemplate, Payment } from '../types';
import { fetchInvoiceTemplate } from '../services/invoiceService';
import { downloadInvoicePDF, openInvoicePreview, saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { INVOICE_LAYOUTS, getDefaultInvoiceLayoutId, getInvoiceLayout } from '../config/invoiceLayouts';
import { getCompanyProfile } from '../config/companyProfile';
import { openInvoiceCompose } from '../services/invoiceEmailService';
import { getActiveSubTotalInvoiceTypeProfile } from '../services/subtotalInvoiceTypeProfileService';
import { getPaymentsByInvoice } from '../services/sqliteService';
import InvoiceWorkflowBar from './InvoiceWorkflowBar';
import { useAutoSave } from '../hooks/useAutoSave';
import AutoSaveIndicator from './AutoSaveIndicator';
import InvoiceLineItems from './InvoiceLineItems';
import ConfirmModal from './ConfirmModal';

interface InvoiceEditorProps {
  invoice?: Partial<Invoice>;
  items?: InvoiceItem[];
  customers: Customer[];
  onSave: (invoice: Partial<Invoice>, items: InvoiceItem[]) => void;
  onSend?: (invoiceId: string) => void;
  onConvertToOrder?: (invoiceId: string) => void;
  onConvertToInvoice?: (invoiceId: string) => void;
  onReissue?: (invoiceId: string) => void;
  onClose?: () => void;
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
  onClose,
}) => {
  const company = useMemo(() => getCompanyProfile(), []);

  const {
    register,
    setValue,
    watch,
    getValues,
    control,
  } = useForm<{
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
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
      buyerName: initialInvoice?.buyerName || '',
      buyerAddress: initialInvoice?.buyerAddress || '',
      salutation: initialInvoice?.salutation || '',
      introText: (initialInvoice as any)?.introText || '',
      servicePeriodStart: (initialInvoice as any)?.servicePeriodStart
        ? new Date((initialInvoice as any).servicePeriodStart).toISOString().substring(0, 10)
        : '',
      servicePeriodEnd: (initialInvoice as any)?.servicePeriodEnd
        ? new Date((initialInvoice as any).servicePeriodEnd).toISOString().substring(0, 10)
        : '',
      depositPercent:
        typeof (initialInvoice as any)?.depositPercent === 'number' ? (initialInvoice as any).depositPercent : 0,
      depositText: (initialInvoice as any)?.depositText || '',
      depositEnabled: (() => {
        const explicit = (initialInvoice as any)?.depositEnabled;
        if (typeof explicit === 'boolean') return explicit;
        const hasLegacyDeposit =
          typeof (initialInvoice as any)?.depositPercent === 'number' &&
          Number((initialInvoice as any)?.depositPercent) > 0 &&
          Boolean(String((initialInvoice as any)?.depositText || '').trim());
        return Boolean(initialInvoice?.id && hasLegacyDeposit);
      })(),
      depositReceivedEnabled: Boolean((initialInvoice as any)?.depositReceivedEnabled),
      depositReceivedAmount:
        typeof (initialInvoice as any)?.depositReceivedAmount === 'number'
          ? Number((initialInvoice as any).depositReceivedAmount)
          : 0,
      paymentTerms: initialInvoice?.paymentTerms || '',
      paymentInfo: initialInvoice?.paymentInfo || '',
      paypalText: (initialInvoice as any)?.paypalText || '',
      footerText: (initialInvoice as any)?.footerText || '',
      taxNote: (initialInvoice as any)?.taxNote || '',
      agbText: (initialInvoice as any)?.agbText || '',
      agbLink: (initialInvoice as any)?.agbLink || '',
      items: initialItems.length > 0 ? initialItems : [{ id: 'temp_1', invoiceId: '', name: '', orderIndex: 0, unitPrice: 0, quantity: 1, taxPercent: 0, unit: 'Stück', createdAt: Date.now() }],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'items',
    keyName: 'rhfId',
  });

  const dirtyBaselineRef = useRef<string>('');
  const dirtyInitializedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const depositReceivedAmountRef = useRef<HTMLInputElement | null>(null);

  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } | null>(null);

  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsWrapRef = useRef<HTMLDivElement | null>(null);

  const requestConfirm = (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }) => {
    setConfirmModal(opts);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  };

  useEffect(() => {
    if (!moreActionsOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = moreActionsWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setMoreActionsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreActionsOpen(false);
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moreActionsOpen]);

  // Beleg-Daten
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(initialInvoice?.invoiceType || 'Angebot');
  const [state, setState] = useState<InvoiceState>(initialInvoice?.state || 'entwurf');

  // Kunde
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialInvoice?.companyId || ''
  );

  const invoiceNo = watch('invoiceNo');
  const invoiceDate = watch('invoiceDate');
  const dueDate = watch('dueDate');
  const currency = watch('currency');
  const buyerName = watch('buyerName');
  const buyerAddress = watch('buyerAddress');
  const salutation = watch('salutation');
  const introText = watch('introText');
  const servicePeriodStart = watch('servicePeriodStart');
  const servicePeriodEnd = watch('servicePeriodEnd');
  const depositPercent = watch('depositPercent');
  const depositText = watch('depositText');
  const depositEnabled = watch('depositEnabled');
  const depositReceivedEnabled = watch('depositReceivedEnabled');
  const depositReceivedAmount = watch('depositReceivedAmount');
  const paymentTerms = watch('paymentTerms');
  const paymentInfo = watch('paymentInfo');
  const paypalText = watch('paypalText');
  const footerText = watch('footerText');
  const taxNote = watch('taxNote');
  const agbText = watch('agbText');
  const agbLink = watch('agbLink');

  // Text / Zeitraum / Anzahlung
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

  // Template
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [layoutId, setLayoutId] = useState<string>((initialInvoice as any)?.layoutId || getDefaultInvoiceLayoutId(invoiceType));
  const [linkedPayments, setLinkedPayments] = useState<Payment[]>([]);
  const [linkedPaymentsLoading, setLinkedPaymentsLoading] = useState(false);

  const layout = useMemo(() => getInvoiceLayout(layoutId), [layoutId]);
  const subtotalProfile = useMemo(() => getActiveSubTotalInvoiceTypeProfile(invoiceType), [invoiceType]);
  // Default editor shows quantity/unit/unitPrice and hides tax.
  const showQty = subtotalProfile ? (subtotalProfile.show.quantity ?? true) : true;
  const showUnit = subtotalProfile ? (subtotalProfile.show.unit ?? true) : true;
  const showUnitPrice = subtotalProfile ? (subtotalProfile.show.unitPrice ?? true) : true;
  const showTax = subtotalProfile ? (subtotalProfile.show.tax ?? false) : false;
  const showLineTotal = subtotalProfile ? (subtotalProfile.show.lineTotal ?? true) : true;

  const resolvePlaceholders = (s: string) => {
    const name = buyerName?.trim() || '{{name}}';
    const validUntil = (() => {
      try {
        const base = new Date(invoiceDate);
        base.setDate(base.getDate() + 7);
        return base.toLocaleDateString('de-DE');
      } catch {
        return '';
      }
    })();
    return String(s || '')
      .replaceAll('{{name}}', name)
      .replaceAll('{{client}}', name)
      .replaceAll('{client}', name)
      .replaceAll('{{paypalMeUrl}}', company.paypalMeUrl)
      .replaceAll('{{agbsUrl}}', company.agbsUrl)
      .replaceAll('{{validUntil}}', validUntil);
  };

  const applyLayoutDefaults = (opts?: { force?: boolean }) => {
    const d = layout.defaultsByType[invoiceType];
    const force = Boolean(opts?.force);
    if (force || !String(getValues('introText') || '').trim()) setValue('introText', resolvePlaceholders(d.introText));
    if (force || !String(getValues('paymentTerms') || '').trim()) setValue('paymentTerms', d.paymentTerms);
    if (force || !String(getValues('paymentInfo') || '').trim()) setValue('paymentInfo', d.paymentInfo);
    if (force || !String(getValues('paypalText') || '').trim()) setValue('paypalText', resolvePlaceholders(d.paypalText));
    if (force || !String(getValues('footerText') || '').trim()) setValue('footerText', d.footerText);
    if (force || !String(getValues('taxNote') || '').trim()) setValue('taxNote', d.taxNote);
    if (force || !String(getValues('agbText') || '').trim()) setValue('agbText', resolvePlaceholders(d.agbText));
    if (force || !String(getValues('agbLink') || '').trim()) setValue('agbLink', template?.defaultAgbLink || getValues('agbLink') || '');
    if (force || !depositPercent) setDepositPercent(typeof d.depositPercent === 'number' ? d.depositPercent : 0);
    if (force || !String(getValues('depositText') || '').trim()) setValue('depositText', resolvePlaceholders(d.depositText || company.depositNote || ''));
    if ((force || !dueDate) && typeof d.dueDays === 'number' && d.dueDays > 0) {
      const base = new Date(invoiceDate);
      base.setDate(base.getDate() + d.dueDays);
      setValue('dueDate', base.toISOString().substring(0, 10));
    }
  };

  const buildDirtySnapshot = () => {
    return JSON.stringify({
      invoiceType,
      invoiceNo,
      invoiceDate,
      dueDate,
      state,
      currency,
      selectedCustomerId,
      buyerName,
      buyerAddress,
      salutation,
      introText,
      servicePeriodStart,
      servicePeriodEnd,
      depositPercent,
      depositText,
      depositEnabled,
      depositReceivedEnabled,
      depositReceivedAmount,
      paymentTerms,
      paymentInfo,
      paypalText,
      footerText,
      taxNote,
      agbText,
      agbLink,
      layoutId,
      items: fields.map((it) => ({
        id: it.id,
        name: it.name,
        unit: it.unit,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        taxPercent: it.taxPercent,
      })),
    });
  };

  // Summen
  const calculateTotals = () => {
    let subtotal = 0;
    let tax = 0;

    fields.forEach((item) => {
      const itemTotal = item.unitPrice * item.quantity;
      subtotal += itemTotal;
      tax += itemTotal * (item.taxPercent / 100);
    });

    const total = subtotal + tax;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  };

  const totals = useMemo(() => calculateTotals(), [fields]);
  const isDepositSupportedType = invoiceType === 'Angebot' || invoiceType === 'Auftrag';
  const depositAmountPreview =
    isDepositSupportedType && depositEnabled && depositPercent > 0
      ? Math.round((totals.total * (depositPercent / 100)) * 100) / 100
      : 0;
  const grandTotalPreview = Math.round((totals.total + (depositText && depositAmountPreview > 0 ? depositAmountPreview : 0)) * 100) / 100;
  const linkedPaymentsTotal = useMemo(
    () => linkedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [linkedPayments]
  );
  const hasBuyerName = buyerName.trim().length > 0;
  const hasBuyerAddress = buyerAddress.trim().length > 0;
  const canSave = hasBuyerName && hasBuyerAddress;
  const hasAdvancedTextBlocks = layout.editorBlocks.some(
    (block) => block === 'payment' || block === 'paypal' || block === 'taxNote' || block === 'agbLink' || block === 'footer'
  );

  useEffect(() => {
    let cancelled = false;
    const invoiceId = String(initialInvoice?.id || '').trim();
    if (!invoiceId) {
      setLinkedPayments([]);
      setLinkedPaymentsLoading(false);
      return;
    }
    setLinkedPaymentsLoading(true);
    getPaymentsByInvoice(invoiceId)
      .then((rows) => {
        if (cancelled) return;
        setLinkedPayments(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setLinkedPayments([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLinkedPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialInvoice?.id]);

  // Template laden bei Typ-Änderung
  useEffect(() => {
    const loadTemplate = async () => {
      const tpl = await fetchInvoiceTemplate(invoiceType);
      if (tpl) {
        setTemplate(tpl);
        setLayoutId((cur) => (initialInvoice?.id ? cur : (cur || tpl.layoutId || getDefaultInvoiceLayoutId(invoiceType))));
        if (!(initialInvoice as any)?.introText) {
          setValue('introText', resolvePlaceholders(tpl.defaultIntroText || ''));
        }
        if (!initialInvoice?.paymentTerms) {
          setValue('paymentTerms', tpl.defaultPaymentTerms);
        }
        if (!initialInvoice?.paymentInfo) {
          setValue('paymentInfo', tpl.defaultPaymentInfo);
        }
        if (!(initialInvoice as any)?.paypalText) {
          setValue('paypalText', resolvePlaceholders(tpl.defaultPaypalText || ''));
        }
        if (!(initialInvoice as any)?.footerText) {
          setValue('footerText', tpl.defaultFooterText);
        }
        if (!(initialInvoice as any)?.taxNote) {
          setValue('taxNote', tpl.defaultTaxNote);
        }
        if (!(initialInvoice as any)?.agbText) {
          setValue('agbText', resolvePlaceholders(tpl.defaultAgbText || ''));
        }
        if (!(initialInvoice as any)?.agbLink) {
          setValue('agbLink', tpl.defaultAgbLink);
        }
        if (typeof (initialInvoice as any)?.depositPercent !== 'number' && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setDepositPercent(typeof tpl.defaultDepositPercent === 'number' ? tpl.defaultDepositPercent : 0);
        }
        if (!(initialInvoice as any)?.depositText && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setValue('depositText', resolvePlaceholders(tpl.defaultDepositText || company.depositNote || ''));
        }
        if (!initialInvoice?.dueDate) {
          const d = layout.defaultsByType[invoiceType]?.dueDays;
          if (typeof d === 'number' && d > 0 && !dueDate) {
            const base = new Date(invoiceDate);
            base.setDate(base.getDate() + d);
            setValue('dueDate', base.toISOString().substring(0, 10));
          }
        }
      }
    };

    loadTemplate();
  }, [invoiceType]);

  // Initialize dirty baseline once we have a template (defaults filled) and initial customer fill ran.
  useEffect(() => {
    if (dirtyInitializedRef.current) return;
    if (!template) return;
    dirtyBaselineRef.current = buildDirtySnapshot();
    dirtyInitializedRef.current = true;
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Recompute dirty after edits.
  useEffect(() => {
    if (!dirtyInitializedRef.current) return;
    const next = buildDirtySnapshot();
    setIsDirty(next !== dirtyBaselineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoiceType,
    invoiceNo,
    invoiceDate,
    dueDate,
    state,
    currency,
    selectedCustomerId,
    buyerName,
    buyerAddress,
    salutation,
    introText,
    servicePeriodStart,
    servicePeriodEnd,
    depositPercent,
    depositText,
    depositEnabled,
    depositReceivedEnabled,
    depositReceivedAmount,
    paymentTerms,
    paymentInfo,
    paypalText,
    footerText,
    taxNote,
    agbText,
    agbLink,
    layoutId,
    fields,
  ]);

  // Warn on tab close / reload when there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Kunde-Änderung
  useEffect(() => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (customer && !initialInvoice?.buyerName) {
      setValue('buyerName', `${customer.firstName} ${customer.lastName}`);
      setValue(
        'buyerAddress',
        `${customer.address.street}\n${customer.address.zipCode} ${customer.address.city}\n${customer.address.country}`
      );
      setValue('salutation', customer.salutation || '');
    }
  }, [selectedCustomerId, customers, initialInvoice]);

  // Position hinzufügen
  const addPosition = () => {
    append({
      id: `temp_${Date.now()}`,
      invoiceId: '',
      name: '',
      orderIndex: fields.length,
      unitPrice: 0,
      quantity: 1,
      taxPercent: 0,
      unit: 'Stück',
      createdAt: Date.now(),
    } as InvoiceItem);
  };

  // Position entfernen (index-based für useFieldArray)
  const removePosition = (index: number) => {
    if (fields.length === 1) {
      setInlineStatus({ tone: 'error', text: 'Mindestens eine Position ist erforderlich.' });
      return;
    }
    setInlineStatus(null);
    remove(index);
  };

  // Position aktualisieren (index-based für useFieldArray)
  const updatePosition = (index: number, field: keyof InvoiceItem, value: any) => {
    const current = fields[index] as InvoiceItem;
    update(index, { ...current, [field]: value });
  };

  const buildInvoiceData = (): Partial<Invoice> => ({
    invoiceType,
    invoiceNo,
    invoiceDate: new Date(invoiceDate).getTime(),
    dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
    currency,
    state,
    companyId: selectedCustomerId,
    buyerName,
    buyerAddress,
    salutation,
    introText,
    servicePeriodStart: servicePeriodStart ? new Date(servicePeriodStart).getTime() : undefined,
    servicePeriodEnd: servicePeriodEnd ? new Date(servicePeriodEnd).getTime() : undefined,
    depositPercent,
    depositText,
    depositEnabled,
    depositReceivedEnabled,
    depositReceivedAmount,
    paymentTerms,
    paymentInfo,
    paypalText,
    footerText,
    taxNote,
    agbText,
    agbLink,
    layoutId,
  });

  const autoSaveData = useMemo(
    () => ({ invoiceData: buildInvoiceData(), items: fields as InvoiceItem[] }),
    [
      invoiceType,
      invoiceNo,
      invoiceDate,
      dueDate,
      currency,
      state,
      selectedCustomerId,
      buyerName,
      buyerAddress,
      salutation,
      introText,
      servicePeriodStart,
      servicePeriodEnd,
      depositPercent,
      depositText,
      depositEnabled,
      depositReceivedEnabled,
      depositReceivedAmount,
      paymentTerms,
      paymentInfo,
      paypalText,
      footerText,
      taxNote,
      agbText,
      agbLink,
      layoutId,
      fields,
    ]
  );

  const { saveState } = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      onSave(data.invoiceData, data.items);
      dirtyBaselineRef.current = buildDirtySnapshot();
      setIsDirty(false);
    },
    isDirty,
    condition: state === 'entwurf' && canSave,
    delay: 1500,
  });

  // Speichern
  const handleSave = async () => {
    setShowValidationErrors(true);
    if (!canSave) {
      setInlineStatus({ tone: 'error', text: 'Bitte Name und Adresse im Kundenblock ausfüllen.' });
      return;
    }
    setInlineStatus(null);

    // Soft-Warnung: Alle Positionen haben Preis 0 (aber Beleg hat Inhalt)
    const hasNamedItems = fields.some((it: any) => it.name.trim().length > 0);
    const allZeroPrice = fields.every((it: any) => !it.unitPrice || it.unitPrice === 0);
    if (hasNamedItems && allZeroPrice) {
      const ok = await requestConfirm({
        title: 'Speichern bestätigen',
        message: '⚠️ Alle Positionen haben den Preis 0,00 €.\n\nTrotzdem speichern?',
        confirmLabel: 'Trotzdem speichern',
        cancelLabel: 'Abbrechen',
        danger: false,
      });
      if (!ok) return;
    }

    onSave(buildInvoiceData(), fields as InvoiceItem[]);
    dirtyBaselineRef.current = buildDirtySnapshot();
    setIsDirty(false);
  };

  // PDF exportieren
  const buildInvoiceForExport = (): Invoice => {
    return {
      id: initialInvoice?.id || 'temp',
      invoiceType,
      invoiceNo,
      companyId: selectedCustomerId,
      invoiceDate: new Date(invoiceDate).getTime(),
      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      currency,
      state,
      buyerName,
      buyerAddress,
      salutation,
      introText,
      servicePeriodStart: servicePeriodStart ? new Date(servicePeriodStart).getTime() : undefined,
      servicePeriodEnd: servicePeriodEnd ? new Date(servicePeriodEnd).getTime() : undefined,
      depositPercent,
      depositText,
      depositEnabled,
      depositReceivedEnabled,
      depositReceivedAmount,
      paymentTerms,
      paymentInfo,
      paypalText,
      footerText,
      taxNote,
      agbText,
      agbLink,
      layoutId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  };

  const handleDownloadHtml = async () => {
    if (!template) {
      setInlineStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }

    try {
      await downloadInvoicePDF(buildInvoiceForExport(), fields as InvoiceItem[], template);
      setInlineStatus(null);
    } catch (error) {
      console.error('PDF Export fehlgeschlagen:', error);
      setInlineStatus({ tone: 'error', text: 'HTML/PDF Export fehlgeschlagen. Bitte erneut versuchen.' });
    }
  };

  // PDF öffnen
  const handlePreviewPdf = async () => {
    if (!template) {
      setInlineStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }

    try {
      await openInvoicePreview(buildInvoiceForExport(), fields as InvoiceItem[], template);
      setInlineStatus(null);
    } catch (error) {
      console.error('PDF Öffnen fehlgeschlagen:', error);
      setInlineStatus({ tone: 'error', text: 'PDF Vorschau konnte nicht geöffnet werden.' });
    }
  };

  const handleSavePdf = async () => {
    if (!template) {
      setInlineStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }
    try {
      await saveInvoicePdfViaPrintDialog(buildInvoiceForExport(), fields as InvoiceItem[], template);
      setInlineStatus(null);
    } catch (error) {
      console.error('PDF Speichern fehlgeschlagen:', error);
      setInlineStatus({ tone: 'error', text: 'PDF Speichern fehlgeschlagen.' });
    }
  };

  const handleMailCustomer = async () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const toEmail = (customer?.email || '').trim();
    if (!toEmail) {
      setInlineStatus({ tone: 'error', text: 'Keine Kunden-E-Mail hinterlegt. Bitte Kundenprofil ergänzen.' });
      return;
    }
    try {
      const result = await openInvoiceCompose({
        invoice: buildInvoiceForExport(),
        toEmail,
        customerName: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || buyerName,
        preferGmail: true,
      });
      if (result.type === 'sent' || result.type === 'warning') {
        setInlineStatus({ tone: 'info', text: result.message });
      } else if (result.type === 'fallback') {
        const ok = await requestConfirm({
          title: 'SMTP-Versand fehlgeschlagen',
          message: `${result.error}\n\nStattdessen Entwurf im Browser öffnen?`,
          confirmLabel: 'Browser öffnen',
          cancelLabel: 'Abbrechen',
        });
        if (ok) {
          const url = result.preferGmail === false ? result.links.mailtoUrl : result.links.gmailUrl;
          const win = window.open(url, '_blank');
          if (!win) window.location.href = url;
        }
      } else if (result.type === 'opened') {
        setInlineStatus({ tone: 'info', text: 'Mail-Entwurf im Browser geöffnet.' });
      }
    } catch (e) {
      console.error('Mail Draft fehlgeschlagen:', e);
      setInlineStatus({ tone: 'error', text: 'Mail-Entwurf konnte nicht geöffnet werden.' });
    }
  };

  // Status Badge
  const getStatusBadge = () => {
    const colors = {
      entwurf: 'bg-gray-100 text-gray-800',
      gesendet: 'bg-blue-100 text-blue-800',
      angenommen: 'bg-green-100 text-green-800',
      storniert: 'bg-red-100 text-red-800',
      archiviert: 'bg-slate-200 text-slate-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[state]}`}>
        {state.charAt(0).toUpperCase() + state.slice(1)}
      </span>
    );
  };

  const baseButtonClass = 'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const primaryButtonClass = `${baseButtonClass} bg-slate-900 text-white hover:bg-slate-800`;
  const secondaryButtonClass = `${baseButtonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

  const workflowActionLabel = useMemo(() => {
    if (!initialInvoice?.id) return undefined;
    if (invoiceType === 'Angebot' && onConvertToOrder) return 'Als Auftrag fortführen';
    if (invoiceType === 'Auftrag' && onConvertToInvoice) return 'Als Rechnung fortführen';
    return undefined;
  }, [initialInvoice?.id, invoiceType, onConvertToOrder, onConvertToInvoice]);

  const handleWorkflowAdvance = () => {
    if (!initialInvoice?.id) return;
    if (invoiceType === 'Angebot' && onConvertToOrder) {
      onConvertToOrder(initialInvoice.id);
      return;
    }
    if (invoiceType === 'Auftrag' && onConvertToInvoice) {
      onConvertToInvoice(initialInvoice.id);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          danger={confirmModal.danger}
          onConfirm={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(true);
          }}
          onCancel={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(false);
          }}
        />
      )}
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Beleg Editor</h2>
          <div className="flex items-center gap-3">
            <AutoSaveIndicator state={saveState} />
            {getStatusBadge()}
            {onClose && (
              <button
                onClick={async () => {
                  if (isDirty) {
                    const ok = await requestConfirm({
                      title: 'Änderungen verwerfen?',
                      message: 'Ungespeicherte Änderungen verwerfen und schließen?',
                      confirmLabel: 'Verwerfen',
                      cancelLabel: 'Abbrechen',
                      danger: true,
                    });
                    if (!ok) return;
                  }
                  onClose();
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                title="Schließen"
              >
                <X size={16} aria-hidden="true" />
                Schließen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {inlineStatus && (
          <div
            className={[
              'mb-4 rounded-md border px-3 py-2 text-sm',
              inlineStatus.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-slate-200 bg-slate-50 text-slate-700',
            ].join(' ')}
          >
            {inlineStatus.text}
          </div>
        )}

        {/* Beleg-Info */}
        <div className="mb-6 grid grid-cols-5 gap-4">
          {/* Typ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-type">Typ</label>
            <select
              id="invoice-type"
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
              disabled={!!initialInvoice?.id}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="Angebot">Angebot</option>
              <option value="Auftrag">Auftrag</option>
              <option value="Rechnung">Rechnung</option>
            </select>
          </div>

          {/* Belegnummer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-no">Belegnummer</label>
            <input
              id="invoice-no"
              type="text"
              value={invoiceNo}
              onChange={(e) => setValue('invoiceNo', e.target.value)}
              disabled={!!initialInvoice?.id}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="2025001"
            />
          </div>

          {/* Layout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-layout">PDF Layout</label>
            <div className="flex items-center gap-2">
              <select
                id="invoice-layout"
                value={layoutId}
                onChange={(e) => setLayoutId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {INVOICE_LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                title="Setzt Default-Texte fuer dieses Layout (Zahlung, Footer, etc.)"
                onClick={async () => {
                  const ok = await requestConfirm({
                    title: 'Default-Texte anwenden?',
                    message: 'Default-Texte fuer dieses Layout anwenden?\n\nBestehende Texte werden ueberschrieben.',
                    confirmLabel: 'Anwenden',
                    cancelLabel: 'Abbrechen',
                    danger: false,
                  });
                  if (!ok) return;
                  applyLayoutDefaults({ force: true });
                }}
              >
                Default-Texte anwenden
              </button>
            </div>
          </div>

          {/* Datum */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-date">Datum</label>
            <input
              id="invoice-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setValue('invoiceDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Fälligkeit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-due">Fälligkeit</label>
            <input
              id="invoice-due"
              type="date"
              value={dueDate}
              onChange={(e) => setValue('dueDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Kunde */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Kunde</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-customer">Kunde wählen</label>
              <select
                id="invoice-customer"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Kunde wählen --</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.lastName}, {customer.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-salutation">Anrede</label>
              <select
                id="invoice-salutation"
                value={salutation}
                onChange={(e) => setValue('salutation', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Keine --</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Divers">Divers</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-buyer-name">Name</label>
            <input
              id="invoice-buyer-name"
              type="text"
              value={buyerName}
              onChange={(e) => {
                setValue('buyerName', e.target.value);
                if (showValidationErrors) setInlineStatus(null);
              }}
              className={[
                'w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
                showValidationErrors && !hasBuyerName ? 'border-red-300 bg-red-50' : 'border-gray-300',
              ].join(' ')}
              placeholder="Max Mustermann"
            />
            {showValidationErrors && !hasBuyerName && (
              <p className="mt-1 text-xs text-red-600">Name ist ein Pflichtfeld.</p>
            )}
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-buyer-address">Adresse</label>
            <textarea
              id="invoice-buyer-address"
              value={buyerAddress}
              onChange={(e) => {
                setValue('buyerAddress', e.target.value);
                if (showValidationErrors) setInlineStatus(null);
              }}
              rows={3}
              className={[
                'w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
                showValidationErrors && !hasBuyerAddress ? 'border-red-300 bg-red-50' : 'border-gray-300',
              ].join(' ')}
              placeholder="Musterstraße 1&#10;12345 Musterstadt&#10;Deutschland"
            />
            {showValidationErrors && !hasBuyerAddress && (
              <p className="mt-1 text-xs text-red-600">Adresse ist ein Pflichtfeld.</p>
            )}
          </div>
        </div>

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
            <textarea
              id="invoice-intro"
              value={introText}
              onChange={(e) => setValue('introText', e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Hallo ...\n\nWie besprochen ...\n\nBesten Dank!"
            />
          </div>
        )}

        {/* Mietzeitraum */}
        {layout.editorBlocks.includes('servicePeriod') && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Mietzeitraum (optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-period-start">Von</label>
                <input
                  id="invoice-period-start"
                  type="date"
                  value={servicePeriodStart}
                  onChange={(e) => setValue('servicePeriodStart', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-period-end">Bis</label>
                <input
                  id="invoice-period-end"
                  type="date"
                  value={servicePeriodEnd}
                  onChange={(e) => setValue('servicePeriodEnd', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        <InvoiceLineItems
          items={fields as InvoiceItem[]}
          labels={subtotalProfile?.labels}
          showQty={showQty}
          showUnit={showUnit}
          showUnitPrice={showUnitPrice}
          showTax={showTax}
          showLineTotal={showLineTotal}
          onAdd={addPosition}
          onRemove={removePosition}
          onUpdate={updatePosition}
        />

        {/* Summen */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Zwischensumme:</span>
              <span className="font-medium">{totals.subtotal.toFixed(2)} €</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">USt. (0%):</span>
              <span className="font-medium">{totals.tax.toFixed(2)} €</span>
            </div>

            {isDepositSupportedType && depositEnabled && depositText && depositAmountPreview > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Anzahlung ({depositPercent || 0}%):</span>
                <span className="font-medium">{depositAmountPreview.toFixed(2)} €</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
              <span>Gesamtbetrag:</span>
              <span>{grandTotalPreview.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Anzahlung (optional fuer Angebot/Auftrag) */}
        {isDepositSupportedType && layout.editorBlocks.includes('deposit') && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Anzahlung ({invoiceType})</h3>
            <div className="mb-3">
              <button
                type="button"
                title="Anzahlungsblock ein- oder ausblenden"
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
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  depositEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
                aria-pressed={depositEnabled ? 'true' : 'false'}
              >
                {depositEnabled ? 'Anzahlung aktiv' : 'Anzahlung aktivieren'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-deposit-percent">Prozent</label>
                <input
                  id="invoice-deposit-percent"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value))}
                  disabled={!depositEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-deposit-text">Text</label>
                <input
                  id="invoice-deposit-text"
                  type="text"
                  value={depositText}
                  onChange={(e) => setValue('depositText', e.target.value)}
                  disabled={!depositEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Anzahlung 50 % nach Angebotsannahme"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Optional: Wird im PDF als zusätzliche Zeile in der Tabelle angezeigt (Betrag = Gesamt * Prozent).
            </p>
          </div>
        )}

        {hasAdvancedTextBlocks && (
          <details className="mb-6 rounded-lg border border-slate-200 bg-slate-50/70">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800">
              Erweiterte Texte &amp; Bedingungen
            </summary>
            <div className="space-y-6 border-t border-slate-200 bg-white px-4 py-4">
              {/* Zahlungsbedingungen */}
              {layout.editorBlocks.includes('payment') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Zahlungsbedingungen</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-payment-terms">Bedingungen</label>
                    <textarea
                      id="invoice-payment-terms"
                      value={paymentTerms}
                      onChange={(e) => setValue('paymentTerms', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-payment-info">Zahlungsinfo (optional)</label>
                    <input
                      id="invoice-payment-info"
                      type="text"
                      value={paymentInfo}
                      onChange={(e) => setValue('paymentInfo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="PayPal: https://paypal.me/..."
                    />
                  </div>
                </div>
              )}

              {layout.editorBlocks.includes('paypal') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">PayPal Zeile</h3>
                  <input
                    id="invoice-paypal-text"
                    type="text"
                    value={paypalText}
                    onChange={(e) => setValue('paypalText', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder={`Zahlungslink Paypal ${company.paypalMeUrl}`}
                  />
                </div>
              )}

              {layout.editorBlocks.includes('taxNote') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Steuerhinweis</h3>
                  <textarea
                    id="invoice-tax-note"
                    value={taxNote}
                    onChange={(e) => setValue('taxNote', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              )}

              {layout.editorBlocks.includes('agbLink') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Links</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-agb-text">AGB Text (wie im PDF)</label>
                    <input
                      id="invoice-agb-text"
                      type="text"
                      value={agbText}
                      onChange={(e) => setValue('agbText', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={`Bitte beachten Sie die gültigen AGBs auf meiner Homepage : ${company.agbsUrl}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-agb-link">AGB Link</label>
                    <input
                      id="invoice-agb-link"
                      type="text"
                      value={agbLink}
                      onChange={(e) => setValue('agbLink', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              )}

              {layout.editorBlocks.includes('footer') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Footer / Hinweis</h3>
                  <textarea
                    id="invoice-footer"
                    value={footerText}
                    onChange={(e) => setValue('footerText', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              )}
            </div>
          </details>
        )}

        {/* Footer Buttons */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 pb-4 pt-4 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSave}
              className={primaryButtonClass}
              title="Beleg speichern"
              disabled={!canSave}
            >
              <Save size={14} aria-hidden="true" />
              Speichern
            </button>

            {onSend && initialInvoice?.id && state === 'entwurf' && (
              <button
                onClick={() => onSend(initialInvoice.id!)}
                className={secondaryButtonClass}
                title="Belegstatus auf gesendet setzen"
              >
                <Send size={14} aria-hidden="true" />
                Senden
              </button>
            )}

            {invoiceType === 'Rechnung' && (
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setDepositReceivedEnabled((v) => {
                      const next = !v;
                      if (next) {
                        setTimeout(() => depositReceivedAmountRef.current?.focus(), 0);
                      }
                      return next;
                    });
                  }}
                  className={`px-2 py-1 rounded text-sm border ${
                    depositReceivedEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                  aria-pressed={depositReceivedEnabled ? 'true' : 'false'}
                  title="Fuegt in der Rechnung einen Hinweis hinzu, dass die Kaution dankend erhalten wurde."
                >
                  Kautionsbestaetigung
                </button>
                <input
                  ref={depositReceivedAmountRef}
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="Wert"
                  value={depositReceivedAmount || ''}
                  onChange={(e) => setDepositReceivedAmount(Number(e.target.value))}
                  disabled={!depositReceivedEnabled}
                  aria-label="Kaution Wert in Euro"
                />
              </div>
            )}

            <button
              onClick={handlePreviewPdf}
              className={secondaryButtonClass}
              title="PDF Vorschau öffnen"
              disabled={!template}
            >
              <Eye size={14} aria-hidden="true" />
              PDF ansehen
            </button>

            <div className="relative" ref={moreActionsWrapRef}>
              <button
                type="button"
                onClick={() => setMoreActionsOpen((v) => !v)}
                className={secondaryButtonClass}
                title="Weitere Aktionen"
                aria-haspopup="menu"
                aria-expanded={moreActionsOpen ? 'true' : 'false'}
              >
                Mehr Aktionen
                <ChevronDown size={14} aria-hidden="true" />
              </button>

              {moreActionsOpen && (
                <div
                  className="absolute left-0 bottom-full mb-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      void handleSavePdf();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!template}
                    title="PDF lokal speichern"
                  >
                    <FileText size={14} aria-hidden="true" />
                    PDF speichern
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      void handleMailCustomer();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!template}
                    title="Öffnet Gmail-Entwurf (PDF bitte über 'PDF speichern' erstellen und anhängen)."
                  >
                    <Mail size={14} aria-hidden="true" />
                    Mail
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      handleDownloadHtml();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!template}
                    title="Optional: druckbare HTML-Datei herunterladen"
                  >
                    <Download size={14} aria-hidden="true" />
                    HTML herunterladen
                  </button>

                  {invoiceType === 'Rechnung' && onReissue && initialInvoice?.id && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreActionsOpen(false);
                        onReissue(initialInvoice.id!);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      title="Storniert die alte Rechnung und erstellt einen Folgebeleg mit Suffix -2/-3/..."
                    >
                      Rechnung neu generieren
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {initialInvoice?.id && (
              <InvoiceWorkflowBar
                currentType={invoiceType}
                nextActionLabel={workflowActionLabel}
                onAdvance={handleWorkflowAdvance}
              />
            )}

            
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
