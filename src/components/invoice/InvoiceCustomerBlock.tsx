import { useFormContext } from 'react-hook-form';
import type { Customer } from '../../types';
import type { InvoiceFormValues } from './types';

interface InvoiceCustomerBlockProps {
  customers: Customer[];
}

export default function InvoiceCustomerBlock({ customers }: InvoiceCustomerBlockProps) {
  const { register, formState: { errors }, watch, setValue } = useFormContext<InvoiceFormValues>();
  
  const buyerName = watch('buyerName');
  const buyerAddress = watch('buyerAddress');
  const hasBuyerName = buyerName?.trim().length > 0;
  const hasBuyerAddress = buyerAddress?.trim().length > 0;

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="buyerName">
          Name *
        </label>
        <input 
          id="buyerName"
          type="text" 
          {...register('buyerName', { required: 'Name ist ein Pflichtfeld' })}
          className={[
            'w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
            errors.buyerName ? 'border-red-300 bg-red-50' : 'border-slate-300'
          ].join(' ')}
          placeholder="Max Mustermann" 
        />
        {errors.buyerName && <p className="mt-1 text-xs text-red-600">{errors.buyerName.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="buyerAddress">
          Adresse *
        </label>
        <textarea 
          id="buyerAddress"
          {...register('buyerAddress', { required: 'Adresse ist ein Pflichtfeld' })}
          rows={3}
          className={[
            'w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500',
            errors.buyerAddress ? 'border-red-300 bg-red-50' : 'border-slate-300'
          ].join(' ')}
          placeholder="Musterstraße 1&#10;12345 Musterstadt&#10;Deutschland" 
        />
        {errors.buyerAddress && <p className="mt-1 text-xs text-red-600">{errors.buyerAddress.message}</p>}
      </div>
    </div>
  );
}
