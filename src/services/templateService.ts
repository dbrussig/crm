import type { Customer, RentalRequest } from '../types';
import { getCompanyProfile } from '../config/companyProfile';

export function generateTemplate(
  customer: Customer,
  rental: RentalRequest,
  opts: {
    templateType: 'availability' | 'offer';
    availabilityStatus?: string;
    price?: number;
    deposit?: number;
  }
): string {
  const company = getCompanyProfile();
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const start = new Date(rental.rentalStart).toLocaleDateString('de-DE');
  const end = new Date(rental.rentalEnd).toLocaleDateString('de-DE');

  if (opts.templateType === 'availability') {
    return (
      `Hallo ${name},\n\n` +
      `wir haben die Verfuegbarkeit fuer "${rental.productType}" im Zeitraum ${start} bis ${end} geprueft.\n` +
      `Status: ${opts.availabilityStatus || 'unbekannt'}\n\n` +
      `Viele Gruesse\n${company.companyName}`
    );
  }

  return (
    `Hallo ${name},\n\n` +
    `anbei unser Angebot fuer "${rental.productType}" im Zeitraum ${start} bis ${end}.\n` +
    `Preis: ${opts.price ?? '-'} EUR\n` +
    `Kaution: ${opts.deposit ?? '-'} EUR\n\n` +
    `${company.depositNote ? company.depositNote + '\n\n' : ''}` +
    `${company.paymentMethodsLine}\n` +
    `Zahlungslink Paypal ${company.paypalMeUrl}\n` +
    `${company.vatNotice}\n` +
    `AGB: ${company.agbsUrl}\n\n` +
    `Viele Gruesse\n${company.companyName}`
  );
}
