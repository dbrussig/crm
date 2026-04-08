interface Totals {
  subtotal: number;
  tax: number;
  total: number;
  hasTax: boolean;
  effectiveTaxRate: number;
  singleTaxRate?: number;
}

interface InvoiceTotalsSummaryProps {
  totals: Totals;
  showDeposit: boolean;
  depositEnabled: boolean;
  depositText: string;
  depositPercent: number;
  depositAmountPreview: number;
  grandTotal: number;
}

export default function InvoiceTotalsSummary({
  totals, showDeposit, depositEnabled, depositText, depositPercent, depositAmountPreview, grandTotal,
}: InvoiceTotalsSummaryProps) {
  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Zwischensumme:</span>
          <span className="font-medium">{totals.subtotal.toFixed(2)} €</span>
        </div>
        {totals.hasTax && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">USt. ({totals.singleTaxRate != null ? `${totals.singleTaxRate}%` : `${totals.effectiveTaxRate}%`}):</span>
            <span className="font-medium">{totals.tax.toFixed(2)} €</span>
          </div>
        )}
        {showDeposit && depositEnabled && depositText && depositAmountPreview > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Anzahlung ({depositPercent || 0}%):</span>
            <span className="font-medium">{depositAmountPreview.toFixed(2)} €</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
          <span>Gesamtbetrag:</span>
          <span>{grandTotal.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
}
