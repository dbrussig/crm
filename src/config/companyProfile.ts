export type CompanyProfile = {
  companyName: string;
  ownerName: string;
  logoDataUrl?: string; // optional base64 data URL (PNG/JPG/SVG)
  accentColor?: string; // used for PDFs (e.g. green)
  street: string;
  zipCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  agbsUrl: string;
  bankName: string;
  bankAccountName: string;
  iban: string;
  paypalMeUrl: string;
  paypalEmail: string;
  vatNotice: string; // e.g. Kleinunternehmerregelung
  paymentMethodsLine: string;
  depositNote?: string;
};

const STORAGE_KEY = 'mietpark_company_profile_v1';

export const defaultCompanyProfile: CompanyProfile = {
  companyName: 'Mietpark Saar-Pfalz',
  ownerName: 'Daniel Brußig',
  accentColor: '#6aa84f',
  street: 'Kastanienweg 17',
  zipCode: '66424',
  city: 'Homburg',
  country: 'Deutschland',
  phone: '+49 173 7615995',
  email: 'kontakt@mietpark-saar-pfalz.com',
  website: 'https://www.mietpark-saar-pfalz.com',
  agbsUrl: 'https://www.mietpark-saar-pfalz.com/agb/',
  bankName: 'DKB Bank Berlin',
  bankAccountName: 'Daniel Brußig',
  iban: 'DE06120300001078084215',
  paypalMeUrl: 'https://paypal.me/mietparksaarpfalz',
  paypalEmail: 'kontakt@mietpark-saar-pfalz.com',
  vatNotice: 'Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
  paymentMethodsLine: 'Bezahlung in Bar bei Abholung, Paypal oder kontaktlos mit Karte',
  depositNote: 'Anzahlung 50 % nach Angebotsannahme',
};

export function getCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCompanyProfile;
    const parsed = JSON.parse(raw) as Partial<CompanyProfile>;
    return { ...defaultCompanyProfile, ...parsed };
  } catch {
    return defaultCompanyProfile;
  }
}

export function saveCompanyProfile(profile: CompanyProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
