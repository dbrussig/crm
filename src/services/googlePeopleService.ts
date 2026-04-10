/**
 * googlePeopleService.ts
 * Google People API – ersetzt die alte Contacts API.
 * Lesen, Suchen, Details einzelner Kontakte.
 */
import { googleFetchJson } from './googleAuthService';
import { getValidAccessToken, requireScope } from './googleOAuthService';

const BASE = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,addresses,biographies,metadata';

export interface GooglePerson {
  resourceName: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  emails: string[];
  phones: string[];
  address?: string;
  note?: string;
  googleUserId?: string;
}

function mapPerson(raw: any): GooglePerson {
  const name = raw.names?.[0] ?? {};
  return {
    resourceName: raw.resourceName ?? '',
    displayName: name.displayName,
    givenName: name.givenName,
    familyName: name.familyName,
    emails: (raw.emailAddresses ?? []).map((e: any) => e.value).filter(Boolean),
    phones: (raw.phoneNumbers ?? []).map((p: any) => p.value).filter(Boolean),
    address: raw.addresses?.[0]
      ? [raw.addresses[0].streetAddress, raw.addresses[0].postalCode, raw.addresses[0].city]
          .filter(Boolean)
          .join(', ')
      : undefined,
    note: raw.biographies?.[0]?.value,
    googleUserId: raw.metadata?.sources?.find((s: any) => s.type === 'PROFILE')?.id,
  };
}

export async function listContacts(opts: {
  clientId: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ contacts: GooglePerson[]; nextPageToken?: string }> {
  const token = await requireScope(opts.clientId, 'contacts');
  const params = new URLSearchParams({
    personFields: PERSON_FIELDS,
    pageSize: String(opts.maxResults ?? 100),
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  });
  const resp = await googleFetchJson<any>({
    url: `${BASE}/people/me/connections?${params}`,
    token,
  });
  return {
    contacts: (resp.connections ?? []).map(mapPerson),
    nextPageToken: resp.nextPageToken,
  };
}

export async function searchContacts(opts: {
  clientId: string;
  query: string;
  maxResults?: number;
}): Promise<GooglePerson[]> {
  const token = await requireScope(opts.clientId, 'contacts');
  const params = new URLSearchParams({
    query: opts.query,
    readMask: PERSON_FIELDS,
    pageSize: String(opts.maxResults ?? 20),
  });
  const resp = await googleFetchJson<any>({
    url: `${BASE}/people:searchContacts?${params}`,
    token,
  });
  return (resp.results ?? []).map((r: any) => mapPerson(r.person ?? r));
}

export async function getContact(opts: {
  clientId: string;
  resourceName: string;
}): Promise<GooglePerson> {
  const token = await requireScope(opts.clientId, 'contacts');
  const params = new URLSearchParams({ personFields: PERSON_FIELDS });
  const resp = await googleFetchJson<any>({
    url: `${BASE}/${opts.resourceName}?${params}`,
    token,
  });
  return mapPerson(resp);
}

export async function createContact(opts: {
  clientId: string;
  givenName: string;
  familyName?: string;
  email?: string;
  phone?: string;
  note?: string;
}): Promise<GooglePerson> {
  const token = await requireScope(opts.clientId, 'contacts');
  const body: any = {
    names: [{ givenName: opts.givenName, familyName: opts.familyName ?? '' }],
    ...(opts.email ? { emailAddresses: [{ value: opts.email }] } : {}),
    ...(opts.phone ? { phoneNumbers: [{ value: opts.phone }] } : {}),
    ...(opts.note ? { biographies: [{ value: opts.note }] } : {}),
  };
  const resp = await googleFetchJson<any>({
    url: `${BASE}/people:createContact`,
    method: 'POST',
    token,
    body,
  });
  return mapPerson(resp);
}

export async function testPeopleConnection(clientId: string): Promise<boolean> {
  try {
    const token = await getValidAccessToken(clientId);
    await googleFetchJson<any>({
      url: `${BASE}/people/me?personFields=names,emailAddresses`,
      token,
    });
    return true;
  } catch {
    return false;
  }
}
