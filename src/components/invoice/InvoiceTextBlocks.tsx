import { InvoiceLayout } from '../../config/invoiceLayouts';

interface InvoiceTextBlocksProps {
  layout: InvoiceLayout;
  hasNonEmptyAdvancedFields: boolean;
  introText: string;
  onIntroTextChange: (value: string) => void;
  paymentTerms: string;
  onPaymentTermsChange: (value: string) => void;
  paymentInfo: string;
  onPaymentInfoChange: (value: string) => void;
  paypalText: string;
  onPaypalTextChange: (value: string) => void;
  taxNote: string;
  onTaxNoteChange: (value: string) => void;
  agbText: string;
  onAgbTextChange: (value: string) => void;
  agbLink: string;
  onAgbLinkChange: (value: string) => void;
  footerText: string;
  onFooterTextChange: (value: string) => void;
  paypalMeUrl?: string;
  agbsUrl?: string;
}

export default function InvoiceTextBlocks({
  layout,
  hasNonEmptyAdvancedFields,
  introText,
  onIntroTextChange,
  paymentTerms,
  onPaymentTermsChange,
  paymentInfo,
  onPaymentInfoChange,
  paypalText,
  onPaypalTextChange,
  taxNote,
  onTaxNoteChange,
  agbText,
  onAgbTextChange,
  agbLink,
  onAgbLinkChange,
  footerText,
  onFooterTextChange,
  paypalMeUrl = '',
  agbsUrl = '',
}: InvoiceTextBlocksProps) {
  const hasAdvancedTextBlocks = layout.editorBlocks.some(
    (b) => b === 'payment' || b === 'paypal' || b === 'taxNote' || b === 'agbLink' || b === 'footer'
  );

  if (!hasAdvancedTextBlocks && !layout.editorBlocks.includes('intro')) return null;

  return (
    <div className="space-y-6">
      {/* Intro Text */}
      {layout.editorBlocks.includes('intro') && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Einleitungstext</h3>
          <textarea
            value={introText}
            onChange={(e) => onIntroTextChange(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="z.B. Vielen Dank für Ihre Anfrage..."
          />
        </div>
      )}

      {/* Advanced Text Blocks */}
      {hasAdvancedTextBlocks && (
        <details
          open={hasNonEmptyAdvancedFields}
          className="rounded-lg border border-slate-200 bg-slate-50/70"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800">
            Erweiterte Texte &amp; Bedingungen
          </summary>
          <div className="space-y-6 border-t border-slate-200 bg-white px-4 py-4">
            {layout.editorBlocks.includes('payment') && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Zahlungsbedingungen</h3>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="invoice-payment-terms"
                  >
                    Bedingungen
                  </label>
                  <textarea
                    id="invoice-payment-terms"
                    value={paymentTerms}
                    onChange={(e) => onPaymentTermsChange(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <div className="mt-3">
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="invoice-payment-info"
                  >
                    Zahlungsinfo (optional)
                  </label>
                  <input
                    id="invoice-payment-info"
                    type="text"
                    value={paymentInfo}
                    onChange={(e) => onPaymentInfoChange(e.target.value)}
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
                  onChange={(e) => onPaypalTextChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder={`Zahlungslink Paypal ${paypalMeUrl}`}
                />
              </div>
            )}

            {layout.editorBlocks.includes('taxNote') && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Steuerhinweis</h3>
                <textarea
                  id="invoice-tax-note"
                  value={taxNote}
                  onChange={(e) => onTaxNoteChange(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="z.B. Steuerfrei nach § 19 UStG (Kleinunternehmer)"
                />
              </div>
            )}

            {layout.editorBlocks.includes('agbLink') && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Links</h3>
                <div className="space-y-3">
                  <div>
                    <label
                      className="block text-sm font-medium text-gray-700 mb-1"
                      htmlFor="invoice-agb-text"
                    >
                      AGB Text (wie im PDF)
                    </label>
                    <input
                      id="invoice-agb-text"
                      type="text"
                      value={agbText}
                      onChange={(e) => onAgbTextChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={`Bitte beachten Sie die gültigen AGBs auf meiner Homepage: ${agbsUrl}`}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium text-gray-700 mb-1"
                      htmlFor="invoice-agb-link"
                    >
                      AGB Link
                    </label>
                    <input
                      id="invoice-agb-link"
                      type="text"
                      value={agbLink}
                      onChange={(e) => onAgbLinkChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {layout.editorBlocks.includes('footer') && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Footer / Hinweis</h3>
                <textarea
                  id="invoice-footer"
                  value={footerText}
                  onChange={(e) => onFooterTextChange(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
