import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { InvoiceItem } from '../types';
import { RENTAL_PRODUCTS, getSuggestedPrice, DEFAULT_PRODUCT_KEY, DEFAULT_DURATION_LABEL } from '../config/rentalCatalog';

interface RentalLineItemsProps {
  items: InvoiceItem[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof InvoiceItem, value: string | number | boolean) => void;
}

export default function RentalLineItems({ items, onAdd, onRemove, onUpdate }: RentalLineItemsProps) {
  const firstSelectRef = useRef<HTMLSelectElement | null>(null);
  const prevLengthRef = useRef(items.length);

  useEffect(() => {
    if (items.length > prevLengthRef.current && firstSelectRef.current) {
      firstSelectRef.current.focus();
    }
    prevLengthRef.current = items.length;
  }, [items.length]);

  const handleProductChange = (index: number, productKey: string) => {
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    if (!product) return;
    const durationLabel = product.durations[0].label;
    const price = product.durations[0].price;
    onUpdate(index, 'name', `${product.label} – ${durationLabel}`);
    onUpdate(index, 'unit', durationLabel);
    onUpdate(index, 'unitPrice', price);
    onUpdate(index, 'quantity', 1);
  };

  const handleDurationChange = (index: number, productKey: string, durationLabel: string) => {
    const price = getSuggestedPrice(productKey, durationLabel);
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    const productLabel = product?.label ?? productKey;
    onUpdate(index, 'name', `${productLabel} – ${durationLabel}`);
    onUpdate(index, 'unit', durationLabel);
    onUpdate(index, 'unitPrice', price);
  };

  const parseProductKey = (item: InvoiceItem): string => {
    for (const p of RENTAL_PRODUCTS) {
      if (item.name.startsWith(p.label)) return p.key;
    }
    return DEFAULT_PRODUCT_KEY;
  };

  return (
    <div>
      <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <div className="col-span-5">Produkt</div>
        <div className="col-span-3">Dauer</div>
        <div className="col-span-2 text-right">Preis (€)</div>
        <div className="col-span-1 text-right">Gesamt</div>
        <div className="col-span-1"></div>
      </div>

      {items.map((item, index) => {
        const productKey = parseProductKey(item);
        const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
        const lineTotal = (item.unitPrice || 0) * (item.quantity || 1);
        const isLast = index === items.length - 1;

        return (
          <div
            key={(item as any).rhfId || item.id}
            className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center"
          >
            <div className="col-span-5">
              <label className="sr-only" htmlFor={`product-${index}`}>Produkt</label>
              <select
                id={`product-${index}`}
                ref={isLast ? firstSelectRef : undefined}
                value={productKey}
                onChange={(e) => handleProductChange(index, e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                aria-label={`Position ${index + 1}: Produkt`}
              >
                {RENTAL_PRODUCTS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              <label className="mt-1.5 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(item.withCarrier)}
                  onChange={(e) => onUpdate(index, 'withCarrier', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  aria-label={`Position ${index + 1}: mit Träger`}
                />
                <span className="text-xs text-slate-600">mit Träger</span>
              </label>
            </div>

            <div className="col-span-3">
              <label className="sr-only" htmlFor={`duration-${index}`}>Dauer</label>
              <select
                id={`duration-${index}`}
                value={item.unit || DEFAULT_DURATION_LABEL}
                onChange={(e) => handleDurationChange(index, productKey, e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                aria-label={`Position ${index + 1}: Dauer`}
              >
                {(product?.durations ?? []).map((d) => (
                  <option key={d.label} value={d.label}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="sr-only" htmlFor={`price-${index}`}>Preis</label>
              <div className="relative">
                <input
                  id={`price-${index}`}
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => onUpdate(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                  className="w-full pl-2 pr-6 py-1.5 border border-slate-300 rounded-md text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label={`Position ${index + 1}: Preis`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">€</span>
              </div>
            </div>

            <div className="col-span-1 text-right">
              <span className="text-sm font-semibold text-slate-800">{lineTotal.toFixed(2)} €</span>
            </div>

            <div className="col-span-1 flex justify-center">
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-slate-400 hover:text-red-600 transition-colors p-1"
                title={`Position ${index + 1} löschen`}
                aria-label={`Position ${index + 1} löschen`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}

      <div className="px-4 py-3">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
          title="Neue Position hinzufügen"
        >
          + Position hinzufügen
        </button>
      </div>
    </div>
  );
}
