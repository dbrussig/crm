/**
 * InvoiceEditor Component
 * Einheitliche UI für Angebot, Auftrag, Rechnung
 * SubTotal-ähnlicher Workflow
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { Download, Eye, FileText, Mail, Save, Send, X } from 'lucide-react';
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

  const dirtyBaselineRef = useRef<string>('');
  const dirtyInitializedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const depositReceivedAmountRef = useRef<HTMLInputElement | null>(null);

  // Beleg-Daten
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(initialInvoice?.invoiceType || 'Angebot');
  const [invoiceNo, setInvoiceNo] = useState<string>(initialInvoice?.invoiceNo || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(
    initialInvoice?.invoiceDate
      ? new Date(initialInvoice.invoiceDate).toISOString().substring(0, 10)
      : new Date().toISOString().substring(0, 10)
  );
  const [dueDate, setDueDate] = useState<string>(
    initialInvoice?.dueDate
      ? new Date(initialInvoice.dueDate).toISOString().substring(0, 10)
      : ''
  );
  const [state, setState] = useState<InvoiceState>(initialInvoice?.state || 'entwurf');
  const [currency, setCurrency] = useState<string>(initialInvoice?.currency || 'EUR');

  // Kunde
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialInvoice?.companyId || ''
  );
  const [buyerName, setBuyerName] = useState<string>(initialInvoice?.buyerName || '');
  const [buyerAddress, setBuyerAddress] = useState<string>(initialInvoice?.buyerAddress || '');
  const [salutation, setSalutation] = useState<string>(initialInvoice?.salutation || '');

  // Text / Zeitraum / Anzahlung
  const [introText, setIntroText] = useState<string>((initialInvoice as any)?.introText || '');
  const [servicePeriodStart, setServicePeriodStart] = useState<string>(
    (initialInvoice as any)?.servicePeriodStart
      ? new Date((initialInvoice as any).servicePeriodStart).toISOString().substring(0, 10)
      : ''
  );
  const [servicePeriodEnd, setServicePeriodEnd] = useState<string>(
    (initialInvoice as any)?.servicePeriodEnd
      ? new Date((initialInvoice as any).servicePeriodEnd).toISOString().substring(0, 10)
      : ''
  );

  const [depositPercent, setDepositPercent] = useState<number>(
    typeof (initialInvoice as any)?.depositPercent === 'number' ? (initialInvoice as any).depositPercent : 0
  );
  const [depositText, setDepositText] = useState<string>((initialInvoice as any)?.depositText || '');
  const [depositEnabled, setDepositEnabled] = useState<boolean>(() => {
    const explicit = (initialInvoice as any)?.depositEnabled;
    if (typeof explicit === 'boolean') return explicit;
    const hasLegacyDeposit =
      typeof (initialInvoice as any)?.depositPercent === 'number' &&
      Number((initialInvoice as any)?.depositPercent) > 0 &&
      Boolean(String((initialInvoice as any)?.depositText || '').trim());
    return Boolean(initialInvoice?.id && hasLegacyDeposit);
  });
  const [depositReceivedEnabled, setDepositReceivedEnabled] = useState<boolean>(
    Boolean((initialInvoice as any)?.depositReceivedEnabled)
  );
  const [depositReceivedAmount, setDepositReceivedAmount] = useState<number>(
    typeof (initialInvoice as any)?.depositReceivedAmount === 'number'
      ? Number((initialInvoice as any).depositReceivedAmount)
      : 0
  );

  // Zahlungsbedingungen
  const [paymentTerms, setPaymentTerms] = useState<string>(
    initialInvoice?.paymentTerms || ''
  );
  const [paymentInfo, setPaymentInfo] = useState<string>(
    initialInvoice?.paymentInfo || ''
  );
  const [paypalText, setPaypalText] = useState<string>((initialInvoice as any)?.paypalText || '');
  const [footerText, setFooterText] = useState<string>((initialInvoice as any)?.footerText || '');
  const [taxNote, setTaxNote] = useState<string>((initialInvoice as any)?.taxNote || '');
  const [agbText, setAgbText] = useState<string>((initialInvoice as any)?.agbText || '');
  const [agbLink, setAgbLink] = useState<string>((initialInvoice as any)?.agbLink || '');

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
    if (force || !introText) setIntroText(resolvePlaceholders(d.introText));
    if (force || !paymentTerms) setPaymentTerms(d.paymentTerms);
    if (force || !paymentInfo) setPaymentInfo(d.paymentInfo);
    if (force || !paypalText) setPaypalText(resolvePlaceholders(d.paypalText));
    if (force || !footerText) setFooterText(d.footerText);
    if (force || !taxNote) setTaxNote(d.taxNote);
    if (force || !agbText) setAgbText(resolvePlaceholders(d.agbText));
    if (force || !agbLink) setAgbLink(template?.defaultAgbLink || agbLink || '');
    if (force || !depositPercent) setDepositPercent(typeof d.depositPercent === 'number' ? d.depositPercent : 0);
    if (force || !depositText) setDepositText(resolvePlaceholders(d.depositText || company.depositNote || ''));
    if ((force || !dueDate) && typeof d.dueDays === 'number' && d.dueDays > 0) {
      const base = new Date(invoiceDate);
      base.setDate(base.getDate() + d.dueDays);
      setDueDate(base.toISOString().substring(0, 10));
    }
  };

  // Positionen
  const [items, setItems] = useState<InvoiceItem[]>(
    initialItems.length > 0 ? initialItems : [{ id: 'temp_1', invoiceId: '', name: '', orderIndex: 0, unitPrice: 0, quantity: 1, taxPercent: 0, unit: 'Stück', createdAt: Date.now() }]
  );

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
      items: items.map((it) => ({
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

    items.forEach((item) => {
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

  const totals = useMemo(() => calculateTotals(), [items]);
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
          setIntroText(resolvePlaceholders(tpl.defaultIntroText || ''));
        }
        if (!initialInvoice?.paymentTerms) {
          setPaymentTerms(tpl.defaultPaymentTerms);
        }
        if (!initialInvoice?.paymentInfo) {
          setPaymentInfo(tpl.defaultPaymentInfo);
        }
        if (!(initialInvoice as any)?.paypalText) {
          setPaypalText(resolvePlaceholders(tpl.defaultPaypalText || ''));
        }
        if (!(initialInvoice as any)?.footerText) {
          setFooterText(tpl.defaultFooterText);
        }
        if (!(initialInvoice as any)?.taxNote) {
          setTaxNote(tpl.defaultTaxNote);
        }
        if (!(initialInvoice as any)?.agbText) {
          setAgbText(resolvePlaceholders(tpl.defaultAgbText || ''));
        }
        if (!(initialInvoice as any)?.agbLink) {
          setAgbLink(tpl.defaultAgbLink);
        }
        if (typeof (initialInvoice as any)?.depositPercent !== 'number' && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setDepositPercent(typeof tpl.defaultDepositPercent === 'number' ? tpl.defaultDepositPercent : 0);
        }
        if (!(initialInvoice as any)?.depositText && (invoiceType === 'Angebot' || invoiceType === 'Auftrag')) {
          setDepositText(resolvePlaceholders(tpl.defaultDepositText || company.depositNote || ''));
        }
        if (!initialInvoice?.dueDate) {
          const d = layout.defaultsByType[invoiceType]?.dueDays;
          if (typeof d === 'number' && d > 0 && !dueDate) {
            const base = new Date(invoiceDate);
            base.setDate(base.getDate() + d);
            setDueDate(base.toISOString().substring(0, 10));
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
    items,
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
      setBuyerName(`${customer.firstName} ${customer.lastName}`);
      setBuyerAddress(
        `${customer.address.street}\n${customer.address.zipCode} ${customer.address.city}\n${customer.address.country}`
      );
      setSalutation(customer.salutation || '');
    }
  }, [selectedCustomerId, customers, initialInvoice]);

  // Position hinzufügen
  const addPosition = () => {
    const newItem: InvoiceItem = {
      id: `temp_${Date.now()}`,
      invoiceId: '',
      name: '',
      orderIndex: items.length,
      unitPrice: 0,
      quantity: 1,
      taxPercent: 0,
      unit: 'Stück',
      createdAt: Date.now(),
    };
    setItems([...items, newItem]);
  };

  // Position entfernen
  const removePosition = (id: string) => {
    if (items.length === 1) {
      setInlineStatus({ tone: 'error', text: 'Mindestens eine Position ist erforderlich.' });
      return;
    }
    setInlineStatus(null);
    setItems(items.filter((item) => item.id !== id));
  };

  // Position aktualisieren
  const updatePosition = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
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
    () => ({ invoiceData: buildInvoiceData(), items }),
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
      items,
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
  const handleSave = () => {
    setShowValidationErrors(true);
    if (!canSave) {
      setInlineStatus({ tone: 'error', text: 'Bitte Name und Adresse im Kundenblock ausfüllen.' });
      return;
    }
    setInlineStatus(null);

    // Soft-Warnung: Alle Positionen haben Preis 0 (aber Beleg hat Inhalt)
    const hasNamedItems = items.some((it) => it.name.trim().length > 0);
    const allZeroPrice = items.every((it) => !it.unitPrice || it.unitPrice === 0);
    if (hasNamedItems && allZeroPrice) {
      const ok = confirm('⚠️ Alle Positionen haben den Preis 0,00 €.\n\nTrotzdem speichern?');
      if (!ok) return;
    }

    onSave(buildInvoiceData(), items);
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
      await downloadInvoicePDF(buildInvoiceForExport(), items, template);
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
      await openInvoicePreview(buildInvoiceForExport(), items, template);
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
      await saveInvoicePdfViaPrintDialog(buildInvoiceForExport(), items, template);
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
      openInvoiceCompose({
        invoice: buildInvoiceForExport(),
        toEmail,
        customerName: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || buyerName,
        preferGmail: true,
      });
      setInlineStatus(null);
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
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Beleg Editor</h2>
          <div className="flex items-center gap-3">
            <AutoSaveIndicator state={saveState} />
            {getStatusBadge()}
            {onClose && (
              <button
                onClick={() => {
                  if (isDirty) {
                    const ok = confirm('Ungespeicherte Änderungen verwerfen und schließen?');
                    if (!ok) return;
                  }
                  onClose();
                }}
                className="text-gray-400 hover:text-gray-500"
                title="Editor schließen"
              >
                <span className="sr-only">Schließen</span>
                <X className="h-6 w-6" aria-hidden="true" />
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
              onChange={(e) => setInvoiceNo(e.target.value)}
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
                onClick={() => {
                  const ok = confirm('Default-Texte fuer dieses Layout anwenden?\n\nBestehende Texte werden ueberschrieben.');
                  if (!ok) return;
                  applyLayoutDefaults({ force: true });
                }}
              >
                Defaults
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
              onChange={(e) => setInvoiceDate(e.target.value)}
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
              onChange={(e) => setDueDate(e.target.value)}
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
                onChange={(e) => setSalutation(e.target.value)}
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
                setBuyerName(e.target.value);
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
                setBuyerAddress(e.target.value);
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
              onChange={(e) => setIntroText(e.target.value)}
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
                  onChange={(e) => setServicePeriodStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-period-end">Bis</label>
                <input
                  id="invoice-period-end"
                  type="date"
                  value={servicePeriodEnd}
                  onChange={(e) => setServicePeriodEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Positionen */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Positionen</h3>
            <button
              onClick={addPosition}
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              title="Neue Position hinzufügen"
            >
              + Position
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
              <div className="col-span-1">#</div>
              <div className="col-span-5">{subtotalProfile?.labels?.description || 'Beschreibung'}</div>
              {showQty && <div className="col-span-2">{subtotalProfile?.labels?.quantity || 'Menge'}</div>}
              {showUnitPrice && <div className="col-span-2">{subtotalProfile?.labels?.unitPrice || 'EP (€)'}</div>}
              <div className="col-span-1"></div>
            </div>

            {/* Positionen */}
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200 items-start">
                <div className="col-span-1 text-sm text-gray-500">{index + 1}</div>

                <div className="col-span-5">
                  <textarea
                    value={item.name}
                    onChange={(e) => updatePosition(item.id, 'name', e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Beschreibung"
                    aria-label={`Position ${index + 1}: Beschreibung`}
                  />
                  <div className="mt-1 flex gap-2">
                    {showUnit && (
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updatePosition(item.id, 'unit', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                        placeholder={subtotalProfile?.labels?.unit || 'Einheit'}
                        aria-label={`Position ${index + 1}: ${subtotalProfile?.labels?.unit || 'Einheit'}`}
                      />
                    )}
                    {showTax && (
                      <input
                        type="number"
                        value={item.taxPercent}
                        onChange={(e) => updatePosition(item.id, 'taxPercent', parseFloat(e.target.value))}
                        step="0.01"
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                        placeholder={subtotalProfile?.labels?.tax || 'USt.'}
                        aria-label={`Position ${index + 1}: ${subtotalProfile?.labels?.tax || 'USt.'}`}
                      />
                    )}
                  </div>
                </div>

                {showQty && (
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updatePosition(item.id, 'quantity', parseFloat(e.target.value))}
                      step="0.01"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      aria-label={`Position ${index + 1}: ${subtotalProfile?.labels?.quantity || 'Menge'}`}
                    />
                  </div>
                )}

                {showUnitPrice && (
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updatePosition(item.id, 'unitPrice', parseFloat(e.target.value))}
                      step="0.01"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      aria-label={`Position ${index + 1}: ${subtotalProfile?.labels?.unitPrice || 'Einzelpreis'}`}
                    />
                  </div>
                )}

                <div className="col-span-1">
                  <button
                    onClick={() => removePosition(item.id)}
                    className="text-red-600 hover:text-red-700"
                    title="Position löschen"
                    aria-label={`Position ${index + 1} löschen`}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {showLineTotal && (
                  <div className="col-span-11 col-start-2 mt-2 text-right text-sm text-gray-600">
                    {subtotalProfile?.labels?.lineTotal || 'Betrag'}: {(item.unitPrice * item.quantity).toFixed(2)} €
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

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
                        setDepositText(resolvePlaceholders(d.depositText || company.depositNote || 'Anzahlung'));
                      }
                    }
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  depositEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
                aria-pressed={depositEnabled}
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
                  onChange={(e) => setDepositText(e.target.value)}
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
                      onChange={(e) => setPaymentTerms(e.target.value)}
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
                      onChange={(e) => setPaymentInfo(e.target.value)}
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
                    onChange={(e) => setPaypalText(e.target.value)}
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
                    onChange={(e) => setTaxNote(e.target.value)}
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
                      onChange={(e) => setAgbText(e.target.value)}
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
                      onChange={(e) => setAgbLink(e.target.value)}
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
                    onChange={(e) => setFooterText(e.target.value)}
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
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className={primaryButtonClass}
              title="Beleg speichern"
              disabled={!canSave}
            >
              <Save size={14} aria-hidden="true" />
              Speichern
            </button>

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
                  aria-pressed={depositReceivedEnabled}
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

            <button
              onClick={handleSavePdf}
              className={secondaryButtonClass}
              title="PDF lokal speichern"
              disabled={!template}
            >
              <FileText size={14} aria-hidden="true" />
              PDF speichern
            </button>

            <button
              onClick={handleMailCustomer}
              className={secondaryButtonClass}
              title="Öffnet Gmail-Entwurf (PDF bitte über 'PDF speichern' erstellen und anhängen)."
              disabled={!template}
            >
              <Mail size={14} aria-hidden="true" />
              Mail
            </button>

            <button
              onClick={handleDownloadHtml}
              className={secondaryButtonClass}
              title="Optional: druckbare HTML-Datei herunterladen"
              disabled={!template}
            >
              <Download size={14} aria-hidden="true" />
              HTML
            </button>
          </div>

          <div className="flex items-center gap-2">
            {initialInvoice?.id && (
              <InvoiceWorkflowBar
                currentType={invoiceType}
                nextActionLabel={workflowActionLabel}
                onAdvance={handleWorkflowAdvance}
              />
            )}

            {/* Rechnung neu generieren */}
            {invoiceType === 'Rechnung' && onReissue && initialInvoice?.id && (
              <button
                onClick={() => onReissue(initialInvoice.id!)}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                title="Storniert die alte Rechnung und erstellt einen Folgebeleg mit Suffix -2/-3/..."
              >
                Rechnung neu generieren
              </button>
            )}

            {/* Senden */}
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
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
