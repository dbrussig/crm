export interface RentalDurationOption {
  label: string;
  price: number;
}

export interface RentalProduct {
  key: string;
  label: string;
  durations: RentalDurationOption[];
}

const EXTRA_DURATIONS: RentalDurationOption[] = [
  { label: 'Tage', price: 0 },
  { label: 'Wochen', price: 0 },
  { label: 'Pauschal', price: 0 },
];

function withExtras(durations: RentalDurationOption[]): RentalDurationOption[] {
  const existing = new Set(durations.map((d) => d.label));
  return [...durations, ...EXTRA_DURATIONS.filter((e) => !existing.has(e.label))];
}

export const RENTAL_PRODUCTS: RentalProduct[] = [
  {
    key: 'dachbox-1-xl',
    label: 'Dachbox 524L (XL) inkl. Träger',
    durations: withExtras([
      { label: '1 Woche', price: 55 },
      { label: '2 Wochen', price: 90 },
      { label: '3 Wochen', price: 135 },
    ]),
  },
  {
    key: 'dachbox-1-xl-ohne',
    label: 'Dachbox 524L (XL) ohne Träger',
    durations: withExtras([
      { label: '1 Woche', price: 45 },
      { label: '2 Wochen', price: 75 },
      { label: '3 Wochen', price: 115 },
    ]),
  },
  {
    key: 'dachbox-2-xl',
    label: 'Dachbox 2. XL inkl. Träger',
    durations: withExtras([
      { label: '1 Woche', price: 55 },
      { label: '2 Wochen', price: 90 },
      { label: '3 Wochen', price: 135 },
    ]),
  },
  {
    key: 'dachbox-3-m',
    label: 'Dachbox 304L (M) inkl. Träger',
    durations: withExtras([
      { label: '1 Woche', price: 45 },
      { label: '2 Wochen', price: 70 },
      { label: '3 Wochen', price: 110 },
    ]),
  },
  {
    key: 'dachbox-3-m-ohne',
    label: 'Dachbox 304L (M) ohne Träger',
    durations: withExtras([
      { label: '1 Woche', price: 35 },
      { label: '2 Wochen', price: 55 },
      { label: '3 Wochen', price: 85 },
    ]),
  },
  {
    key: 'heckbox',
    label: 'Heckbox',
    durations: withExtras([
      { label: '1 Woche', price: 50 },
      { label: '2 Wochen', price: 80 },
      { label: '3 Wochen', price: 120 },
    ]),
  },
  {
    key: 'fahrradtraeger',
    label: 'Fahrradträger',
    durations: withExtras([
      { label: '1 Tag', price: 8 },
      { label: '1 Woche', price: 50 },
      { label: '2 Wochen', price: 80 },
      { label: '3 Wochen', price: 120 },
    ]),
  },
  {
    key: 'huepfburg',
    label: 'Hüpfburg',
    durations: withExtras([
      { label: '1 Tag (Mo–Fr)', price: 40 },
      { label: '1 Tag (Sa/So/Feiertag)', price: 50 },
      { label: 'Wochenende (Fr–So)', price: 75 },
    ]),
  },
  {
    key: 'dachtraeger',
    label: 'Dachträger (allein)',
    durations: withExtras([
      { label: '1 Woche', price: 10 },
      { label: '2 Wochen', price: 15 },
      { label: '3 Wochen', price: 20 },
    ]),
  },
  {
    key: 'sonstige',
    label: 'Sonstige Leistung',
    durations: [
      { label: '1 Tag', price: 0 },
      { label: 'Tage', price: 0 },
      { label: '1 Woche', price: 0 },
      { label: 'Wochenende', price: 0 },
      { label: 'Pauschal', price: 0 },
    ],
  },
];

export function getProduct(key: string): RentalProduct | undefined {
  return RENTAL_PRODUCTS.find((p) => p.key === key);
}

export function getSuggestedPrice(productKey: string, durationLabel: string): number {
  const product = getProduct(productKey);
  if (!product) return 0;
  const duration = product.durations.find((d) => d.label === durationLabel);
  return duration?.price ?? 0;
}

export const DEFAULT_PRODUCT_KEY = RENTAL_PRODUCTS[0].key;
export const DEFAULT_DURATION_LABEL = RENTAL_PRODUCTS[0].durations[0].label;
