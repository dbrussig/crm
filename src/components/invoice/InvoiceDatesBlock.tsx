interface InvoiceDatesBlockProps {
  invoiceDate: string;
  onInvoiceDateChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  servicePeriodStart: string;
  onServicePeriodStartChange: (value: string) => void;
  servicePeriodEnd: string;
  onServicePeriodEndChange: (value: string) => void;
}

export default function InvoiceDatesBlock({
  invoiceDate,
  onInvoiceDateChange,
  dueDate,
  onDueDateChange,
  servicePeriodStart,
  onServicePeriodStartChange,
  servicePeriodEnd,
  onServicePeriodEndChange,
}: InvoiceDatesBlockProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-date">
          Belegdatum
        </label>
        <input
          id="invoice-date"
          type="date"
          value={invoiceDate}
          onChange={(e) => onInvoiceDateChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invoice-due">
          Fällig am
        </label>
        <input
          id="invoice-due"
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="service-period-start">
          Leistungszeitraum von
        </label>
        <input
          id="service-period-start"
          type="date"
          value={servicePeriodStart}
          onChange={(e) => onServicePeriodStartChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="service-period-end">
          Leistungszeitraum bis
        </label>
        <input
          id="service-period-end"
          type="date"
          value={servicePeriodEnd}
          onChange={(e) => onServicePeriodEndChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}
