import type { ProductType } from '../types';
import { websiteProductIdForProductType } from '../config/websiteCatalog';
import pricingXml from '../config/pricing.xml?raw';

type SeasonPeriod = {
  label: string;
  start: string; // MM-DD
  end: string;   // MM-DD
  surchargePerWeek: number;
};

type Rate = {
  label: string;
  withRack: number;
  withoutRack?: number;
  weeks?: number;
  days?: number;
};

type PricingConfig = {
  supportsRoofRack: boolean;
  seasonPeriods: SeasonPeriod[];
  calculator: {
    weeklyRates: Rate[];
    dayRates?: { weekday?: Rate; weekend?: Rate };
    weekendRate?: Rate | null;
  };
};

const MS_IN_DAY = 1000 * 60 * 60 * 24;

function toNumber(value: string | null): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parsePricingXml(xml: string): Record<number, PricingConfig> {
  if (typeof window === 'undefined') {
    // Vite will still bundle this for the browser; server-side use is out of scope.
    return {};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('pricing.xml konnte nicht geparst werden.');
  }

  const byId: Record<number, PricingConfig> = {};
  const products = Array.from(doc.querySelectorAll('pricing > product'));

  for (const product of products) {
    const id = toNumber(product.getAttribute('id'));
    if (!id) continue;

    const supportsRoofRack = product.getAttribute('supportsRoofRack') === 'true';

    const seasonPeriods: SeasonPeriod[] = Array.from(product.querySelectorAll('seasonPeriods > period'))
      .map((p) => ({
        label: p.getAttribute('label') || '',
        start: p.getAttribute('start') || '',
        end: p.getAttribute('end') || '',
        surchargePerWeek: toNumber(p.getAttribute('surchargePerWeek')) || 0,
      }))
      .filter((p) => p.surchargePerWeek > 0 && p.start && p.end);

    const weeklyRates: Rate[] = Array.from(product.querySelectorAll('calculator > weeklyRates > rate'))
      .map((r) => ({
        label: r.getAttribute('label') || '',
        weeks: toNumber(r.getAttribute('weeks')) || 1,
        withRack: toNumber(r.getAttribute('withRack')) || 0,
        withoutRack: toNumber(r.getAttribute('withoutRack')),
      }))
      .filter((r) => r.withRack > 0);

    const dayRates: { weekday?: Rate; weekend?: Rate } = {};
    for (const r of Array.from(product.querySelectorAll('calculator > dayRates > rate'))) {
      const type = r.getAttribute('type');
      if (type !== 'weekday' && type !== 'weekend') continue;
      const rate: Rate = {
        label: r.getAttribute('label') || '',
        withRack: toNumber(r.getAttribute('withRack')) || 0,
        withoutRack: toNumber(r.getAttribute('withoutRack')),
      };
      if (rate.withRack <= 0) continue;
      (dayRates as any)[type] = rate;
    }

    const weekendNode = product.querySelector('calculator > weekendRate');
    const weekendRate: Rate | null = weekendNode
      ? {
          label: weekendNode.getAttribute('label') || '',
          days: toNumber(weekendNode.getAttribute('days')) || 3,
          withRack: toNumber(weekendNode.getAttribute('withRack')) || 0,
          withoutRack: toNumber(weekendNode.getAttribute('withoutRack')),
        }
      : null;

    byId[id] = {
      supportsRoofRack,
      seasonPeriods,
      calculator: {
        weeklyRates,
        dayRates: Object.keys(dayRates).length ? dayRates : undefined,
        weekendRate,
      },
    };
  }

  return byId;
}

