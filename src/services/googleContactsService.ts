import type { Customer } from '../types';
import { googleFetchJson } from './googleAuthService';
import { requireScope } from './googleOAuthService';

function getDefaultClientId(): string {
  return (
    localStorage.getItem('mietpark_google_oauth_client_id') ||
    (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    ''
  );
}

export async function syncCustomerToGoogleWithClientId(
  customer: Customer,
  opts: { clientId: string }
): Promise<{ success: boolean; resourceName?: string; error?: string }> {
  try {
    const token = await requireScope(opts.clientId, 'contacts');

    const body: any = {
      names: [
        {
          givenName: customer.firstName,
          familyName: customer.lastName,
          displayName: `${customer.firstName} ${customer.lastName}`.trim(),
        },
      ],
      emailAddresses: customer.email ? [{ value: customer.email }] : undefined,
      phoneNumbers: customer.phone ? [{ value: customer.phone }] : undefined,
      addresses: [
        {
          streetAddress: customer.address.street,
          city: customer.address.city,
          postalCode: customer.address.zipCode,
          country: customer.address.country,
        },
      ],
      biographies: customer.notes ? [{ value: customer.notes }] : undefined,
    };

    const resp = await googleFetchJson<{ resourceName: string }>({
      url: 'https://people.googleapis.com/v1/people:createContact',
      method: 'POST',
      token,
      body,
    });

    return { success: true, resourceName: resp.resourceName };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

// Legacy signature used by components: syncCustomerToGoogle(customer)
export async function syncCustomerToGoogle(
  customer: Customer
): Promise<{ success: boolean; resourceName?: string; error?: string }> {
  const clientId = getDefaultClientId();
  if (!clientId) return { success: false, error: 'Google Client ID fehlt' };
  return syncCustomerToGoogleWithClientId(customer, { clientId });
}

export async function deleteGoogleContactWithClientId(
  resourceName: string,
  opts: { clientId: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await requireScope(opts.clientId, 'contacts');
    await googleFetchJson<any>({
      url: `https://people.googleapis.com/v1/${resourceName.replace(/^\//, '')}:deleteContact`,
      method: 'DELETE',
      token,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

// Legacy signature used by components: deleteGoogleContact(resourceName)
export async function deleteGoogleContact(
  resourceName: string
): Promise<{ success: boolean; error?: string }> {
  const clientId = getDefaultClientId();
  if (!clientId) return { success: false, error: 'Google Client ID fehlt' };
  return deleteGoogleContactWithClientId(resourceName, { clientId });
}

export async function testGoogleContactsConnection(opts: { clientId: string }): Promise<boolean> {
  try {
    const token = await requireScope(opts.clientId, 'contacts');
    // Fetch basic user profile as a cheap token validation.
    await googleFetchJson<any>({
      url: 'https://www.googleapis.com/oauth2/v3/userinfo',
      token,
    });
    return true;
  } catch {
    return false;
  }
}
