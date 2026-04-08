import { useRef, useState, useEffect } from 'react';
import { InvoiceItem, InvoiceType, InvoiceState } from '../types';

interface ExternalState {
  invoiceType: InvoiceType;
  state: InvoiceState;
  selectedCustomerId: string;
  layoutId: string;
}

interface UseInvoiceDirtyTrackingOpts {
  getValues: () => Record<string, unknown>;
  fields: InvoiceItem[];
  externalState: ExternalState;
  formVersion: unknown; // result of watch() — triggers on every form change
  template: unknown; // template object — triggers baseline initialization
}

export function useInvoiceDirtyTracking({
  getValues,
  fields,
  externalState,
  formVersion,
  template,
}: UseInvoiceDirtyTrackingOpts) {
  const dirtyBaselineRef = useRef<string>('');
  const dirtyInitializedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  const buildDirtySnapshot = () => {
    const vals = getValues();
    return JSON.stringify({
      ...externalState,
      invoiceNo: vals.invoiceNo,
      invoiceDate: vals.invoiceDate,
      dueDate: vals.dueDate,
      currency: vals.currency,
      buyerName: vals.buyerName,
      buyerAddress: vals.buyerAddress,
      salutation: vals.salutation,
      introText: vals.introText,
      servicePeriodStart: vals.servicePeriodStart,
      servicePeriodEnd: vals.servicePeriodEnd,
      depositPercent: vals.depositPercent,
      depositText: vals.depositText,
      depositEnabled: vals.depositEnabled,
      depositReceivedEnabled: vals.depositReceivedEnabled,
      depositReceivedAmount: vals.depositReceivedAmount,
      paymentTerms: vals.paymentTerms,
      paymentInfo: vals.paymentInfo,
      paypalText: vals.paypalText,
      footerText: vals.footerText,
      taxNote: vals.taxNote,
      agbText: vals.agbText,
      agbLink: vals.agbLink,
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

  // Initialize dirty baseline once we have a template (defaults filled).
  useEffect(() => {
    if (dirtyInitializedRef.current) return;
    if (!template) return;
    dirtyBaselineRef.current = buildDirtySnapshot();
    dirtyInitializedRef.current = true;
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Recompute dirty after edits — single subscription triggers on any form change.
  useEffect(() => {
    if (!dirtyInitializedRef.current) return;
    const next = buildDirtySnapshot();
    setIsDirty(next !== dirtyBaselineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formVersion, externalState.invoiceType, externalState.state, externalState.selectedCustomerId, externalState.layoutId, fields]);

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

  const resetDirtyBaseline = () => {
    dirtyBaselineRef.current = buildDirtySnapshot();
    setIsDirty(false);
  };

  return { isDirty, setIsDirty, buildDirtySnapshot, resetDirtyBaseline };
}
