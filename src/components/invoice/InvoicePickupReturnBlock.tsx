import { useFormContext } from 'react-hook-form';
import type { InvoiceFormValues } from './types';

export default function InvoicePickupReturnBlock() {
  const { register, watch, setValue } = useFormContext<InvoiceFormValues>();
  const pickupDate = watch('pickupDate');
  const returnDate = watch('returnDate');
  const pickupEnabled = Boolean(pickupDate);
  const returnEnabled = Boolean(returnDate);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Abholung */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            id="pickup-enabled"
            type="checkbox"
            checked={pickupEnabled}
            onChange={(e) => { if (!e.target.checked) { setValue('pickupDate', ''); setValue('pickupTime', ''); } else { setValue('pickupDate', new Date().toISOString().slice(0, 10)); } }}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="pickup-enabled" className="text-sm font-medium text-gray-700 cursor-pointer">
            Abholung vereinbaren
          </label>
        </div>

        {pickupEnabled && (
          <div className="space-y-3 pl-6 border-l-2 border-indigo-200">
            <div className="space-y-1">
              <label htmlFor="pickup-date" className="block text-sm text-gray-700">Abholtag</label>
              <input
                id="pickup-date"
                type="date"
                {...register('pickupDate')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pickup-time" className="block text-sm text-gray-700">Uhrzeit</label>
              <input
                id="pickup-time"
                type="time"
                {...register('pickupTime')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Rückgabe */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            id="return-enabled"
            type="checkbox"
            checked={returnEnabled}
            onChange={(e) => { if (!e.target.checked) { setValue('returnDate', ''); setValue('returnTime', ''); } else { setValue('returnDate', new Date().toISOString().slice(0, 10)); } }}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="return-enabled" className="text-sm font-medium text-gray-700 cursor-pointer">
            Rückgabe vereinbaren
          </label>
        </div>

        {returnEnabled && (
          <div className="space-y-3 pl-6 border-l-2 border-indigo-200">
            <div className="space-y-1">
              <label htmlFor="return-date" className="block text-sm text-gray-700">Rückgabetag</label>
              <input
                id="return-date"
                type="date"
                {...register('returnDate')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="return-time" className="block text-sm text-gray-700">Uhrzeit</label>
              <input
                id="return-time"
                type="time"
                {...register('returnTime')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
