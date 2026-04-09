import { useFormContext } from 'react-hook-form';
import type { Customer } from '../../types';
import type { InvoiceFormValues } from './types';

interface InvoiceCustomerBlockProps {
  customers: Customer[];
}

export default function InvoiceCustomerBlock({ customers }: InvoiceCustomerBlockProps) {
  const { register, watch, setValue } = useFormContext<InvoiceFormValues>();

  const buyerName = watch('buyerName');
  const buyerAddress = watch('buyerAddress');

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setValue('companyId', customerId);
      setValue('buyerName', `${customer.firstName} ${customer.lastName}`);
      setValue('buyerAddress', `${customer.address.street}\n${customer.address.zipCode} ${customer.address.city}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden inputs damit Formwerte erhalten bleiben */}
      <input type="hidden" {...register('buyerName', { required: true })} />
      <input type="hidden" {...register('buyerAddress', { required: true })} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="salutation">
            Anrede
          </label>
          <select
            id="salutation"
            {...register('salutation')}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">-- Keine --</option>
            <option value="Herr">Herr</option>
            <option value="Frau">Frau</option>
            <option value="Divers">Divers</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="companyId">
            Kunde wählen
          </label>
          <select
            id="companyId"
            {...register('companyId')}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">-- Kunde wählen --</option>
            {customers.map((c) => (<option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>))}
          </select>
        </div>
      </div>

      {buyerName?.trim() ? (
        <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-800 space-y-0.5">
          <div className="font-medium">{buyerName.trim()}</div>
          {buyerAddress?.trim().split('\n').map((line, i) => (
            <div key={i} className="text-slate-600">{line}</div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-700">
          Bitte Kunden wählen
        </div>
      )}
    </div>
  );
}
