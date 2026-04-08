import { InvoiceType, InvoiceTemplate } from '../../types';
import { INVOICE_LAYOUTS } from '../../config/invoiceLayouts';

interface InvoiceHeaderFieldsProps {
  invoiceType: InvoiceType;
  onTypeChange: (t: InvoiceType) => void;
  typeDisabled: boolean;
  invoiceNo: string;
  onInvoiceNoChange: (v: string) => void;
  invoiceNoDisabled: boolean;
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
    layoutId, onLayoutChange, onApplyDefaults,
    invoiceDate, onDateChange, dueDate, onDueDateChange,
  } = props;

  return (
    <div className="mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-type">Typ</label>
        <select id="invoice-type" value={invoiceType}
          onChange={(e) => onTypeChange(e.target.value as InvoiceType)} disabled={typeDisabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100">
          <option value="Angebot">Angebot</option>
          <option value="Auftrag">Auftrag</option>
          <option value="Rechnung">Rechnung</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-no">Belegnummer</label>
        <input id="invoice-no" type="text" value={invoiceNo}
          onChange={(e) => onInvoiceNoChange(e.target.value)} disabled={invoiceNoDisabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="2025001" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-layout">PDF Layout</label>
        <div className="flex items-center gap-2">
          <select id="invoice-layout" value={layoutId} onChange={(e) => onLayoutChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
            {INVOICE_LAYOUTS.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
          </select>
          <button type="button" className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 whitespace-nowrap"
            title="Setzt Default-Texte fuer dieses Layout" onClick={onApplyDefaults}>
            Default-Texte
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-date">Datum</label>
        <input id="invoice-date" type="date" value={invoiceDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-due">Fälligkeit</label>
        <input id="invoice-due" type="date" value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
      </div>
    </div>
  );
}
