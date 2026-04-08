import { Invoice, InvoiceItem, InvoiceTemplate, Customer } from '../types';
import { downloadInvoicePDF, openInvoicePreview, saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { openInvoiceCompose } from '../services/invoiceEmailService';

interface UseInvoiceExportOpts {
  buildInvoice: () => Invoice;
  getFields: () => InvoiceItem[];
  template: InvoiceTemplate | null;
  customers: Customer[];
  selectedCustomerId: string;
  buyerName: string;
  showStatus: (status: { tone: 'error' | 'info'; text: string }, minDisplayMs?: number) => void;
  clearStatus: () => void;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }) => Promise<boolean>;
}

export function useInvoiceExport({
  buildInvoice,
  getFields,
  template,
  customers,
  selectedCustomerId,
  buyerName,
  showStatus,
  clearStatus,
  requestConfirm,
}: UseInvoiceExportOpts) {

  const handleDownloadHtml = async () => {
    if (!template) {
      showStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }
    try {
      await downloadInvoicePDF(buildInvoice(), getFields(), template);
      clearStatus();
    } catch (error) {
      console.error('PDF Export fehlgeschlagen:', error);
      showStatus({ tone: 'error', text: 'HTML/PDF Export fehlgeschlagen. Bitte erneut versuchen.' });
    }
  };

  const handlePreviewPdf = async () => {
    if (!template) {
      showStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }
    try {
      await openInvoicePreview(buildInvoice(), getFields(), template);
      clearStatus();
    } catch (error) {
      console.error('PDF Öffnen fehlgeschlagen:', error);
      showStatus({ tone: 'error', text: 'PDF Vorschau konnte nicht geöffnet werden.' });
    }
  };

  const handleSavePdf = async () => {
    if (!template) {
      showStatus({ tone: 'error', text: 'Template nicht geladen. Bitte Belegtyp/Layout prüfen.' });
      return;
    }
    try {
      await saveInvoicePdfViaPrintDialog(buildInvoice(), getFields(), template);
      clearStatus();
    } catch (error) {
      console.error('PDF Speichern fehlgeschlagen:', error);
      showStatus({ tone: 'error', text: 'PDF Speichern fehlgeschlagen.' });
    }
  };

  const handleMailCustomer = async () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const toEmail = (customer?.email || '').trim();
    if (!toEmail) {
      showStatus({ tone: 'error', text: 'Keine Kunden-E-Mail hinterlegt. Bitte Kundenprofil ergänzen.' });
      return;
    }
    try {
      const result = await openInvoiceCompose({
        invoice: buildInvoice(),
        toEmail,
        customerName: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || buyerName,
        preferGmail: true,
      });
      if (result.type === 'sent' || result.type === 'warning') {
        showStatus({ tone: 'info', text: result.message });
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
        showStatus({ tone: 'info', text: 'Mail-Entwurf im Browser geöffnet.' });
      }
    } catch (e) {
      console.error('Mail Draft fehlgeschlagen:', e);
      showStatus({ tone: 'error', text: 'Mail-Entwurf konnte nicht geöffnet werden.' });
    }
  };

  return { handleDownloadHtml, handlePreviewPdf, handleSavePdf, handleMailCustomer };
}
