import React, { useState } from 'react';
import { VehicleData } from '../types';

interface VehicleFormProps {
  data: VehicleData;
  onChange: (data: VehicleData) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const VehicleForm: React.FC<VehicleFormProps> = ({ data, onChange, onSubmit, isLoading }) => {
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof VehicleData, string>> = {};
    let isValid = true;

    if (!data.make.trim()) {
      newErrors.make = 'Marke ist erforderlich.';
      isValid = false;
    }

    if (!data.model.trim()) {
      newErrors.model = 'Modell ist erforderlich.';
      isValid = false;
    }

    if (!data.year.trim()) {
      newErrors.year = 'Baujahr ist erforderlich.';
      isValid = false;
    }

    // HSN validation: 4 digits (numeric)
    if (data.hsn && !/^\d{4}$/.test(data.hsn)) {
      newErrors.hsn = 'HSN muss 4 Zahlen enthalten.';
      isValid = false;
    }

    // TSN validation: 3 alphanumeric characters
    if (data.tsn && !/^[A-Za-z0-9]{3}$/.test(data.tsn)) {
      newErrors.tsn = 'TSN muss 3 Zeichen enthalten.';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onChange({
      ...data,
      [name]: value
    });
    
    // Clear error for this field when user types
    if (errors[name as keyof VehicleData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit();
    }
  };

  const getInputClass = (fieldName: keyof VehicleData) => {
    const baseClass = "w-full px-4 py-2 border rounded-lg outline-none transition text-slate-800 placeholder-slate-400";
    if (errors[fieldName]) {
      return `${baseClass} border-red-500 focus:ring-2 focus:ring-red-200 focus:border-red-500`;
    }
    return `${baseClass} border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500`;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center justify-between">
        <span className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Fahrzeugdaten
        </span>
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Kundeninfos Section */}
        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-3">
          <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">Verwaltung (Optional)</h3>
          <div>
            <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-1">Kunde / Referenz</label>
            <input
              type="text"
              id="customerName"
              name="customerName"
              placeholder="z.B. Max Mustermann"
              value={data.customerName || ''}
              onChange={handleChange}
              className={getInputClass('customerName')}
            />
          </div>
        </div>

        {/* Fahrzeugdaten Section */}
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="make" className="block text-sm font-medium text-slate-700 mb-1">Marke *</label>
                <input
                type="text"
                id="make"
                name="make"
                placeholder="z.B. Volkswagen"
                value={data.make}
                onChange={handleChange}
                className={getInputClass('make')}
                />
                {errors.make && <p className="text-red-500 text-xs mt-1">{errors.make}</p>}
            </div>
            <div>
                <label htmlFor="model" className="block text-sm font-medium text-slate-700 mb-1">Modell *</label>
                <input
                type="text"
                id="model"
                name="model"
                placeholder="z.B. Passat Variant"
                value={data.model}
                onChange={handleChange}
                className={getInputClass('model')}
                />
                {errors.model && <p className="text-red-500 text-xs mt-1">{errors.model}</p>}
            </div>
            </div>

            <div>
            <label htmlFor="year" className="block text-sm font-medium text-slate-700 mb-1">Baujahr *</label>
            <input
                type="text"
                id="year"
                name="year"
                placeholder="z.B. 2019"
                value={data.year}
                onChange={handleChange}
                className={getInputClass('year')}
            />
            {errors.year && <p className="text-red-500 text-xs mt-1">{errors.year}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="col-span-2 text-xs text-slate-500 mb-1 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Für höhere Genauigkeit empfohlen:
            </div>
            <div>
                <label htmlFor="hsn" className="block text-sm font-medium text-slate-700 mb-1">HSN</label>
                <input
                type="text"
                id="hsn"
                name="hsn"
                maxLength={4}
                placeholder="0603"
                value={data.hsn}
                onChange={handleChange}
                className={`${getInputClass('hsn')} font-mono uppercase`}
                />
                {errors.hsn && <p className="text-red-500 text-xs mt-1">{errors.hsn}</p>}
            </div>
            <div>
                <label htmlFor="tsn" className="block text-sm font-medium text-slate-700 mb-1">TSN</label>
                <input
                type="text"
                id="tsn"
                name="tsn"
                maxLength={3}
                placeholder="AYI"
                value={data.tsn}
                onChange={handleChange}
                className={`${getInputClass('tsn')} font-mono uppercase`}
                />
                {errors.tsn && <p className="text-red-500 text-xs mt-1">{errors.tsn}</p>}
            </div>
            </div>

            <div>
                <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">Interne Notizen</label>
                <textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="z.B. Kunde benötigt Träger für 2 Wochen, möchte Dachbox dazu."
                value={data.notes || ''}
                onChange={handleChange}
                className={getInputClass('notes')}
                />
            </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 px-6 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-200 
            ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analysiere Fahrzeug...
            </span>
          ) : (
            'Träger prüfen & Speichern'
          )}
        </button>
      </form>
    </div>
  );
};

export default VehicleForm;