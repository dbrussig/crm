import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { InvoiceItem, RentalAccessory, Resource } from '../types';
import { RENTAL_PRODUCTS, getSuggestedPrice, DEFAULT_PRODUCT_KEY, DEFAULT_DURATION_LABEL } from '../config/rentalCatalog';
import { checkAccessoryAvailability } from '../services/sqliteService';

interface RentalLineItemsProps {
  items: InvoiceItem[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof InvoiceItem, value: string | number | boolean) => void;
  onUpdateMulti?: (index: number, updates: Partial<InvoiceItem>) => void;
  resources?: Resource[];
  accessories?: RentalAccessory[];
  invoiceId?: string;
  servicePeriodStartMs?: number;
  servicePeriodEndMs?: number;
}

const RESOURCE_TYPE_TO_CATALOG_KEY: Record<string, string> = {
  'Dachbox XL': 'dachbox-1-xl',
  'Dachbox L': 'dachbox-3-m',
  'Dachbox M': 'dachbox-3-m',
  'Heckbox': 'heckbox',
  'Fahrradträger': 'fahrradtraeger',
  'Hüpfburg': 'huepfburg',
};

export default function RentalLineItems({
  items,
  onAdd,
  onRemove,
  onUpdate,
  onUpdateMulti,
  resources,
  accessories,
  invoiceId,
  servicePeriodStartMs,
  servicePeriodEndMs,
}: RentalLineItemsProps) {
  const useResources = resources && resources.length > 0;
  const firstSelectRef = useRef<HTMLSelectElement | null>(null);
  const prevLengthRef = useRef(items.length);
  const [accessoryErrorByItemId, setAccessoryErrorByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (items.length > prevLengthRef.current && firstSelectRef.current) {
      firstSelectRef.current.focus();
    }
    prevLengthRef.current = items.length;
  }, [items.length]);

  const applyUpdate = (index: number, updates: Partial<InvoiceItem>) => {
    if (onUpdateMulti) { onUpdateMulti(index, updates); return; }
    Object.entries(updates).forEach(([k, v]) => onUpdate(index, k as keyof InvoiceItem, v as string | number | boolean));
  };

  const accessoriesMap = useMemo(() => {
    const map = new Map<string, RentalAccessory>();
    for (const a of accessories ?? []) map.set(a.id, a);
    return map;
  }, [accessories]);

  const formatAccessoryShort = useMemo(
    () => (accessoryId: string): string => {
      const a = accessoriesMap.get(accessoryId);
      if (!a) return `Träger (${accessoryId})`;
      const key = String(a.inventoryKey || '').trim();
      if (key) return /^#/.test(key) ? `Träger ${key}` : `Träger #${key}`;
      return `Träger ${a.name || a.id}`;
    },
    [accessoriesMap]
  );

  const formatInvoiceNo = useMemo(
    () => (invoiceNo?: string): string => {
      const no = String(invoiceNo || '').trim();
      if (!no) return '#—';
      return no.startsWith('#') ? no : `#${no}`;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // No period => clear all local error markers.
      if (!servicePeriodStartMs || !servicePeriodEndMs) {
        setAccessoryErrorByItemId((prev) => (Object.keys(prev).length ? {} : prev));
        return;
      }

      const relevant = items.filter((it) => Boolean(it.withCarrier) && Boolean(it.assignedAccessoryId));
      if (relevant.length === 0) {
        setAccessoryErrorByItemId((prev) => (Object.keys(prev).length ? {} : prev));
        return;
      }

      const checks = await Promise.all(relevant.map(async (it) => {
        const accessoryId = String(it.assignedAccessoryId || '').trim();
        if (!accessoryId) return { itemId: it.id, message: '' };
        try {
          const res = await checkAccessoryAvailability(accessoryId, servicePeriodStartMs, servicePeriodEndMs, {
            excludeInvoiceId: invoiceId || undefined,
            excludeInvoiceItemId: it.id,
          });
          if (res.isAvailable) return { itemId: it.id, message: '' };
          const msg = `${formatAccessoryShort(accessoryId)} ist in diesem Zeitraum bereits durch Beleg ${formatInvoiceNo(res.conflict?.invoiceNo)} vergeben.`;
          return { itemId: it.id, message: msg };
        } catch (e: any) {
          const msg = `${formatAccessoryShort(accessoryId)} konnte nicht geprüft werden: ${e?.message || String(e)}`;
          return { itemId: it.id, message: msg };
        }
      }));

      if (cancelled) return;

      setAccessoryErrorByItemId(() => {
        const next: Record<string, string> = {};
        for (const { itemId, message } of checks) {
          if (message) next[itemId] = message;
        }
        return next;
      });
    }

    void run();
    return () => { cancelled = true; };
  }, [items, invoiceId, servicePeriodStartMs, servicePeriodEndMs, formatAccessoryShort, formatInvoiceNo]);

  const handleProductChange = (index: number, productKey: string) => {
    if (useResources) {
      const res = resources!.find((r) => r.id === productKey);
      if (!res) return;
      applyUpdate(index, { name: res.name, unit: DEFAULT_DURATION_LABEL, unitPrice: res.dailyRate || 0, quantity: 1 });
      return;
    }
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    if (!product) return;
    applyUpdate(index, { name: product.label, unit: product.durations[0].label, unitPrice: product.durations[0].price, quantity: 1 });
  };

  const handleDurationChange = (index: number, productKey: string, durationLabel: string, resourceName?: string) => {
    if (useResources && resourceName) {
      applyUpdate(index, { name: resourceName, unit: durationLabel });
      return;
    }
    const price = getSuggestedPrice(productKey, durationLabel);
    const product = RENTAL_PRODUCTS.find((p) => p.key === productKey);
    applyUpdate(index, { name: product?.label ?? productKey, unit: durationLabel, unitPrice: price });
  };

  const handleDaysChange = (index: number, days: number) => {
    const count = Math.max(1, days);
    applyUpdate(index, { unit: `${count} Tag${count !== 1 ? 'e' : ''}`, quantity: count });
  };

  const handleWeeksChange = (index: number, weeks: number) => {
    const count = Math.max(1, weeks);
    applyUpdate(index, { unit: `${count} Woche${count !== 1 ? 'n' : ''}`, quantity: count });
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

  const fieldCls = 'h-9 px-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div>
      {/* Header */}
      <div className="hidden sm:grid px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider"
        style={{ gridTemplateColumns: '1fr 180px 130px 90px 80px 32px' }}>
        <div>Produkt</div>
        <div>Dauer</div>
        <div>Menge</div>
        <div className="text-right">Preis/Stk.</div>
        <div className="text-right">Gesamt</div>
        <div />
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
        const accessoryError = accessoryErrorByItemId[item.id] || '';

        return (
          <div
            key={(item as any).rhfId || item.id}
            className="grid items-center gap-2 px-4 py-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
            style={{ gridTemplateColumns: '1fr 180px 130px 90px 80px 32px' }}
          >
            {/* Produkt + mit Träger inline */}
            <div className="flex items-center gap-2 min-w-0">
              <select
                id={`product-${index}`}
                ref={isLast ? firstSelectRef : undefined}
                value={productKey}
                onChange={(e) => handleProductChange(index, e.target.value)}
                className={`${fieldCls} flex-1 min-w-0`}
                aria-label={`Position ${index + 1}: Produkt`}
              >
                {useResources
                  ? resources!.filter((r) => r.isActive).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))
                  : RENTAL_PRODUCTS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))
                }
              </select>
              <label
                className={`flex items-center gap-1 px-2 h-9 rounded-md border text-xs font-medium cursor-pointer select-none transition-colors whitespace-nowrap ${
                  item.withCarrier
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
                title="mit Träger"
              >
                <input
                  type="checkbox"
                  checked={Boolean(item.withCarrier)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (!checked) {
                      applyUpdate(index, { withCarrier: false, assignedAccessoryId: null });
                    } else {
                      applyUpdate(index, { withCarrier: true });
                    }
                  }}
                  className="sr-only"
                  aria-label={`Position ${index + 1}: mit Träger`}
                />
                <span className={`w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                  item.withCarrier ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                }`}>
                  {item.withCarrier && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                Träger
              </label>
            </div>

            {/* Dauer-Dropdown */}
            <div>
              <select
                id={`duration-${index}`}
                value={isTageMode ? 'Tage' : isWochenMode ? 'Wochen' : (item.unit || DEFAULT_DURATION_LABEL)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Tage') {
                    applyUpdate(index, { ...(useResources && resource ? { name: resource.name } : {}), unit: `${durationDays} Tag${durationDays !== 1 ? 'e' : ''}`, quantity: durationDays });
                  } else if (val === 'Wochen') {
                    applyUpdate(index, { ...(useResources && resource ? { name: resource.name } : {}), unit: `${durationWeeks} Woche${durationWeeks !== 1 ? 'n' : ''}`, quantity: durationWeeks });
                  } else {
                    handleDurationChange(index, productKey, val, resource?.name);
                    applyUpdate(index, { quantity: 1 });
                  }
                }}
                className={`${fieldCls} w-full`}
                aria-label={`Position ${index + 1}: Dauer`}
              >
                {(product?.durations ?? []).map((d) => (
                  <option key={d.label} value={d.label}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Menge: Zahl + Einheit inline */}
            <div className="flex items-center gap-1">
              {(isTageMode || isWochenMode) ? (
                <>
                  <input
                    type="number"
                    min="1"
                    value={isTageMode ? durationDays : durationWeeks}
                    onChange={(e) => isTageMode
                      ? handleDaysChange(index, parseInt(e.target.value) || 1)
                      : handleWeeksChange(index, parseInt(e.target.value) || 1)}
                    className={`${fieldCls} w-14 text-right`}
                    title={isTageMode ? 'Anzahl Tage' : 'Anzahl Wochen'}
                    aria-label={`Position ${index + 1}: Anzahl`}
                  />
                  <span className="text-xs text-slate-500 whitespace-nowrap">{isTageMode ? 'Tage' : 'Wo.'}</span>
                </>
              ) : (
                <input
                  type="number"
                  min="1"
                  value={item.quantity || 1}
                  onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 1)}
                  className={`${fieldCls} w-14 text-right`}
                  title="Menge"
                  aria-label={`Position ${index + 1}: Menge`}
                />
              )}
            </div>

            {/* Preis */}
            <div className="relative">
              <input
                id={`price-${index}`}
                type="number"
                value={item.unitPrice}
                onChange={(e) => onUpdate(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0"
                className={`${fieldCls} w-full text-right pr-5`}
                aria-label={`Position ${index + 1}: Preis`}
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">€</span>
            </div>

            {/* Gesamt – prominent */}
            <div className="text-right">
              <span className="text-sm font-bold text-slate-900 tabular-nums">{lineTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
            </div>

            {/* Löschen */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                title={`Position ${index + 1} löschen`}
                aria-label={`Position ${index + 1} löschen`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>

            {/* Internes Zubehör (Träger) */}
            {item.withCarrier && (
              <div style={{ gridColumn: '1 / -1' }} className="pt-2 pb-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor={`carrier-${index}`}>
                      Träger zuweisen
                    </label>
                    <select
                      id={`carrier-${index}`}
                      value={String(item.assignedAccessoryId || '')}
                      onChange={(e) => {
                        const nextId = String(e.target.value || '').trim();
                        applyUpdate(index, { assignedAccessoryId: nextId ? nextId : null });
                      }}
                      className={[
                        fieldCls,
                        'w-full',
                        accessoryError ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' : '',
                      ].join(' ')}
                      title={accessoryError || undefined}
                      aria-invalid={accessoryError ? 'true' : 'false'}
                    >
                      <option value="">Bitte auswählen…</option>
                      {(accessories ?? [])
                        .slice()
                        .sort((a, b) => String(a.inventoryKey || a.name).localeCompare(String(b.inventoryKey || b.name), 'de'))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {String(a.inventoryKey || '').trim() ? `#${String(a.inventoryKey).trim()} — ` : ''}{a.name}
                          </option>
                        ))}
                    </select>
                    {accessoryError ? (
                      <div className="mt-1 text-xs text-red-600">{accessoryError}</div>
                    ) : null}
                    {!servicePeriodStartMs || !servicePeriodEndMs ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Hinweis: Bitte Mietzeitraum setzen, damit die Verfügbarkeit geprüft werden kann.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="px-4 py-2.5">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
          title="Neue Position hinzufügen"
        >
          + Position hinzufügen
        </button>
      </div>
    </div>
  );
}