let pricingByIdCache: Record<number, PricingConfig> | null = null;
function getPricingById(): Record<number, PricingConfig> {
  if (pricingByIdCache) return pricingByIdCache;
  pricingByIdCache = parsePricingXml(pricingXml);
  return pricingByIdCache;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function localDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatISOFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calculateEaster(year: number): Date {
  const f = Math.floor;
  const a = year % 19;
  const b = f(year / 100);
  const c = year % 100;
  const d = f(b / 4);
  const e = b % 4;
  const g = f((8 * b + 13) / 25);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = f(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = f((a + 11 * h + 22 * l) / 451);
  const month = f((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function buildHolidaySet(startYear: number, endYear: number): Set<string> {
  const set = new Set<string>();
  for (let year = startYear; year <= endYear; year++) {
    // Static nationwide holidays + a few moveable ones based on Easter.
    set.add(`${year}-01-01`);
    set.add(`${year}-05-01`);
    set.add(`${year}-10-03`);
    set.add(`${year}-12-25`);
    set.add(`${year}-12-26`);

    const easter = calculateEaster(year);
    set.add(formatISOFromDate(addDays(easter, -2))); // Karfreitag
    set.add(formatISOFromDate(addDays(easter, 1))); // Ostermontag
    set.add(formatISOFromDate(addDays(easter, 39))); // Christi Himmelfahrt
    set.add(formatISOFromDate(addDays(easter, 50))); // Pfingstmontag
  }
  return set;
}

function isPublicHoliday(date: Date, holidaySet: Set<string>): boolean {
  return holidaySet.has(formatISOFromDate(date));
}

function parseSeasonBoundary(value: string): { month: number; day: number } | null {
  if (!value) return null;
  const [m, d] = value.split('-').map(Number);
  if (!m || !d) return null;
  return { month: m, day: d };
}

function isDateWithinSeason(date: Date, period: SeasonPeriod): boolean {
  const startValue = parseSeasonBoundary(period.start);
  const endValue = parseSeasonBoundary(period.end);
  if (!startValue || !endValue) return false;

  const current = (date.getMonth() + 1) * 100 + date.getDate();
  const startNumber = startValue.month * 100 + startValue.day;
  const endNumber = endValue.month * 100 + endValue.day;
  if (startNumber <= endNumber) {
    return current >= startNumber && current <= endNumber;
  }
  return current >= startNumber || current <= endNumber;
}

function calculateSeasonImpact(start: Date, end: Date, seasonPeriods: SeasonPeriod[]): { seasonSurcharge: number; seasonWeeks: number } {
  if (!Array.isArray(seasonPeriods) || seasonPeriods.length === 0) {
    return { seasonSurcharge: 0, seasonWeeks: 0 };
  }

  const counters = seasonPeriods.map((p) => ({ period: p, days: 0 }));
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
    for (const entry of counters) {
      if (isDateWithinSeason(cursor, entry.period)) entry.days += 1;
    }
  }

  return counters.reduce(
    (acc, entry) => {
      if (!entry.days || !(entry.period.surchargePerWeek > 0)) return acc;
      const weeks = Math.ceil(entry.days / 7);
      return {
        seasonSurcharge: acc.seasonSurcharge + weeks * entry.period.surchargePerWeek,
        seasonWeeks: acc.seasonWeeks + weeks,
      };
    },
    { seasonSurcharge: 0, seasonWeeks: 0 }
  );
}

function selectPrice(rate: Rate, supportsRoofRack: boolean, includeRoofRack: boolean): number {
  if (!supportsRoofRack) return rate.withRack;
  if (includeRoofRack) return rate.withRack;
  return typeof rate.withoutRack === 'number' ? rate.withoutRack : rate.withRack;
}

export function calculateWebsitePrice(opts: {
  productType: ProductType;
  start: Date;
  end: Date;
  includeRoofRack?: boolean;
}): { total: number; basePrice: number; seasonSurcharge: number; breakdown: string[] } | { error: string } {
  const productId = websiteProductIdForProductType(opts.productType);
  const pricing = getPricingById()[productId];
  if (!pricing?.calculator) return { error: 'Preislogik nicht gefunden.' };

  const start = localDateOnly(opts.start);
  const end = localDateOnly(opts.end);
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Ungültige Datumsangabe.' };
  }
  if (end <= start) return { error: 'Das Enddatum muss nach dem Startdatum liegen.' };

  const includeRoofRack = pricing.supportsRoofRack ? Boolean(opts.includeRoofRack ?? true) : true;

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / MS_IN_DAY);
  if (totalDays <= 0) return { error: 'Der Mietzeitraum muss mindestens einen Tag umfassen.' };

  const holidaySet = buildHolidaySet(start.getFullYear(), end.getFullYear());
  let remainingDays = totalDays;
  let cursor = new Date(start);
  let basePrice = 0;
  const breakdown: string[] = [];

  const weeklyRates = [...(pricing.calculator.weeklyRates || [])].sort((a, b) => (b.weeks || 0) - (a.weeks || 0));
  const smallestWeeklyRate = [...(pricing.calculator.weeklyRates || [])].sort((a, b) => (a.weeks || 0) - (b.weeks || 0))[0];

  while (remainingDays >= 7 && weeklyRates.length > 0) {
    const remainingWeeks = Math.floor(remainingDays / 7);
    const matching = weeklyRates.find((r) => (r.weeks || 1) <= remainingWeeks) || weeklyRates[weeklyRates.length - 1];
    if (!matching) break;
    const consumedDays = (matching.weeks || 1) * 7;
    const price = selectPrice(matching, pricing.supportsRoofRack, includeRoofRack);
    basePrice += price;
    breakdown.push(`${matching.label}: ${price.toFixed(2)} EUR`);
    remainingDays -= consumedDays;
    cursor = addDays(cursor, consumedDays);
  }

  const weekendPackageDays = pricing.calculator.weekendRate?.days || 3;
  while (pricing.calculator.weekendRate && remainingDays >= weekendPackageDays && cursor.getDay() === 5) {
    const rate = pricing.calculator.weekendRate;
    const price = selectPrice(rate, pricing.supportsRoofRack, includeRoofRack);
    basePrice += price;
    breakdown.push(`${rate.label}: ${price.toFixed(2)} EUR`);
    remainingDays -= weekendPackageDays;
    cursor = addDays(cursor, weekendPackageDays);
  }

  const hasDayRates = Boolean(pricing.calculator.dayRates?.weekday || pricing.calculator.dayRates?.weekend);
  while (remainingDays > 0 && hasDayRates) {
    const isHolidayOrWeekend = isWeekend(cursor) || isPublicHoliday(cursor, holidaySet);
    const rate = isHolidayOrWeekend ? pricing.calculator.dayRates?.weekend : pricing.calculator.dayRates?.weekday;
    if (!rate) break;
    const price = selectPrice(rate, pricing.supportsRoofRack, includeRoofRack);
    basePrice += price;
    breakdown.push(`${rate.label} (${formatISOFromDate(cursor)}): ${price.toFixed(2)} EUR`);
    remainingDays -= 1;
    cursor = addDays(cursor, 1);
  }

  if (remainingDays > 0 && !hasDayRates) {
    if (smallestWeeklyRate) {
      const price = selectPrice(smallestWeeklyRate, pricing.supportsRoofRack, includeRoofRack);
      basePrice += price;
      breakdown.push(`Mindestmiete (${smallestWeeklyRate.label}): ${price.toFixed(2)} EUR`);
    } else if (pricing.calculator.weekendRate) {
      const price = selectPrice(pricing.calculator.weekendRate, pricing.supportsRoofRack, includeRoofRack);
      basePrice += price;
      breakdown.push(`Pauschale (${pricing.calculator.weekendRate.label}): ${price.toFixed(2)} EUR`);
    } else {
      return { error: 'Für einzelne Tage ist kein Preis hinterlegt.' };
    }
  }

  const { seasonSurcharge, seasonWeeks } = calculateSeasonImpact(start, end, pricing.seasonPeriods || []);
  if (seasonWeeks > 0 && seasonSurcharge > 0) {
    breakdown.push(`Saisonaufschlag: ${seasonSurcharge.toFixed(2)} EUR`);
  }

  return {
    total: Math.round((basePrice + seasonSurcharge) * 100) / 100,
    basePrice: Math.round(basePrice * 100) / 100,
    seasonSurcharge: Math.round(seasonSurcharge * 100) / 100,
    breakdown,
  };
}

