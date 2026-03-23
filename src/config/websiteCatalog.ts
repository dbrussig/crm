import type { ProductType, Resource } from '../types';

export type WebsiteResourceDefaults = Pick<Resource, 'name' | 'type' | 'googleCalendarId' | 'dailyRate' | 'deposit'> & {
  websiteProductId: number;
};

// Values extracted from the website repo: /Users/danielbrussig/Documents/Entwicklung/Mietpark Saar-Pfalz/src/data/products.js
// - calendarUrl -> googleCalendarId is the decoded "src" query param (group calendar address).
// - deposits come from the product details.
// - dailyRate is a pragmatic default for CRM views; pricing for offers should use pricingService.
export const WEBSITE_RESOURCE_DEFAULTS: WebsiteResourceDefaults[] = [
  {
    websiteProductId: 1,
    name: 'Dachbox XL #1',
    type: 'Dachbox XL',
    googleCalendarId: 'c_45869d79b1bea0a3dadbffdf704c2d50916e158b98e1ca144095d2213a8b16f7@group.calendar.google.com',
    dailyRate: Math.round((55 / 7) * 100) / 100,
    deposit: 150,
  },
  {
    websiteProductId: 2,
    name: 'Dachbox XL #2',
    type: 'Dachbox XL',
    googleCalendarId: 'c_325271d09d1e42f08d6352af65db474f22363c9f34ea8bac21815715b62006a1@group.calendar.google.com',
    dailyRate: Math.round((55 / 7) * 100) / 100,
    deposit: 150,
  },
  {
    websiteProductId: 6,
    name: 'Dachbox M #1',
    type: 'Dachbox M',
    googleCalendarId: 'c_be91fd4328707c9ba54b5554a4c8d6e4c3fd52ddb0bebd2457e094d08983bf21@group.calendar.google.com',
    dailyRate: Math.round((45 / 7) * 100) / 100,
    deposit: 150,
  },
  {
    websiteProductId: 3,
    name: 'Heckbox #1',
    type: 'Heckbox',
    googleCalendarId: 'c_67b52d42d115607bc8287ee750efac0e4b5d4bfeec19532a22c412ff61dc83e9@group.calendar.google.com',
    dailyRate: Math.round((50 / 7) * 100) / 100,
    deposit: 150,
  },
  {
    websiteProductId: 4,
    name: 'Fahrradträger #1',
    type: 'Fahrradträger',
    googleCalendarId: 'c_dc2b0497c2d7fc848be4e800c0481e4bdd4df06b29d336c59a76dccbfb543dae@group.calendar.google.com',
    dailyRate: 8,
    deposit: 50,
  },
  {
    websiteProductId: 5,
    name: 'Hüpfburg #1',
    type: 'Hüpfburg',
    googleCalendarId: 'c_4986c8a9d132733c99d2f80982cf70ee74afa3a79c929d48c88f250c0004112e@group.calendar.google.com',
    dailyRate: 40,
    deposit: 50,
  },
];

export function websiteProductIdForProductType(type: ProductType): number {
  // Dachbox XL: product 1 and 2 share the same pricing config.
  if (type === 'Dachbox XL') return 1;
  if (type === 'Dachbox M') return 6;
  if (type === 'Heckbox') return 3;
  if (type === 'Fahrradträger') return 4;
  if (type === 'Hüpfburg') return 5;
  return 1;
}

