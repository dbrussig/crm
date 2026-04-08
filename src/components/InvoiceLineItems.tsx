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
  onRemove: (itemId: string) => void;
  onUpdate: <K extends keyof InvoiceItem>(itemId: string, field: K, value: InvoiceItem[K]) => void;
}) {
  const { items, labels, showQty, showUnit, showUnitPrice, showTax, showLineTotal, onAdd, onRemove, onUpdate } = props;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">Positionen</h3>
        <button
          onClick={onAdd}
          className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
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
          <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200 items-start">
            <div className="col-span-1 text-sm text-gray-500">{index + 1}</div>

            <div className="col-span-5">
              <textarea
                value={item.name}
                onChange={(e) => onUpdate(item.id, 'name', e.target.value)}
                rows={2}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Beschreibung"
                aria-label={`Position ${index + 1}: Beschreibung`}
              />
              <div className="mt-1 flex gap-2">
                {showUnit && (
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                    placeholder={labels?.unit || 'Einheit'}
                    aria-label={`Position ${index + 1}: ${labels?.unit || 'Einheit'}`}
                  />
                )}
                {showTax && (
                  <input
                    type="number"
                    value={item.taxPercent}
                    onChange={(e) => onUpdate(item.id, 'taxPercent', parseFloat(e.target.value))}
                    step="0.01"
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
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
                  onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value))}
                  step="0.01"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  aria-label={`Position ${index + 1}: ${labels?.quantity || 'Menge'}`}
                />
              </div>
            )}

            {showUnitPrice && (
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => onUpdate(item.id, 'unitPrice', parseFloat(e.target.value))}
                  step="0.01"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  aria-label={`Position ${index + 1}: ${labels?.unitPrice || 'Einzelpreis'}`}
                />
              </div>
            )}

            <div className="col-span-1">
              <button
                onClick={() => onRemove(item.id)}
                className="text-red-600 hover:text-red-700"
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
