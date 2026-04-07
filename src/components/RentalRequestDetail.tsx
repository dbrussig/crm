/**
 * RentalRequestDetail Component
 * Detail-Ansicht für einen Vorgang
 * Mit allen Actions: Verfügbarkeit prüfen, Angebot erstellen, etc.
 */

import { useState, useEffect } from 'react';
import { RentalRequest, Customer, Invoice, InvoiceItem, InvoiceType, Payment, RentalStatus, MailTransportSettings } from '../types';
import {
  fetchAllRentalRequests,
  fetchRentalRequest,
  transitionStatus,
  calculateMissingInfo,
  getRentalStatusLabel,
  setAvailabilityResult as persistAvailabilityResult,
  archiveRentalRequest,
  assertRoofRackReadyForWorkflow,
  findRoofRackConflict,
  getRoofRackBundleSuggestions,
  validateRoofRackAssignment,
} from '../services/rentalService';
import { checkAvailability, updateEventLegacy } from '../services/googleCalendarService';
import { fetchAllInvoices } from '../services/invoiceService';
import { generateTemplate } from '../services/templateService';
import { getInvoiceItems, updateRentalRequest } from '../services/sqliteService';
import { calculateWebsitePrice } from '../services/pricingService';
import { assignPaymentToInvoice, getAllCustomers, getPaymentsByRental, deletePayment, updateCustomer } from '../services/sqliteService';
import { findActiveResourcesForType } from '../services/resourceService';
import { openInvoicePreview, saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { openInvoiceCompose } from '../services/invoiceEmailService';
import { formatDisplayRef } from '../utils/displayId';
import { getCompanyProfile } from '../config/companyProfile';

interface RentalRequestDetailProps {
  rentalId: string;
  customers: Customer[];
  mailTransportSettings?: MailTransportSettings;
  onClose: () => void;
  onRefresh?: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
  onPrepareInvoiceDraft?: (payload: {
    rentalId: string;
    invoice: Partial<Invoice>;
    items: InvoiceItem[];
    nextRentalStatus?: RentalStatus;
  }) => void;
}

export const RentalRequestDetail: React.FC<RentalRequestDetailProps> = ({
  rentalId,
  customers,
  mailTransportSettings,
  onClose,
  onRefresh,
  onOpenInvoice,
  onPrepareInvoiceDraft,
}) => {
  const [rental, setRental] = useState<RentalRequest | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('10:00');
  const [newEndTime, setNewEndTime] = useState('18:00');

  // Price Override State
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [overridePrice, setOverridePrice] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [internalComment, setInternalComment] = useState('');
  const [commentDirty, setCommentDirty] = useState(false);
  const [roofRackKey, setRoofRackKey] = useState('');
  const [roofRackDirty, setRoofRackDirty] = useState(false);
  const [roofRackConflict, setRoofRackConflict] = useState<string | null>(null);
  const [roofRackOptions, setRoofRackOptions] = useState<string[]>([]);
  const [roofRackSuggestions, setRoofRackSuggestions] = useState<string[]>([]);
  const [vehicleWidthInput, setVehicleWidthInput] = useState('');
  const [vehicleMakeInput, setVehicleMakeInput] = useState('');
  const [vehicleModelInput, setVehicleModelInput] = useState('');
  const [hsnInput, setHsnInput] = useState('');
  const [tsnInput, setTsnInput] = useState('');

  // Availability check result
  const [availabilityResult, setAvailabilityResult] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentAssignBusyId, setPaymentAssignBusyId] = useState<string | null>(null);
  const [linkedInvoices, setLinkedInvoices] = useState<Invoice[]>([]);
  const [invoiceAmountById, setInvoiceAmountById] = useState<Record<string, number>>({});

  // Load rental
  useEffect(() => {
    const loadRental = async () => {
      setLoading(true);
      try {
        const loaded = await fetchRentalRequest(rentalId);
        if (loaded) {
          setRental(loaded);
          setInternalComment(loaded.description || '');
          setCommentDirty(false);
          setRoofRackKey(sanitizeRoofRackKey((loaded as any).roofRackInventoryKey || ''));
          setRoofRackDirty(false);
          setVehicleWidthInput(
            Number((loaded as any).vehicleWidthMm || 0) > 0 ? String((loaded as any).vehicleWidthMm) : ''
          );
          setVehicleMakeInput(loaded.vehicleMake || '');
          setVehicleModelInput(loaded.vehicleModel || '');
          setHsnInput(loaded.hsn || '');
          setTsnInput(loaded.tsn || '');

          // Load customer directly from database to avoid stale prop data
          // This fixes the "Unbekannter Kunde" issue when customers are imported
          const allCustomers = await getAllCustomers();
          const cust = allCustomers.find((c) => c.id === loaded.customerId);
          setCustomer(cust || null);

          // Calculate missing info
          const missing = calculateMissingInfo(loaded);
          setMissingInfo(missing);
        }
      } catch (error) {
        console.error('Failed to load rental:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRental();
  }, [rentalId]); // Removed 'customers' dependency - we load fresh from DB

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!rental) return;
      try {
        const all = await fetchAllRentalRequests();
        if (cancelled) return;

        const freeTextOptions = Array.from(
          new Set(
            all
              .map((r: any) => String(r.roofRackInventoryKey || '').trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, 'de-DE'));
        const suggestions = getRoofRackBundleSuggestions(rental);
        setRoofRackSuggestions(suggestions);
        const options = Array.from(new Set([...suggestions, ...freeTextOptions])).sort((a, b) => a.localeCompare(b, 'de-DE'));
        setRoofRackOptions(options);

        const conflict = await findRoofRackConflict({
          ...rental,
          roofRackInventoryKey: String(roofRackKey || '').trim() || undefined,
        });
        if (conflict) {
          setRoofRackConflict(
            `${conflict.conflictId} (${new Date(conflict.conflictStart).toLocaleDateString('de-DE')} - ${new Date(conflict.conflictEnd).toLocaleDateString('de-DE')})`
          );
          return;
        }
        setRoofRackConflict(null);
      } catch {
        if (!cancelled) setRoofRackConflict(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rental, roofRackKey]);

  // Load payments for this Vorgang (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getPaymentsByRental(rentalId);
        if (cancelled) return;
        setPayments(loaded);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rentalId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!rental) return;
      try {
        const all = await fetchAllInvoices();
        if (cancelled) return;
        const related = all.filter((inv) => {
          if (inv.rentalRequestId && inv.rentalRequestId === rental.id) return true;
          // Legacy fallback for old data without explicit linkage.
          return (
            !inv.rentalRequestId &&
            inv.companyId === rental.customerId &&
            Number(inv.servicePeriodStart || 0) === Number(rental.rentalStart || 0) &&
            Number(inv.servicePeriodEnd || 0) === Number(rental.rentalEnd || 0)
          );
        });
        setLinkedInvoices(related);

        const amountEntries = await Promise.all(
          related.map(async (inv) => {
            const items = await getInvoiceItems(inv.id);
            let subtotal = 0;
            let tax = 0;
            for (const it of items) {
              const qty = Number(it.quantity) || 0;
              const unitPrice = Number(it.unitPrice) || 0;
              const line = qty * unitPrice;
              subtotal += line;
              tax += line * ((Number(it.taxPercent) || 0) / 100);
            }
            const total = subtotal + tax;
            const depositPercent = inv.invoiceType === 'Angebot' && typeof inv.depositPercent === 'number' ? inv.depositPercent : 0;
            const depositAmount = inv.invoiceType === 'Angebot' && depositPercent > 0
              ? Math.round((total * (depositPercent / 100)) * 100) / 100
              : 0;
            return [inv.id, Math.round((total + depositAmount) * 100) / 100] as const;
          })
        );
        if (cancelled) return;
        setInvoiceAmountById(Object.fromEntries(amountEntries));
      } catch {
        if (!cancelled) {
          setLinkedInvoices([]);
          setInvoiceAmountById({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rental]);

  if (loading || !rental) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Lade Vorgang...</p>
        </div>
      </div>
    );
  }

  // Format dates
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const customerLabel = (() => {
    if (!customer) return 'Unbekannter Kunde';
    const full = `${(customer.firstName || '').trim()} ${(customer.lastName || '').trim()}`.trim();
    if (full) return full;
    if (customer.email?.trim()) return customer.email.trim();
    return 'Unbekannter Kunde';
  })();

  const displayStartTs = Number(rental.pickupDate || rental.rentalStart || 0);
  const displayEndTs = Number(rental.returnDate || rental.rentalEnd || 0);

  const headerTitle = `${rental.productType} – ${customerLabel}`;
  const headerSubtitle = `${formatDate(displayStartTs)} bis ${formatDate(displayEndTs)}`;

  const formatTimeForInput = (timestamp?: number, fallback = '10:00'): string => {
    if (!timestamp) return fallback;
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const formatDateForInput = (timestamp?: number): string => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const combineLocalDateAndTime = (dateIso: string, timeHHmm: string): number => {
    const [hRaw, mRaw] = String(timeHHmm || '').split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime()) || Number.isNaN(h) || Number.isNaN(m)) {
      return NaN;
    }
    date.setHours(h, m, 0, 0);
    return date.getTime();
  };

  const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const nextStep = (() => {
    if (missingInfo.length > 0) {
      return {
        title: 'Fehlende Daten ergänzen',
        text: `Bitte zuerst ${missingInfo.slice(0, 2).join(', ')}${missingInfo.length > 2 ? ' ...' : ''} pflegen.`,
      };
    }
    if (rental.status === 'neu' || rental.status === 'info_fehlt') {
      return {
        title: 'Verfügbarkeit prüfen',
        text: 'Als nächstes Verfügbarkeit prüfen, damit ein Angebot erstellt werden kann.',
      };
    }
    if (rental.status === 'check_verfuegbarkeit' && rental.availabilityStatus !== 'frei') {
      return {
        title: 'Verfügbarkeit auf frei setzen',
        text: 'Ohne Status "frei" kann kein Angebot erstellt werden.',
      };
    }
    if (rental.status === 'check_verfuegbarkeit' && rental.availabilityStatus === 'frei') {
      return {
        title: 'Angebot erstellen',
        text: 'Der Vorgang ist bereit. Jetzt Angebot erstellen und versenden.',
      };
    }
    if (rental.status === 'angebot_gesendet') {
      return {
        title: 'Kundenentscheidung erfassen',
        text: 'Angebot als angenommen oder abgelehnt markieren.',
      };
    }
    if (rental.status === 'angenommen') {
      return {
        title: 'Übergabe/Rückgabe planen',
        text: 'Auftrag bestätigt. Übergabe vorbereiten und Termine abstimmen.',
      };
    }
    if (rental.status === 'uebergabe_rueckgabe') {
      return {
        title: 'Vorgang abschließen',
        text: 'Nach Rückgabe den Vorgang auf abgeschlossen setzen.',
      };
    }
    return null;
  })();

  // Helper: Get current price (with override if exists)
	  const getCurrentPrice = (): number => {
	    if (rental.priceOverride) {
	      return rental.priceOverride.overridePrice;
	    }
	    return rental.priceSnapshot || 0;
	  };

  // Helper: Check if price can be overridden
  const canOverridePrice = (): boolean => {
    // Preis darf nicht geändert werden, sobald eine Rechnung existiert (außer Storno).
    const hasActiveInvoice = linkedInvoices.some(
      (inv) => inv.invoiceType === 'Rechnung' && inv.state !== 'storniert'
    );
    return !hasActiveInvoice;
  };

  const getAvailabilityLabel = (status?: string): string => {
    if (!status) return '';
    if (status === 'frei') return 'Frei';
    if (status === 'belegt') return 'Belegt';
    if (status === 'unklar') return 'Unklar';
    return status;
  };

  // Helper: Format price override info
  const getPriceOverrideInfo = (): string | null => {
    if (!rental.priceOverride) return null;
    const { originalPrice, overridePrice, reason, overriddenBy, overriddenAt } = rental.priceOverride;
    const date = overriddenAt ? new Date(overriddenAt).toLocaleDateString('de-DE') : '';
    const user = overriddenBy || 'Unbekannt';
    return `Geändert von ${user} am ${date}: ${originalPrice.toFixed(2)}€ → ${overridePrice.toFixed(2)}€ (${reason})`;
  };

  // Handle Price Override
  const handlePriceOverride = async () => {
    if (!rental || !overridePrice) {
      alert('Bitte geben Sie einen Preis ein.');
      return;
    }

    const newPrice = parseFloat(overridePrice);
    if (isNaN(newPrice) || newPrice < 0) {
      alert('Bitte geben Sie einen gültigen Preis ein (positive Zahl).');
      return;
    }

    if (!overrideReason.trim()) {
      alert('Bitte geben Sie einen Grund für die Preisänderung an (z.B. "Sonderpreis", "Stammkunde", "Saison").');
      return;
    }

    const originalPrice = rental.priceSnapshot || 0;
    const profile = getCompanyProfile();
    const overrideUser = String(profile.ownerName || profile.companyName || 'System').trim() || 'System';
    const priceOverride = {
      originalPrice,
      overridePrice: newPrice,
      reason: overrideReason,
      overriddenBy: overrideUser,
      overriddenAt: Date.now(),
    };

    try {
      await updateRentalRequest(rental.id, {
        priceOverride,
      });

      // Update local state
      const updated: RentalRequest = { ...rental, priceOverride };
      setRental(updated);

      // Close modal and reset form
      setShowPriceOverrideModal(false);
      setOverridePrice('');
      setOverrideReason('');

      alert(`Preis erfolgreich geändert: ${originalPrice.toFixed(2)}€ → ${newPrice.toFixed(2)}€`);
    } catch (error) {
      console.error('Failed to update price:', error);
      alert('Fehler beim Speichern des Preises: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleTransitionAction = async (nextStatus: RentalStatus, onSuccess?: (timestamp: number) => void) => {
    try {
      const ts = Date.now();
      await transitionStatus(rental.id, nextStatus);
      setRental((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      onSuccess?.(ts);
      onRefresh?.();
    } catch (e: any) {
      alert(e?.error || e?.message || 'Status konnte nicht gesetzt werden.');
    }
  };

  // Check availability
  const handleCheckAvailability = async () => {
    setActionLoading(true);

    try {
      const rentalForCheck: RentalRequest = {
        ...rental,
        roofRackInventoryKey: String(roofRackKey || '').trim() || undefined,
      };
      const validation = validateRoofRackAssignment(rentalForCheck);
      if (!validation.ok) {
        throw { error: validation.errors.join('\n') };
      }
      await assertRoofRackReadyForWorkflow(rentalForCheck);
      const resolvedKey = validation.normalizedKey || undefined;
      if ((rental.roofRackInventoryKey || '') !== (resolvedKey || '')) {
        await updateRentalRequest(rental.id, { roofRackInventoryKey: resolvedKey });
        setRental({ ...rentalForCheck, roofRackInventoryKey: resolvedKey });
        setRoofRackKey(resolvedKey || '');
        setRoofRackDirty(false);
      }

      let calendarId = rental?.googleCalendarId || '';

      // If no calendar is assigned yet: auto-pick a resource calendar for this product type.
      if (!calendarId && rental) {
        const candidates = (await findActiveResourcesForType(rental.productType))
          .map((r) => r.googleCalendarId)
          .filter((id) => Boolean(String(id || '').trim()));

        if (candidates.length === 0) {
          alert('Kein Kalender für dieses Produkt konfiguriert. Bitte im Menü "Kalender" eine Kalender-Referenz zur Ressource zuordnen.');
          return;
        }

        // Probe calendars and pick the first available one.
        let picked: { id: string; isAvailable: boolean } | null = null;
        for (const cid of candidates) {
          const res = await checkAvailability(cid, new Date(rental.rentalStart), new Date(rental.rentalEnd));
          if (picked === null) picked = { id: cid, isAvailable: Boolean(res.isAvailable) };
          if (res.isAvailable) {
            picked = { id: cid, isAvailable: true };
            break;
          }
        }

        calendarId = picked?.id || candidates[0];
        await updateRentalRequest(rental.id, { googleCalendarId: calendarId });
      }

      if (!calendarId) {
        alert('Kalender-Referenz ist nicht gesetzt. Bitte im Menü "Kalender" eine Kalender-Referenz zur Ressource zuordnen.');
        return;
      }

      const result = await checkAvailability(calendarId, new Date(rental!.rentalStart), new Date(rental!.rentalEnd));

      setAvailabilityResult(result);

      // Persist availability + status
      await persistAvailabilityResult(rentalId, { isAvailable: result.isAvailable });
      await transitionStatus(rentalId, 'check_verfuegbarkeit');
      const nextStatus: RentalStatus = 'check_verfuegbarkeit';
      setRental((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              availabilityStatus: result.isAvailable ? 'frei' : 'belegt',
              availabilityCheckedAt: Date.now(),
            }
          : prev
      );
      onRefresh?.();
    } catch (error: any) {
      console.error('Availability check failed:', error);
      alert(error.error || 'Verfügbarkeitsprüfung fehlgeschlagen');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrepareDocumentDraft = (invoiceType: InvoiceType) => {
    if (!rental || !customer || !onPrepareInvoiceDraft) return;
    if (invoiceType === 'Angebot' && rental.availabilityStatus !== 'frei') {
      alert('Bitte zuerst die Verfügbarkeit auf "frei" setzen.');
      return;
    }

    const buyerAddress = [
      customer.address?.street || '',
      `${customer.address?.zipCode || ''} ${customer.address?.city || ''}`.trim(),
      customer.address?.country || '',
    ]
      .filter(Boolean)
      .join('\n');

    const invoice: Partial<Invoice> = {
      rentalRequestId: rental.id,
      invoiceType,
      companyId: customer.id,
      buyerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      buyerAddress,
      salutation: customer.salutation,
      servicePeriodStart: rental.rentalStart,
      servicePeriodEnd: rental.rentalEnd,
      dueDate: invoiceType === 'Angebot' ? (rental.rentalEnd + 7 * 24 * 60 * 60 * 1000) : undefined,
    };

    const items: InvoiceItem[] = [
      {
        id: `item_draft_${Date.now()}`,
        invoiceId: '',
        orderIndex: 0,
        name: `${rental.productType} Vermietung`,
        unit: 'Woche',
        unitPrice: getCurrentPrice(),
        quantity: 1,
        taxPercent: 0,
        createdAt: Date.now(),
      },
    ];

    const nextRentalStatus: RentalStatus | undefined =
      invoiceType === 'Angebot'
        ? 'angebot_gesendet'
        : invoiceType === 'Rechnung'
          ? 'abgeschlossen'
          : 'angenommen';

    onPrepareInvoiceDraft({
      rentalId: rental.id,
      invoice,
      items,
      nextRentalStatus,
    });
  };

  // Generate template
  const handleGenerateTemplate = async (type: 'availability' | 'offer') => {
    if (!rental || !customer) return;

    const template = generateTemplate(customer, rental, {
      templateType: type,
      availabilityStatus: rental.availabilityStatus,
      price: rental.priceSnapshot,
      deposit: rental.deposit,
    });

    // Copy to clipboard
    await navigator.clipboard.writeText(template);

    alert('Text in Zwischenablage kopiert!');
  };

  const isRoofRackRelevant = rental.productType === 'Dachbox XL' || rental.productType === 'Dachbox M';
  const includeRoofRack = isRoofRackRelevant ? Boolean(rental.includeRoofRack ?? true) : true;
  const isAhkRelevant = rental.productType === 'Heckbox' || rental.productType === 'Fahrradträger';

  const handleToggleRoofRack = async (next: boolean) => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const price = calculateWebsitePrice({
        productType: rental.productType,
        start: new Date(rental.rentalStart),
        end: new Date(rental.rentalEnd),
        includeRoofRack: next,
      });

      const nextSnapshot = 'error' in price ? rental.priceSnapshot : price.total;
      await updateRentalRequest(rental.id, { includeRoofRack: next, priceSnapshot: nextSnapshot });

      const updated: RentalRequest = { ...rental, includeRoofRack: next, priceSnapshot: nextSnapshot };
      setRental(updated);
      setMissingInfo(calculateMissingInfo(updated));
    } catch (e) {
      console.error('Failed to update roof rack option:', e);
      alert('Konnte Option nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetAhkPresent = async (next: 'ja' | 'nein' | 'unklar') => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const updated: RentalRequest = { ...rental, ahkPresent: next };
      const nextMissing = calculateMissingInfo(updated);
      await updateRentalRequest(rental.id, { ahkPresent: next, missingInfo: nextMissing });
      setRental(updated);
      setMissingInfo(nextMissing);
    } catch (e) {
      console.error('Failed to update AHK:', e);
      alert('Konnte AHK-Info nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      await archiveRentalRequest(rental.id, 'Vom Nutzer gelöscht/archiviert');
      onRefresh?.();
      onClose();
    } catch (e: any) {
      console.error('Failed to archive rental:', e);
      alert(e?.error || e?.message || 'Konnte Vorgang nicht archivieren.');
    } finally {
      setActionLoading(false);
      setConfirmArchive(false);
    }
  };

  const handleSaveComment = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const nextComment = internalComment.trim();
      await updateRentalRequest(rental.id, {
        description: nextComment || undefined,
      });
      const updated: RentalRequest = {
        ...rental,
        description: nextComment || undefined,
      };
      setRental(updated);
      setCommentDirty(false);
      alert('Kommentar gespeichert.');
    } catch (e: any) {
      console.error('Failed to save comment:', e);
      alert(e?.error || e?.message || 'Kommentar konnte nicht gespeichert werden.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetRelingType = async (next: 'offen' | 'geschlossen' | 'unklar') => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const updated: RentalRequest = { ...rental, relingType: next };
      const nextMissing = calculateMissingInfo(updated);
      await updateRentalRequest(rental.id, { relingType: next, missingInfo: nextMissing });
      setRental(updated);
      setMissingInfo(nextMissing);
      if (customer) {
        const customerUpdated: Customer = {
          ...customer,
          assignedVehicleMake: rental.vehicleMake || customer.assignedVehicleMake,
          assignedVehicleModel: rental.vehicleModel || customer.assignedVehicleModel,
          assignedHsn: rental.hsn || customer.assignedHsn,
          assignedTsn: rental.tsn || customer.assignedTsn,
          assignedRelingType: next,
          roofRackDecisionUpdatedAt: Date.now(),
          updatedAt: Date.now(),
        };
        await updateCustomer(customerUpdated);
        setCustomer(customerUpdated);
      }
    } catch (e) {
      console.error('Failed to update reling type:', e);
      alert('Konnte Reling-Typ nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetVehicleWidthMm = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const raw = String((rental as any).vehicleWidthMm ?? '').trim();
      const nextRaw = String(vehicleWidthInput || '').trim();
      let nextWidth: number | undefined = undefined;
      if (nextRaw) {
        const parsed = Number(nextRaw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          alert('Bitte eine gültige Fahrzeugbreite in mm eingeben (z. B. 1180 oder 1270).');
          return;
        }
        nextWidth = Math.round(parsed);
      }
      if ((raw || '') === (nextRaw || '')) {
        return;
      }
      const updated: RentalRequest = { ...rental, vehicleWidthMm: nextWidth };
      await updateRentalRequest(rental.id, { vehicleWidthMm: nextWidth });
      setRental(updated);
      setVehicleWidthInput(nextWidth ? String(nextWidth) : '');
      alert('Fahrzeugbreite gespeichert.');
    } catch (e) {
      console.error('Failed to update vehicle width:', e);
      alert('Konnte Fahrzeugbreite nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveVehicleData = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const nextVehicleMake = vehicleMakeInput.trim();
      const nextVehicleModel = vehicleModelInput.trim();
      const nextHsn = hsnInput.trim().toUpperCase();
      const nextTsn = tsnInput.trim().toUpperCase();

      const updated: RentalRequest = {
        ...rental,
        vehicleMake: nextVehicleMake || undefined,
        vehicleModel: nextVehicleModel || undefined,
        hsn: nextHsn || undefined,
        tsn: nextTsn || undefined,
      };
      const nextMissing = calculateMissingInfo(updated);
      await updateRentalRequest(rental.id, {
        vehicleMake: nextVehicleMake || undefined,
        vehicleModel: nextVehicleModel || undefined,
        hsn: nextHsn || undefined,
        tsn: nextTsn || undefined,
        missingInfo: nextMissing,
      });
      setRental(updated);
      setMissingInfo(nextMissing);
      setVehicleMakeInput(nextVehicleMake);
      setVehicleModelInput(nextVehicleModel);
      setHsnInput(nextHsn);
      setTsnInput(nextTsn);

      if (customer) {
        const customerUpdated: Customer = {
          ...customer,
          assignedVehicleMake: nextVehicleMake || customer.assignedVehicleMake,
          assignedVehicleModel: nextVehicleModel || customer.assignedVehicleModel,
          assignedHsn: nextHsn || customer.assignedHsn,
          assignedTsn: nextTsn || customer.assignedTsn,
          roofRackDecisionUpdatedAt: Date.now(),
          updatedAt: Date.now(),
        };
        await updateCustomer(customerUpdated);
        setCustomer(customerUpdated);
      }
      alert('Fahrzeugdaten gespeichert.');
    } catch (e) {
      console.error('Failed to update vehicle data:', e);
      alert('Konnte Fahrzeugdaten nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyCustomerProfile = async () => {
    if (!rental || !customer) return;
    setActionLoading(true);
    try {
      const nextVehicleMake = String(customer.assignedVehicleMake || '').trim();
      const nextVehicleModel = String(customer.assignedVehicleModel || '').trim();
      const nextHsn = String(customer.assignedHsn || '').trim().toUpperCase();
      const nextTsn = String(customer.assignedTsn || '').trim().toUpperCase();
      const nextRelingType = (customer.assignedRelingType || undefined) as RentalRequest['relingType'];
      let nextRoofRackKey = sanitizeRoofRackKey(String(customer.assignedRoofRackInventoryKey || '').trim());
      let skippedRoofRack = false;

      if (nextRoofRackKey) {
        const conflict = await findRoofRackConflict({
          ...rental,
          roofRackInventoryKey: nextRoofRackKey,
        });
        if (conflict && conflict.conflictId !== rental.id) {
          nextRoofRackKey = '';
          skippedRoofRack = true;
        }
      }

      const updated: RentalRequest = {
        ...rental,
        vehicleMake: nextVehicleMake || undefined,
        vehicleModel: nextVehicleModel || undefined,
        hsn: nextHsn || undefined,
        tsn: nextTsn || undefined,
        relingType: nextRelingType || rental.relingType,
        roofRackInventoryKey: nextRoofRackKey || undefined,
      };
      const nextMissing = calculateMissingInfo(updated);
      await updateRentalRequest(rental.id, {
        vehicleMake: nextVehicleMake || undefined,
        vehicleModel: nextVehicleModel || undefined,
        hsn: nextHsn || undefined,
        tsn: nextTsn || undefined,
        relingType: nextRelingType || rental.relingType,
        roofRackInventoryKey: nextRoofRackKey || undefined,
        missingInfo: nextMissing,
      });
      setRental(updated);
      setMissingInfo(nextMissing);
      setVehicleMakeInput(nextVehicleMake);
      setVehicleModelInput(nextVehicleModel);
      setHsnInput(nextHsn);
      setTsnInput(nextTsn);
      setRoofRackKey(nextRoofRackKey);
      setRoofRackDirty(false);

      if (skippedRoofRack) {
        alert('Kundenprofil übernommen. Dachträger-Bundle wurde wegen Konflikt nicht gesetzt.');
      } else {
        alert('Kundenprofil in den Vorgang übernommen.');
      }
    } catch (e) {
      console.error('Failed to apply customer profile:', e);
      alert('Kundenprofil konnte nicht übernommen werden.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveRoofRackKey = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const nextRaw = roofRackKey.trim();
      const validation = validateRoofRackAssignment({
        ...rental,
        roofRackInventoryKey: nextRaw || undefined,
      });
      if (!validation.ok) {
        alert(validation.errors.join('\n'));
        return;
      }

      const conflict = await findRoofRackConflict({
        ...rental,
        roofRackInventoryKey: validation.normalizedKey || undefined,
      });
      if (conflict) {
        alert(
          `Dachträger-Bundle ist bereits belegt in Vorgang ${conflict.conflictId} (${new Date(conflict.conflictStart).toLocaleDateString('de-DE')} - ${new Date(conflict.conflictEnd).toLocaleDateString('de-DE')}).`
        );
        return;
      }

      const nextKey = validation.normalizedKey;
      await updateRentalRequest(rental.id, { roofRackInventoryKey: nextKey || undefined });
      const updated: RentalRequest = {
        ...rental,
        roofRackInventoryKey: nextKey || undefined,
      };
      setRental(updated);
      setRoofRackKey(nextKey);
      setRoofRackDirty(false);
      if (customer) {
        const customerUpdated: Customer = {
          ...customer,
          assignedVehicleMake: rental.vehicleMake || customer.assignedVehicleMake,
          assignedVehicleModel: rental.vehicleModel || customer.assignedVehicleModel,
          assignedHsn: rental.hsn || customer.assignedHsn,
          assignedTsn: rental.tsn || customer.assignedTsn,
          assignedRelingType: (rental.relingType as any) || customer.assignedRelingType,
          assignedRoofRackInventoryKey: nextKey || undefined,
          roofRackDecisionUpdatedAt: Date.now(),
          updatedAt: Date.now(),
        };
        await updateCustomer(customerUpdated);
        setCustomer(customerUpdated);
      }
      alert('Dachträger-Zuordnung gespeichert.');
    } catch (e) {
      console.error('Failed to update roof rack key:', e);
      alert('Konnte Dachträger-Zuordnung nicht speichern.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!rental) return;
    if (!newStartDate || !newEndDate) {
      alert('Bitte beide Daten eingeben.');
      return;
    }

    const start = combineLocalDateAndTime(newStartDate, '00:00');
    const end = combineLocalDateAndTime(newEndDate, '00:00');
    const pickupTs = combineLocalDateAndTime(newStartDate, newStartTime);
    const returnTs = combineLocalDateAndTime(newEndDate, newEndTime);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      alert('Bitte gültige Start- und Enddaten eingeben.');
      return;
    }
    if (start >= end) {
      alert('Ende muss nach Start liegen.');
      return;
    }
    if (Number.isNaN(pickupTs) || Number.isNaN(returnTs)) {
      alert('Bitte gültige Uhrzeiten für Abholung und Rückgabe eingeben.');
      return;
    }
    if (pickupTs >= returnTs) {
      alert('Rückgabe muss nach Abholung liegen.');
      return;
    }

    setActionLoading(true);
    try {
      // Calculate new price
      const price = calculateWebsitePrice({
        productType: rental.productType,
        start: new Date(start),
        end: new Date(end),
        includeRoofRack: rental.includeRoofRack ?? false,
      });

      if ('error' in price) {
        throw new Error(price.error);
      }

      // Update rental
      await updateRentalRequest(rental.id, {
        rentalStart: start,
        rentalEnd: end,
        pickupDate: pickupTs,
        returnDate: returnTs,
        priceSnapshot: price.total,
      });

      // Update local state
      const updated: RentalRequest = {
        ...rental,
        rentalStart: start,
        rentalEnd: end,
        pickupDate: pickupTs,
        returnDate: returnTs,
        priceSnapshot: price.total,
      };
      setRental(updated);

      let calendarSyncError = false;
      if (rental.googleCalendarId && rental.googleEventId) {
        try {
          await updateEventLegacy(rental.googleCalendarId, rental.googleEventId, {
            start: new Date(pickupTs),
            end: new Date(returnTs),
          });
        } catch (e) {
          calendarSyncError = true;
          console.error('Failed to update calendar event after reschedule:', e);
        }
      }

      // Close modal
      setShowRescheduleModal(false);
      setNewStartDate('');
      setNewEndDate('');
      setNewStartTime('10:00');
      setNewEndTime('18:00');

      if (calendarSyncError) {
        alert('Zeitraum gespeichert. Kalender-Eintrag konnte nicht aktualisiert werden.');
      } else {
        alert('Zeitraum und Kalender erfolgreich geändert!');
      }
      onRefresh?.();
    } catch (e: any) {
      console.error('Failed to reschedule rental:', e);
      alert(e?.error || e?.message || 'Konnte Zeitraum nicht ändern.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{headerTitle}</h2>
              <p className="text-sm text-gray-500 mt-1">{headerSubtitle}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                <span title="Interne Vorgangs-ID">Referenz: {formatDisplayRef(rental.id)}</span>
                <button
                  type="button"
                  className="underline hover:text-gray-600"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(rental.id);
                      alert('ID kopiert.');
                    } catch {
                      alert('Konnte ID nicht kopieren.');
                    }
                  }}
                  aria-label="Interne ID kopieren"
                >
                  Kopieren
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmArchive(true)}
                disabled={actionLoading}
                className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
                aria-label="Vorgang löschen (archivieren)"
                title="Vorgang archivieren (wird aus den Vorgängen entfernt)"
              >
                Löschen
              </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">Schließen</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {confirmArchive && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-semibold text-red-900">Vorgang wirklich löschen?</div>
              <div className="text-sm text-red-800 mt-1">
                Der Vorgang wird archiviert und aus den Vorgängen entfernt.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
                  onClick={handleArchive}
                  disabled={actionLoading}
                >
                  Ja, archivieren
                </button>
                <button
                  className="px-3 py-2 rounded-md border border-red-200 text-red-900 text-sm hover:bg-red-100 disabled:opacity-60"
                  onClick={() => setConfirmArchive(false)}
                  disabled={actionLoading}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {showRescheduleModal && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <div className="text-sm font-semibold text-indigo-900">Zeitraum ändern</div>
              <div className="text-sm text-indigo-800 mt-1">
                Ändere den Mietzeitraum für diesen Vorgang. Der Preis wird automatisch neu berechnet.
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-indigo-900 mb-1">
                    Neues Startdatum
                  </label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-indigo-900 mb-1">
                    Abholzeit
                  </label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-indigo-900 mb-1">
                    Neues Enddatum
                  </label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-indigo-900 mb-1">
                    Rückgabezeit
                  </label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
                    onClick={handleReschedule}
                    disabled={actionLoading}
                  >
                    Zeitraum ändern
                  </button>
                  <button
                    className="px-3 py-2 rounded-md border border-indigo-200 text-indigo-900 text-sm hover:bg-indigo-100 disabled:opacity-60"
                    onClick={() => {
                      setShowRescheduleModal(false);
                      setNewStartDate('');
                      setNewEndDate('');
                      setNewStartTime('10:00');
                      setNewEndTime('18:00');
                    }}
                    disabled={actionLoading}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          )}

          {showPriceOverrideModal && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Preis manuell anpassen</div>
              <div className="text-sm text-amber-800 mt-1">
                Ändere den Preis für diesen Vorgang. Diese Änderung wird protokolliert.
                {rental.priceOverride && (
                  <span className="block mt-1 text-xs">
                    Aktueller Override: {rental.priceOverride.overridePrice.toFixed(2)} €
                    (ursprünglich: {rental.priceOverride.originalPrice.toFixed(2)} €)
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-amber-900 mb-1">
                    Neuer Preis (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(e.target.value)}
                    placeholder={getCurrentPrice() > 0 ? getCurrentPrice().toFixed(2) : '0.00'}
                    className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-amber-900 mb-1">
                    Grund für die Preisänderung *
                  </label>
                  <select
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Bitte wählen --</option>
                    <option value="Sonderpreis">Sonderpreis</option>
                    <option value="Stammkunde">Stammkunde</option>
                    <option value="Saison">Saisonalpreis</option>
                    <option value="Fehlerkorrektur">Fehlerkorrektur</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-60"
                    onClick={handlePriceOverride}
                    disabled={actionLoading}
                  >
                    Preis ändern
                  </button>
                  <button
                    className="px-3 py-2 rounded-md border border-amber-200 text-amber-900 text-sm hover:bg-amber-100 disabled:opacity-60"
                    onClick={() => {
                      setShowPriceOverrideModal(false);
                      setOverridePrice('');
                      setOverrideReason('');
                    }}
                    disabled={actionLoading}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status & Progress */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Status</h3>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {getRentalStatusLabel(rental.status)}
              </span>
              {rental.availabilityStatus && (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                  {getAvailabilityLabel(rental.availabilityStatus)}
                </span>
              )}
            </div>
          </div>

          {/* Interner Kommentar */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Interner Kommentar</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <textarea
                className="w-full min-h-[120px] px-3 py-2 rounded-md border border-slate-200 text-sm"
                placeholder="Eigene Notizen zu diesem Vorgang (nur intern)..."
                value={internalComment}
                onChange={(e) => {
                  setInternalComment(e.target.value);
                  const normalizedCurrent = (rental.description || '').trim();
                  const normalizedNext = e.target.value.trim();
                  setCommentDirty(normalizedCurrent !== normalizedNext);
                }}
                disabled={actionLoading}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                {commentDirty && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Ungespeicherte Änderungen
                  </span>
                )}
                <button
                  type="button"
                  className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                  onClick={handleSaveComment}
                  disabled={!commentDirty || actionLoading}
                >
                  Kommentar speichern
                </button>
              </div>
            </div>
          </div>

          {/* Kunde */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Kunde</h3>
            {customer && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="font-medium">{customer.firstName} {customer.lastName}</p>
                <p className="text-sm text-gray-600">{customer.email}</p>
                <p className="text-sm text-gray-600">{customer.phone}</p>
              </div>
            )}
          </div>

          {/* Mietdaten */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Mietdaten</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Produkt:</span>
                  <span className="ml-2 font-medium">{rental.productType}</span>
                </div>
                <div>
                  <span className="text-gray-600">Start:</span>
                  <span className="ml-2 font-medium">{formatDate(rental.rentalStart)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Ende:</span>
                  <span className="ml-2 font-medium">{formatDate(rental.rentalEnd)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Abholung:</span>
                  <span className="ml-2 font-medium">{formatDate(rental.pickupDate || rental.rentalStart)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Rückgabe:</span>
                  <span className="ml-2 font-medium">{formatDate(rental.returnDate || rental.rentalEnd)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Preis:</span>
                  <span className="ml-2 font-semibold text-green-700">
                    {getCurrentPrice() > 0 ? `${getCurrentPrice().toFixed(2)} €` : '-'}
                  </span>
                  {canOverridePrice() && (
                    <button
                      onClick={() => setShowPriceOverrideModal(true)}
                      className="ml-2 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60"
                      disabled={actionLoading}
                      title="Preis manuell anpassen"
                    >
                      Preis ändern
                    </button>
                  )}
                </div>
              </div>

              {/* Price Override Audit Trail */}
              {getPriceOverrideInfo() && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
                    ℹ️ {getPriceOverrideInfo()}
                  </div>
                </div>
              )}

              {isRoofRackRelevant && (
                <div className="pt-3 border-t border-gray-100">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={includeRoofRack}
                      onChange={(e) => handleToggleRoofRack(e.target.checked)}
                      disabled={actionLoading}
                    />
                    <span className="text-gray-700 font-medium">Mit Dachträger berechnen</span>
                    <span className="text-gray-500">(falls Kunde eigene Träger hat: deaktivieren)</span>
                  </label>
                </div>
              )}

              {isRoofRackRelevant && (
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="text-sm font-medium text-gray-900">Reling & Dachträger-Zuordnung</div>
                  {customer && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-700">
                          Kundenprofil abrufen: gespeicherte Fahrzeug-/Reling-/Dachträger-Daten auf diesen Vorgang übernehmen.
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-100 disabled:opacity-60"
                          onClick={handleApplyCustomerProfile}
                          disabled={actionLoading}
                        >
                          Aus Kundenprofil übernehmen
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="text-sm text-gray-700">
                      <span className="font-medium">Marke</span>
                      <input
                        type="text"
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                        placeholder="z.B. VW"
                        value={vehicleMakeInput}
                        onChange={(e) => setVehicleMakeInput(e.target.value)}
                        disabled={actionLoading}
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <span className="font-medium">Modell</span>
                      <input
                        type="text"
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                        placeholder="z.B. Passat Variant"
                        value={vehicleModelInput}
                        onChange={(e) => setVehicleModelInput(e.target.value)}
                        disabled={actionLoading}
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <span className="font-medium">HSN</span>
                      <input
                        type="text"
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm uppercase"
                        placeholder="z.B. 0603"
                        value={hsnInput}
                        onChange={(e) => setHsnInput(e.target.value)}
                        disabled={actionLoading}
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <span className="font-medium">TSN</span>
                      <input
                        type="text"
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm uppercase"
                        placeholder="z.B. BQH"
                        value={tsnInput}
                        onChange={(e) => setTsnInput(e.target.value)}
                        disabled={actionLoading}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                      onClick={handleSaveVehicleData}
                      disabled={actionLoading}
                    >
                      Fahrzeugdaten speichern
                    </button>
                  </div>

                  {roofRackSuggestions.length > 0 && (
                    <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded p-2">
                      Offene Reling: Bitte ein Bundle wählen (Thule 710410/753 + SquareBar 712200 oder 712300).
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.relingType === 'offen'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetRelingType('offen')}
                      disabled={actionLoading}
                    >
                      Offene Reling
                    </button>
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.relingType === 'geschlossen'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetRelingType('geschlossen')}
                      disabled={actionLoading}
                    >
                      Geschlossene Reling
                    </button>
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.relingType === 'unklar' || !rental.relingType
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetRelingType('unklar')}
                      disabled={actionLoading}
                    >
                      Unklar
                    </button>
                  </div>
                  <div className="text-xs text-slate-600">
                    Für Dachbox-Vorgänge muss am Ende „Offene Reling“ oder „Geschlossene Reling“ gesetzt sein.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
                    <div>
                      <label htmlFor="vehicle-width-mm-input" className="text-sm text-gray-700 font-medium">
                        Fahrzeugbreite in mm (optional)
                      </label>
                      <input
                        id="vehicle-width-mm-input"
                        type="number"
                        min={1}
                        step={1}
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                        placeholder="z.B. 1180 oder 1270"
                        value={vehicleWidthInput}
                        onChange={(e) => setVehicleWidthInput(e.target.value)}
                        disabled={actionLoading}
                      />
                      <div className="mt-1 text-xs text-gray-500">
                        Auto-Regel bei offener Reling: bis 1180 mm = 712200, sonst Standard 712300.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                      onClick={handleSetVehicleWidthMm}
                      disabled={actionLoading}
                    >
                      Breite speichern
                    </button>
                  </div>
                  {roofRackSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {roofRackSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={[
                            'px-3 py-1.5 rounded-md border text-xs',
                            String(roofRackKey || '').trim() === s
                              ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                              : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50',
                          ].join(' ')}
                          onClick={() => {
                            setRoofRackKey(s);
                            setRoofRackDirty(String((rental as any).roofRackInventoryKey || '').trim() !== s);
                          }}
                          disabled={actionLoading}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
                    <div>
                      <label className="text-sm text-gray-700 font-medium">
                        Dachträger aus Bestand (Schlüssel/Name)
                      </label>
                      <input
                        type="text"
                        list="roof-rack-options"
                        className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                        placeholder="z.B. Thule WingBar EVO 118 #01"
                        value={roofRackKey}
                        onChange={(e) => {
                          setRoofRackKey(e.target.value);
                          const normalizedCurrent = String((rental as any).roofRackInventoryKey || '').trim();
                          const normalizedNext = e.target.value.trim();
                          setRoofRackDirty(normalizedCurrent !== normalizedNext);
                        }}
                        disabled={actionLoading}
                      />
                      <datalist id="roof-rack-options">
                        {roofRackOptions.map((opt) => (
                          <option key={opt} value={opt} />
                        ))}
                      </datalist>
                      <div className="mt-1 text-xs text-gray-500">
                        Gleichen Schlüssel wiederverwenden, um Doppelvermietung zu erkennen.
                      </div>
                      {roofRackConflict && (
                        <div className="mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
                          Achtung: Diese Dachträger-Zuordnung ist im Zeitraum bereits belegt in Vorgang {roofRackConflict}.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                      onClick={handleSaveRoofRackKey}
                      disabled={!roofRackDirty || actionLoading}
                    >
                      Dachträger speichern
                    </button>
                  </div>
                </div>
              )}

              {/* AHK (nur bei Heckbox/Fahrradträger) */}
              {isAhkRelevant && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-sm font-medium text-gray-900 mb-2">Anhängerkupplung (AHK) vorhanden?</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.ahkPresent === 'ja'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetAhkPresent('ja')}
                      disabled={actionLoading}
                      aria-pressed={rental.ahkPresent === 'ja'}
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.ahkPresent === 'nein'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetAhkPresent('nein')}
                      disabled={actionLoading}
                      aria-pressed={rental.ahkPresent === 'nein'}
                    >
                      Nein
                    </button>
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-md border text-sm',
                        rental.ahkPresent === 'unklar' || !rental.ahkPresent
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
                      ].join(' ')}
                      onClick={() => handleSetAhkPresent('unklar')}
                      disabled={actionLoading}
                      aria-pressed={rental.ahkPresent === 'unklar' || !rental.ahkPresent}
                      title="Zurücksetzen (unklar)"
                    >
                      Unklar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Zahlungen / Anzahlungen */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Zahlungen</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-700">
                  <span className="text-gray-600">Summe erfasst:</span>{' '}
                  <span className="font-semibold text-emerald-700">{paymentsTotal > 0 ? `${paymentsTotal.toFixed(2)} €` : '-'}</span>
                </div>
                <div className="text-xs text-gray-500">
                  Hinweis: Zuordnung erfolgt im Posteingang (z.B. PayPal-Eingang).
                </div>
              </div>

              {payments.length === 0 && (
                <div className="mt-3 text-sm text-gray-600">Keine Zahlungen erfasst.</div>
              )}

              {payments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-gray-200 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {p.kind} · {p.method} · {Number(p.amount || 0).toFixed(2)} {p.currency || 'EUR'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.receivedAt ? new Date(p.receivedAt).toLocaleString('de-DE') : ''}
                          {p.payerName ? ` · ${p.payerName}` : ''}
                        </div>
                        <div className="mt-2">
                          <label className="text-xs text-gray-600">Rechnung zuordnen</label>
                          <select
                            className="mt-1 w-full px-2 py-1.5 rounded border border-gray-200 text-xs bg-white"
                            value={p.invoiceId || ''}
                            onChange={async (e) => {
                              const nextInvoiceId = e.target.value || undefined;
                              setPaymentAssignBusyId(p.id);
                              try {
                                await assignPaymentToInvoice(p.id, nextInvoiceId);
                                setPayments((prev) =>
                                  prev.map((x) => (x.id === p.id ? { ...x, invoiceId: nextInvoiceId } : x))
                                );
                              } catch (error) {
                                alert('Konnte Rechnungszuordnung nicht speichern: ' + (error instanceof Error ? error.message : String(error)));
                              } finally {
                                setPaymentAssignBusyId(null);
                              }
                            }}
                            disabled={paymentAssignBusyId === p.id || actionLoading}
                            aria-label="Rechnung zuordnen"
                          >
                            <option value="">Keine Rechnung zugeordnet</option>
                            {linkedInvoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.invoiceNo} · {inv.invoiceType} · {inv.state}
                              </option>
                            ))}
                          </select>
                        </div>
                        {p.note && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{p.note}</div>}
                      </div>
                      <button
                        className="shrink-0 px-3 py-1.5 rounded-md border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-60"
                        onClick={async () => {
                          const ok = confirm('Diese Zahlung wirklich löschen?');
                          if (!ok) return;
                          try {
                            await deletePayment(p.id);
                            setPayments((prev) => prev.filter((x) => x.id !== p.id));
                          } catch (e) {
                            alert('Konnte Zahlung nicht löschen: ' + (e instanceof Error ? e.message : String(e)));
                          }
                        }}
                        disabled={paymentAssignBusyId === p.id}
                      >
                        Löschen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fahrzeugdaten */}
          {(rental.vehicleMake || rental.vehicleModel || rental.hsn || rental.tsn) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Fahrzeug</h3>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {rental.vehicleMake && (
                    <div>
                      <span className="text-gray-600">Marke:</span>
                      <span className="ml-2 font-medium">{rental.vehicleMake}</span>
                    </div>
                  )}
                  {rental.vehicleModel && (
                    <div>
                      <span className="text-gray-600">Modell:</span>
                      <span className="ml-2 font-medium">{rental.vehicleModel}</span>
                    </div>
                  )}
                  {rental.hsn && (
                    <div>
                      <span className="text-gray-600">HSN:</span>
                      <span className="ml-2 font-medium">{rental.hsn}</span>
                    </div>
                  )}
                  {rental.tsn && (
                    <div>
                      <span className="text-gray-600">TSN:</span>
                      <span className="ml-2 font-medium">{rental.tsn}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fehlende Infos */}
          {missingInfo.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-900 mb-2">Fehlende Informationen</h3>
              <ul className="text-sm text-yellow-800 list-disc list-inside">
                {missingInfo.map((info, index) => (
                  <li key={index}>{info}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Availability Result */}
          {availabilityResult && (
            <div className={`p-4 rounded-lg border ${
              availabilityResult.isAvailable
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <h3 className="text-sm font-semibold mb-2">Verfügbarkeits-Prüfung</h3>
              <p className={`text-sm ${
                availabilityResult.isAvailable ? 'text-green-800' : 'text-red-800'
              }`}>
                {availabilityResult.isAvailable ? '✅ Frei' : '❌ Belegt'}
              </p>
              {availabilityResult.busyRanges && availabilityResult.busyRanges.length > 0 && (
                <div className="mt-2 text-xs text-red-700">
                  Belegt: {availabilityResult.busyRanges.map((r: any) =>
                    `${new Date(r.start).toLocaleString('de-DE')} - ${new Date(r.end).toLocaleString('de-DE')}`
                  ).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {nextStep && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="text-sm font-semibold text-blue-900">Nächster Schritt</h3>
              <p className="text-sm text-blue-800 mt-1">
                <strong>{nextStep.title}:</strong> {nextStep.text}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Belege zu diesem Vorgang</h3>
              <span className="text-xs text-gray-500">{linkedInvoices.length} verknüpft</span>
            </div>
            {linkedInvoices.length === 0 ? (
              <p className="text-sm text-gray-600">
                Noch keine Belege vorhanden.
              </p>
            ) : (
              <div className="space-y-2">
                {linkedInvoices.map((inv) => (
                  <div key={inv.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {inv.invoiceType} {inv.invoiceNo}
                        </div>
                        <div className="text-xs text-gray-600">
                          {new Date(inv.invoiceDate).toLocaleDateString('de-DE')} · {typeof invoiceAmountById[inv.id] === 'number' ? `${invoiceAmountById[inv.id].toFixed(2)} €` : '…'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {onOpenInvoice && (
                          <button
                            onClick={() => onOpenInvoice(inv.id)}
                            title="Beleg im Editor öffnen"
                            className="px-2 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                          >
                            Bearbeiten
                          </button>
                        )}
                        <button
                          onClick={() => openInvoicePreview(inv)}
                          title="PDF-Vorschau öffnen"
                          className="px-2 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                        >
                          Ansehen
                        </button>
                        <button
                          onClick={() => saveInvoicePdfViaPrintDialog(inv)}
                          title="PDF speichern oder drucken"
                          className="px-2 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                        >
                          PDF speichern
                        </button>
                        <button
                          onClick={() => {
                            const toEmail = (customer?.email || '').trim();
                            if (!toEmail) {
                              alert('Keine Kunden-E-Mail hinterlegt.');
                              return;
                            }
                            openInvoiceCompose({
                              invoice: inv,
                              toEmail,
                              customerName: customerLabel,
                              preferGmail: true,
                              mailTransportSettings,
                            });
                          }}
                          title="E-Mail an Kunden vorbereiten"
                          className="px-2 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                        >
                          Mail
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Aktionen</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Reschedule Button - always available */}
              <button
                onClick={() => {
                  setShowRescheduleModal(true);
                  // Pre-fill with current dates
                  const startForInput = new Date(rental.pickupDate || rental.rentalStart);
                  const endForInput = new Date(rental.returnDate || rental.rentalEnd);
                  setNewStartDate(formatDateForInput(startForInput.getTime()));
                  setNewEndDate(formatDateForInput(endForInput.getTime()));
                  setNewStartTime(formatTimeForInput(rental.pickupDate || rental.rentalStart, '10:00'));
                  setNewEndTime(formatTimeForInput(rental.returnDate || rental.rentalEnd, '18:00'));
                }}
                disabled={actionLoading}
                title="Mietzeitraum mit neuer Übergabe- und Rückgabezeit setzen"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 text-sm font-medium"
              >
                📅 Zeitraum ändern
              </button>
              {/* Check Availability */}
              {rental.status === 'neu' || rental.status === 'info_fehlt' ? (
                <button
                  onClick={handleCheckAvailability}
                  disabled={actionLoading}
                  title="Verfügbarkeit im Kalender prüfen"
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 text-sm font-medium"
                >
                  🔍 Verfügbarkeit prüfen
                </button>
              ) : null}

              {/* Generate Template */}
              {(rental.status === 'neu' || rental.status === 'info_fehlt' || rental.status === 'check_verfuegbarkeit') && (
                <>
                  <button
                    onClick={() => handleGenerateTemplate('availability')}
                    title="E-Mail-Antwort für Verfügbarkeit generieren"
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
                  >
                    📝 Verfügbarkeit Antwort
                  </button>

                  {rental.availabilityStatus === 'frei' && (
                    <button
                      onClick={() => handleGenerateTemplate('offer')}
                      title="Angebotstext für E-Mail generieren"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                      💰 Angebot Text
                    </button>
                  )}
                </>
              )}

              {/* Create Offer */}
              {rental.status === 'check_verfuegbarkeit' && rental.availabilityStatus === 'frei' && (
                <button
                  onClick={() => handlePrepareDocumentDraft('Angebot')}
                  disabled={actionLoading}
                  title="Neues Angebot erstellen und im Editor öffnen"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 text-sm font-medium col-span-2"
                >
                  ✅ Angebot vorbereiten
                </button>
              )}

              {/* Accept (if offered) */}
              {rental.status === 'angebot_gesendet' && (
                <>
                  <button
                    onClick={() => handlePrepareDocumentDraft('Angebot')}
                    title="Vorhandenes Angebot öffnen und anpassen"
                    className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm font-medium col-span-2"
                  >
                    🛠 Angebot überarbeiten
                  </button>
                  <button
                    onClick={async () => {
                      await handleTransitionAction('angenommen', (ts) => {
                        setRental((prev) => (prev ? { ...prev, acceptedAt: ts } : prev));
                      });
                    }}
                    title="Angebot als angenommen markieren und Workflow fortsetzen"
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                  >
                    ✅ Angenommen
                  </button>
                  <button
                    onClick={async () => {
                      const ok = confirm('Angebot als abgelehnt markieren?');
                      if (!ok) return;
                      await handleTransitionAction('abgelehnt', (ts) => {
                        setRental((prev) => (prev ? { ...prev, rejectedAt: ts } : prev));
                      });
                      alert('Angebot als abgelehnt gespeichert.');
                    }}
                    title="Angebot als abgelehnt markieren"
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
                  >
                    ❌ Angebot abgelehnt
                  </button>
                </>
              )}

              {rental.status === 'angenommen' && (
                <button
                  onClick={async () => {
                    await handleTransitionAction('uebergabe_rueckgabe');
                  }}
                  title="In den Status Übergabe/Rückgabe wechseln"
                  className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm font-medium col-span-2"
                >
                  🚚 Übergabe/Rückgabe starten
                </button>
              )}

              {rental.status === 'uebergabe_rueckgabe' && (
                <button
                  onClick={async () => {
                    // Prüfen ob verknüpfte Rechnung noch offen (gesendet/angenommen, nicht storniert/archiviert)
                    const unpaidInvoice = linkedInvoices.find(
                      (inv) => inv.invoiceType === 'Rechnung' && (inv.state === 'gesendet' || inv.state === 'angenommen')
                    );
                    const warningText = unpaidInvoice
                      ? `\n\n⚠️ Hinweis: Rechnung ${unpaidInvoice.invoiceNo} ist noch nicht als bezahlt markiert (Status: ${unpaidInvoice.state}).`
                      : '';
                    const ok = confirm(`Vorgang als abgeschlossen markieren?${warningText}`);
                    if (!ok) return;
                    await handleTransitionAction('abgeschlossen', (ts) => {
                      setRental((prev) => (prev ? { ...prev, completedAt: ts } : prev));
                    });
                  }}
                  title="Vorgang abschließen"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium col-span-2"
                >
                  ✅ Vorgang abschließen
                </button>
              )}


              {(rental.status === 'angenommen' || rental.status === 'uebergabe_rueckgabe') && (
                <>
                  <button
                    onClick={() => handlePrepareDocumentDraft('Auftrag')}
                    title="Auftrag aus diesem Vorgang erstellen"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    📄 Auftrag vorbereiten
                  </button>
                  <button
                    onClick={() => handlePrepareDocumentDraft('Rechnung')}
                    title="Rechnung aus diesem Vorgang erstellen"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                  >
                    🧾 Rechnung vorbereiten
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
function sanitizeRoofRackKey(raw?: string): string {
  const normalized = String(raw || '').trim();
  if (!normalized) return '';
  if (/^FIREBASE-[A-Z0-9]+$/i.test(normalized)) return '';
  return normalized;
}
