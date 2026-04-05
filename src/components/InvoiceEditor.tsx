/**
 * InvoiceEditor Component
 * Einheitliche UI für Angebot, Auftrag, Rechnung
 * SubTotal-ähnlicher Workflow
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { Invoice, InvoiceItem, InvoiceType, InvoiceState, Customer, InvoiceTemplate } from '../types';
import { fetchInvoiceTemplate } from '../services/invoiceService';
import { downloadInvoicePDF, openInvoicePreview, saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { INVOICE_LAYOUTS, getDefaultInvoiceLayoutId, getInvoiceLayout } from '../config/invoiceLayouts';
import { getCompanyProfile } from '../config/companyProfile';
import { openInvoiceCompose } from '../services/invoiceEmailService';
import { getActiveSubTotalInvoiceTypeProfile } from '../services/subtotalInvoiceTypeProfileService';

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

  const totals = calculateTotals();
  const isDepositSupportedType = invoiceType === 'Angebot' || invoiceType === 'Auftrag';
  const depositAmountPreview =
    isDepositSupportedType && depositEnabled && depositPercent > 0
      ? Math.round((totals.total * (depositPercent / 100)) * 100) / 100
      : 0;
  const grandTotalPreview = Math.round((totals.total + (depositText && depositAmountPreview > 0 ? depositAmountPreview : 0)) * 100) / 100;

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
      alert('Mindestens eine Position erforderlich');
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  // Position aktualisieren
  const updatePosition = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Speichern
  const handleSave = () => {
    if (!buyerName || !buyerAddress) {
      alert('Bitte Kundendaten ausfüllen');
      return;
    }

    const invoiceData: Partial<Invoice> = {
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
    };

    onSave(invoiceData, items);
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
      alert('Template nicht geladen');
      return;
    }

    try {
      await downloadInvoicePDF(buildInvoiceForExport(), items, template);
    } catch (error) {
      console.error('PDF Export fehlgeschlagen:', error);
      alert('PDF Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    }
  };

  // PDF öffnen
  const handlePreviewPdf = async () => {
    if (!template) {
      alert('Template nicht geladen');
      return;
    }

    try {
      await openInvoicePreview(buildInvoiceForExport(), items, template);
    } catch (error) {
      console.error('PDF Öffnen fehlgeschlagen:', error);
      alert('PDF konnte nicht geöffnet werden.');
    }
  };

  const handleSavePdf = async () => {
    if (!template) {
      alert('Template nicht geladen');
      return;
    }
    try {
      await saveInvoicePdfViaPrintDialog(buildInvoiceForExport(), items, template);
    } catch (error) {
      console.error('PDF Speichern fehlgeschlagen:', error);
      alert('PDF Speichern fehlgeschlagen.');
    }
  };

  const handleMailCustomer = async () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const toEmail = (customer?.email || '').trim();
    if (!toEmail) {
      alert('Keine Kunden-E-Mail hinterlegt. Bitte im Kundenprofil eine E-Mail setzen.');
      return;
    }
    try {
      openInvoiceCompose({
        invoice: buildInvoiceForExport(),
        toEmail,
        customerName: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || buyerName,
        preferGmail: true,
      });
    } catch (e) {
      console.error('Mail Draft fehlgeschlagen:', e);
      alert('Mail konnte nicht geöffnet werden.');
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

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Beleg Editor</h2>
          <div className="flex items-center gap-2">
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
              >
                <span className="sr-only">Schließen</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
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
              onChange={(e) => setBuyerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Max Mustermann"
            />
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-buyer-address">Adresse</label>
            <textarea
              id="invoice-buyer-address"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Musterstraße 1&#10;12345 Musterstadt&#10;Deutschland"
            />
          </div>
        </div>

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

        {/* Zahlungsbedingungen */}
        {layout.editorBlocks.includes('payment') && (
          <div className="mb-6">
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
          <div className="mb-6">
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
          <div className="mb-6">
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
          <div className="mb-6">
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
          <div className="mb-6">
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

        {/* Footer Buttons */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              💾 Speichern
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
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
            >
              👁️ PDF ansehen
            </button>

            <button
              onClick={handleSavePdf}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              📄 PDF speichern
            </button>

            <button
              onClick={handleMailCustomer}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium"
              title="Öffnet Gmail-Entwurf (PDF bitte über 'PDF speichern' erstellen und anhängen)."
            >
              ✉️ Mail
            </button>

            <button
              onClick={handleDownloadHtml}
              className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 font-medium"
              title="Optional: druckbare HTML-Datei herunterladen"
            >
              ⬇️ HTML
            </button>
          </div>

          <div className="flex gap-2">
            {/* Angebot → Auftrag */}
            {invoiceType === 'Angebot' && onConvertToOrder && initialInvoice?.id && (
              <button
                onClick={() => onConvertToOrder(initialInvoice.id!)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
              >
                Angebot → Auftrag
              </button>
            )}

            {/* Angebot → Rechnung */}
            {invoiceType === 'Angebot' && onConvertToInvoice && initialInvoice?.id && (
              <button
                onClick={() => onConvertToInvoice(initialInvoice.id!)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
              >
                Angebot → Rechnung
              </button>
            )}

            {/* Auftrag → Rechnung */}
            {invoiceType === 'Auftrag' && onConvertToInvoice && initialInvoice?.id && (
              <button
                onClick={() => onConvertToInvoice(initialInvoice.id!)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
              >
                Auftrag → Rechnung
              </button>
            )}

            {/* Rechnung neu generieren */}
            {invoiceType === 'Rechnung' && onReissue && initialInvoice?.id && (
              <button
                onClick={() => onReissue(initialInvoice.id!)}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium"
                title="Storniert die alte Rechnung und erstellt einen Folgebeleg mit Suffix -2/-3/..."
              >
                Rechnung neu generieren
              </button>
            )}

            {/* Senden */}
            {onSend && initialInvoice?.id && state === 'entwurf' && (
              <button
                onClick={() => onSend(initialInvoice.id!)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium"
              >
                📧 Senden
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
