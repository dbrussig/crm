import React from 'react';
import type { InvoiceItem } from '../types';

type Labels = {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  unit?: string;
  tax?: string;
  lineTotal?: string;
};

export default function InvoiceLineItems(props: {
  items: InvoiceItem[];
  labels?: Labels | null;
  showQty: boolean;
  showUnit: boolean;
  showUnitPrice: boolean;
  showTax: boolean;
  showLineTotal: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof InvoiceItem, value: string | number) => void;
}) {
  const { items, labels, showQty, showUnit, showUnitPrice, showTax, showLineTotal, onAdd, onRemove, onUpdate } = props;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">Positionen</h3>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 text-sm font-medium transition-colors"
          title="Neue Position hinzufügen"
        >
          + Position
        </button>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
          <div className="col-span-1">#</div>
          <div className="col-span-5">{labels?.description || 'Beschreibung'}</div>
          {showQty && <div className="col-span-2">{labels?.quantity || 'Menge'}</div>}
          {showUnitPrice && <div className="col-span-2">{labels?.unitPrice || 'EP (€)'}</div>}
          <div className="col-span-1"></div>
        </div>

        {items.map((item, index) => (
          <div key={(item as any).rhfId || item.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 items-start hover:bg-gray-50 transition-colors group">
            <div className="col-span-1 text-sm text-gray-500">{index + 1}</div>

            <div className="col-span-5">
              <textarea
                value={item.name}
                onChange={(e) => onUpdate(index, 'name', e.target.value)}
                rows={2}
                className="w-full px-2 py-1 border-0 bg-transparent rounded text-sm hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition-colors"
                placeholder="Beschreibung"
                aria-label={`Position ${index + 1}: Beschreibung`}
              />
              <div className="mt-1 flex gap-2">
                {showUnit && (
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => onUpdate(index, 'unit', e.target.value)}
                    className="w-20 px-2 py-1 border-0 bg-transparent rounded text-xs hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-300 transition-colors"
                    placeholder={labels?.unit || 'Einheit'}
                    aria-label={`Position ${index + 1}: ${labels?.unit || 'Einheit'}`}
                  />
                )}
                {showTax && (
                  <input
                    type="number"
                    value={item.taxPercent}
                    onChange={(e) => onUpdate(index, 'taxPercent', parseFloat(e.target.value))}
                    step="0.01"
                    className="w-20 px-2 py-1 border-0 bg-transparent rounded text-xs hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-300 transition-colors"
                    placeholder={labels?.tax || 'USt.'}
                    aria-label={`Position ${index + 1}: ${labels?.tax || 'USt.'}`}
                  />
                )}
              </div>
            </div>

            {showQty && (
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => onUpdate(index, 'quantity', parseFloat(e.target.value))}
                  step="0.01"
                  className="w-full px-2 py-1 border-0 bg-transparent rounded text-sm text-right hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-300 transition-colors"
                  aria-label={`Position ${index + 1}: ${labels?.quantity || 'Menge'}`}
                />
              </div>
            )}

            {showUnitPrice && (
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => onUpdate(index, 'unitPrice', parseFloat(e.target.value))}
                  step="0.01"
                  className="w-full px-2 py-1 border-0 bg-transparent rounded text-sm text-right hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-300 transition-colors"
                  aria-label={`Position ${index + 1}: ${labels?.unitPrice || 'Einzelpreis'}`}
                />
              </div>
            )}

            <div className="col-span-1">
              <button
                onClick={() => onRemove(index)}
                className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"
                title="Position löschen"
                aria-label={`Position ${index + 1} löschen`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>

            {showLineTotal && (
              <div className="col-span-11 col-start-2 mt-2 text-right text-sm text-gray-600">
                {labels?.lineTotal || 'Betrag'}: {(item.unitPrice * item.quantity).toFixed(2)} €
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
