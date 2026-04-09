import { InvoiceType, InvoiceState } from '../../types';
import { INVOICE_LAYOUTS } from '../../config/invoiceLayouts';

interface InvoiceHeaderFieldsProps {
  invoiceType: InvoiceType;
  onTypeChange: (t: InvoiceType) => void;
  typeDisabled: boolean;
  invoiceNo: string;
  onInvoiceNoChange: (v: string) => void;
  invoiceNoDisabled: boolean;
  state: InvoiceState;
  onStateChange: (s: InvoiceState) => void;
  layoutId: string;
  onLayoutChange: (id: string) => void;
  onApplyDefaults: () => Promise<void>;
  invoiceDate: string;
  onDateChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
}

export default function InvoiceHeaderFields(props: InvoiceHeaderFieldsProps) {
  const {
    invoiceType, onTypeChange, typeDisabled,
    invoiceNo, onInvoiceNoChange, invoiceNoDisabled,
    state, onStateChange,
    layoutId, onLayoutChange, onApplyDefaults,
    invoiceDate, onDateChange, dueDate, onDueDateChange,
  } = props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-type">Typ</label>
        <select id="invoice-type" value={invoiceType}
          onChange={(e) => onTypeChange(e.target.value as InvoiceType)} disabled={typeDisabled}
          className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 text-sm">
          <option value="Angebot">Angebot</option>
          <option value="Auftrag">Auftrag</option>
          <option value="Rechnung">Rechnung</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-no">Belegnummer</label>
        <input id="invoice-no" type="text" value={invoiceNo}
          onChange={(e) => onInvoiceNoChange(e.target.value)} disabled={invoiceNoDisabled}
          className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 text-sm"
          placeholder="AN-2026-01" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-state">Status</label>
        <select id="invoice-state" value={state}
          onChange={(e) => onStateChange(e.target.value as InvoiceState)}
          className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm">
          <option value="entwurf">Entwurf</option>
          <option value="gesendet">Gesendet</option>
          <option value="angenommen">Angenommen</option>
          <option value="abgelehnt">Abgelehnt</option>
          <option value="bezahlt">Bezahlt</option>
          <option value="storniert">Storniert</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-date">Datum</label>
        <input id="invoice-date" type="date" value={invoiceDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-due">Fälligkeit</label>
        <input id="invoice-due" type="date" value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" />
      </div>
    </div>
  );
}
