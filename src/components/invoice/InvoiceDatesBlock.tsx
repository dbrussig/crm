import { useFormContext } from 'react-hook-form';
import type { InvoiceFormValues } from './types';

export default function InvoiceDatesBlock() {
  const { register } = useFormContext<InvoiceFormValues>();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="invoiceDate">
          Belegdatum
        </label>
        <input
          id="invoiceDate"
          type="date"
          {...register('invoiceDate')}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="dueDate">
          Fällig am
        </label>
        <input
          id="dueDate"
          type="date"
          {...register('dueDate')}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="servicePeriodStart">
          Leistungszeitraum von
        </label>
        <input
          id="servicePeriodStart"
          type="date"
          {...register('servicePeriodStart')}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="servicePeriodEnd">
          Leistungszeitraum bis
        </label>
        <input
          id="servicePeriodEnd"
          type="date"
          {...register('servicePeriodEnd')}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
        />
      </div>
    </div>
  );
}
