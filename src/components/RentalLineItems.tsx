import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { InvoiceItem, Resource } from '../types';
import { RENTAL_PRODUCTS, getSuggestedPrice, DEFAULT_PRODUCT_KEY, DEFAULT_DURATION_LABEL } from '../config/rentalCatalog';

interface RentalLineItemsProps {
  items: InvoiceItem[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof InvoiceItem, value: string | number | boolean) => void;
  resources?: Resource[];
}

const RESOURCE_TYPE_TO_CATALOG_KEY: Record<string, string> = {
  'Dachbox XL': 'dachbox-1-xl',
  'Dachbox L': 'dachbox-3-m',
  'Dachbox M': 'dachbox-3-m',
  'Heckbox': 'heckbox',
  'Fahrradträger': 'fahrradtraeger',
  'Hüpfburg': 'huepfburg',
};

export default function RentalLineItems({ items, onAdd, onRemove, onUpdate, resources }: RentalLineItemsProps) {
  const useResources = resources && resources.length > 0;
  const firstSelectRef = useRef<HTMLSelectElement | null>(null);
  const prevLengthRef = useRef(items.length);

  useEffect(() => {
    if (items.length > prevLengthRef.current && firstSelectRef.current) {
      firstSelectRef.current.focus();
    }
    prevLengthRef.current = items.length;
  }, [items.length]);

  const handleProductChange = (index: number, productKey: string) => {
    if (useResources) {
      const res = resources!.find((r) => r.id === productKey);
      if (!res) return;
      onUpdate(index, 'name', res.name);
      onUpdate(index, 'unit', DEFAULT_DURATION_LABEL);
      onUpdate(index, 'unitPrice', res.dailyRate || 0);
      onUpdate(index, 'quantity', 1);
      return;
    }
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    if (!product) return;
    const durationLabel = product.durations[0].label;
    const price = product.durations[0].price;
    onUpdate(index, 'name', product.label);
    onUpdate(index, 'unit', durationLabel);
    onUpdate(index, 'unitPrice', price);
    onUpdate(index, 'quantity', 1);
  };

  const handleDurationChange = (index: number, productKey: string, durationLabel: string) => {
    const price = getSuggestedPrice(productKey, durationLabel);
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    onUpdate(index, 'name', product?.label ?? productKey);
    onUpdate(index, 'unit', durationLabel);
    onUpdate(index, 'unitPrice', price);
  };

  const handleDaysChange = (index: number, days: number) => {
    const count = Math.max(1, days);
    onUpdate(index, 'unit', `${count} Tag${count !== 1 ? 'e' : ''}`);
    onUpdate(index, 'quantity', count);
  };

  const handleWeeksChange = (index: number, weeks: number) => {
    const count = Math.max(1, weeks);
    onUpdate(index, 'unit', `${count} Woche${count !== 1 ? 'n' : ''}`);
    onUpdate(index, 'quantity', count);
  };

  const parseProductKey = (item: InvoiceItem): string => {
    if (useResources) {
      const res = resources!.find((r) => r.name === item.name || item.name.startsWith(r.name));
      if (res) return res.id;
      return resources![0]?.id || DEFAULT_PRODUCT_KEY;
    }
    for (const p of RENTAL_PRODUCTS) {
      if (item.name === p.label || item.name.startsWith(p.label)) return p.key;
    }
    return DEFAULT_PRODUCT_KEY;
  };

  const parseDurationMode = (unit: string): { mode: string; days: number; weeks: number } => {
    const daysMatch = unit.match(/^(\d+)\s*Tage?$/i);
    if (daysMatch) return { mode: 'Tage', days: parseInt(daysMatch[1], 10), weeks: 1 };
    const weeksMatch = unit.match(/^(\d+)\s*Wochen?$/i);
    if (weeksMatch) return { mode: 'Wochen', days: 1, weeks: parseInt(weeksMatch[1], 10) };
    return { mode: unit, days: 1, weeks: 1 };
  };

  return (
    <div>
      <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <div className="col-span-4">Produkt</div>
        <div className="col-span-3">Dauer</div>
        <div className="col-span-2 text-right">Preis/Einheit (€)</div>
        <div className="col-span-2 text-right">Gesamt (€)</div>
        <div className="col-span-1"></div>
      </div>

      {items.map((item, index) => {
        const productKey = parseProductKey(item);
        const resource = useResources ? resources!.find((r) => r.id === productKey) : undefined;
        const product = useResources
          ? RENTAL_PRODUCTS.find((p) => p.key === (resource ? RESOURCE_TYPE_TO_CATALOG_KEY[resource.type] : undefined))
            ?? RENTAL_PRODUCTS.find((p) => p.key === 'sonstige')
          : RENTAL_PRODUCTS.find((p) => p.key === productKey);
        const { mode: durationMode, days: durationDays, weeks: durationWeeks } = parseDurationMode(item.unit || DEFAULT_DURATION_LABEL);
        const isTageMode = durationMode === 'Tage';
        const isWochenMode = durationMode === 'Wochen';
        const lineTotal = (item.unitPrice || 0) * (item.quantity || 1);
        const isLast = index === items.length - 1;

        return (
          <div
            key={(item as any).rhfId || item.id}
            className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-start"
          >
            {/* Produkt */}
            <div className="col-span-4">
              <label className="sr-only" htmlFor={`product-${index}`}>Produkt</label>
              <select
                id={`product-${index}`}
                ref={isLast ? firstSelectRef : undefined}
                value={productKey}
                onChange={(e) => handleProductChange(index, e.target.value)}
                className="w-full h-9 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                aria-label={`Position ${index + 1}: Produkt`}
              >
                {useResources
                  ? resources!.filter((r) => r.isActive).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))
                  : RENTAL_PRODUCTS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))
                }
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

            {/* Dauer */}
            <div className="col-span-3 space-y-1">
              <label className="sr-only" htmlFor={`duration-${index}`}>Dauer</label>
              <select
                id={`duration-${index}`}
                value={isTageMode ? 'Tage' : isWochenMode ? 'Wochen' : (item.unit || DEFAULT_DURATION_LABEL)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Tage') {
                    onUpdate(index, 'unit', `${durationDays} Tag${durationDays !== 1 ? 'e' : ''}`);
                    onUpdate(index, 'quantity', durationDays);
                  } else if (val === 'Wochen') {
                    onUpdate(index, 'unit', `${durationWeeks} Woche${durationWeeks !== 1 ? 'n' : ''}`);
                    onUpdate(index, 'quantity', durationWeeks);
                  } else {
                    handleDurationChange(index, productKey, val);
                    onUpdate(index, 'quantity', 1);
                  }
                }}
                className="w-full h-9 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                aria-label={`Position ${index + 1}: Dauer`}
              >
                {(product?.durations ?? []).map((d) => (
                  <option key={d.label} value={d.label}>{d.label}</option>
                ))}
              </select>
              {isTageMode && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    value={durationDays}
                    onChange={(e) => handleDaysChange(index, parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                    title="Anzahl Tage"
                    aria-label={`Position ${index + 1}: Anzahl Tage`}
                  />
                  <span className="text-xs text-slate-500">Tage</span>
                </div>
              )}
              {isWochenMode && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    value={durationWeeks}
                    onChange={(e) => handleWeeksChange(index, parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                    title="Anzahl Wochen"
                    aria-label={`Position ${index + 1}: Anzahl Wochen`}
                  />
                  <span className="text-xs text-slate-500">Wochen</span>
                </div>
              )}
            </div>

            {/* Preis */}
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
                  className="w-full h-9 pl-2 pr-6 py-1.5 border border-slate-300 rounded-md text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label={`Position ${index + 1}: Preis`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">€</span>
              </div>
            </div>

            {/* Gesamt */}
            <div className="col-span-2 py-1.5 text-right">
              <span className="text-sm font-semibold text-slate-800">{lineTotal.toFixed(2)} €</span>
            </div>

            {/* Löschen */}
            <div className="col-span-1 flex justify-center pt-1">
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
