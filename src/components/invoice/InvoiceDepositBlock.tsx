import { InvoiceType } from '../../types';

interface InvoiceDepositBlockProps {
  invoiceType: InvoiceType;
  depositEnabled: boolean;
  onDepositEnabledChange: (enabled: boolean) => void;
  depositPercent: number;
  onDepositPercentChange: (value: number) => void;
  depositText: string;
  onDepositTextChange: (value: string) => void;
}

export default function InvoiceDepositBlock({
  invoiceType,
  depositEnabled,
  onDepositEnabledChange,
  depositPercent,
  onDepositPercentChange,
  depositText,
  onDepositTextChange,
}: InvoiceDepositBlockProps) {
  const isDepositSupportedType = invoiceType === 'Angebot' || invoiceType === 'Auftrag';

  if (!isDepositSupportedType) return null;

  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">Anzahlung</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={depositEnabled}
            onChange={(e) => onDepositEnabledChange(e.target.checked)}
          />
          Anzahlung aktivieren
        </label>
      </div>

      {depositEnabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="deposit-percent">
              Prozent
            </label>
            <input
              id="deposit-percent"
              type="number"
              min="0"
              max="100"
              step="1"
              value={depositPercent}
              onChange={(e) => onDepositPercentChange(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="deposit-text">
              Text
            </label>
            <input
              id="deposit-text"
              type="text"
              value={depositText}
              onChange={(e) => onDepositTextChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Anzahlung 50 % nach Angebotsannahme"
            />
          </div>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        Optional: Wird im PDF als zusätzliche Zeile in der Tabelle angezeigt (Betrag = Gesamt × Prozent).
      </p>
    </div>
  );
}
