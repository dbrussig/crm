import { Customer } from '../../types';

interface InvoiceCustomerBlockProps {
  customers: Customer[];
  selectedCustomerId: string;
  onCustomerChange: (id: string) => void;
  salutation: string;
  onSalutationChange: (v: string) => void;
  buyerName: string;
  onBuyerNameChange: (v: string) => void;
  buyerAddress: string;
  onBuyerAddressChange: (v: string) => void;
  showValidationErrors: boolean;
  clearStatus: () => void;
  hasBuyerName: boolean;
  hasBuyerAddress: boolean;
}

export default function InvoiceCustomerBlock(props: InvoiceCustomerBlockProps) {
  const {
    customers, selectedCustomerId, onCustomerChange,
    salutation, onSalutationChange,
    buyerName, onBuyerNameChange,
    buyerAddress, onBuyerAddressChange,
    showValidationErrors, clearStatus, hasBuyerName, hasBuyerAddress,
  } = props;

  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Kunde</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-customer">Kunde wählen</label>
          <select id="invoice-customer" value={selectedCustomerId}
            onChange={(e) => onCustomerChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
            <option value="">-- Kunde wählen --</option>
            {customers.map((c) => (<option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-salutation">Anrede</label>
          <select id="invoice-salutation" value={salutation}
            onChange={(e) => onSalutationChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
            <option value="">-- Keine --</option>
            <option value="Herr">Herr</option>
            <option value="Frau">Frau</option>
            <option value="Divers">Divers</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-buyer-name">Name</label>
        <input id="invoice-buyer-name" type="text" value={buyerName}
          onChange={(e) => { onBuyerNameChange(e.target.value); if (showValidationErrors) clearStatus(); }}
          className={['w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
            showValidationErrors && !hasBuyerName ? 'border-red-300 bg-red-50' : 'border-gray-300'].join(' ')}
          placeholder="Max Mustermann" />
        {showValidationErrors && !hasBuyerName && <p className="mt-1 text-xs text-red-600">Name ist ein Pflichtfeld.</p>}
      </div>
      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-buyer-address">Adresse</label>
        <textarea id="invoice-buyer-address" value={buyerAddress}
          onChange={(e) => { onBuyerAddressChange(e.target.value); if (showValidationErrors) clearStatus(); }}
          rows={3}
          className={['w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
            showValidationErrors && !hasBuyerAddress ? 'border-red-300 bg-red-50' : 'border-gray-300'].join(' ')}
          placeholder="Musterstraße 1&#10;12345 Musterstadt&#10;Deutschland" />
        {showValidationErrors && !hasBuyerAddress && <p className="mt-1 text-xs text-red-600">Adresse ist ein Pflichtfeld.</p>}
      </div>
    </div>
  );
}
