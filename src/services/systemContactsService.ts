import { invokeDesktopCommand, isDesktopApp, isMacApp } from '../platform/runtime';

export interface PostalAddress {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface SystemContact {
  identifier: string;
  given_name: string;
  family_name: string;
  email_addresses: string[];
  phone_numbers: string[];
  organization_name?: string;
  note?: string;
  postal_addresses: PostalAddress[];
}

export interface ContactInput {
  given_name: string;
  family_name: string;
  email_addresses: string[];
  phone_numbers: string[];
  organization_name?: string;
  note?: string;
  postal_addresses: PostalAddress[];
}

export type ContactAccessStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

/**
 * Request access to system contacts (macOS only)
 * Shows native permission dialog on first call
 */
export async function requestContactsAccess(): Promise<boolean> {
  if (!isDesktopApp() || !isMacApp()) {
    return false;
  }

  try {
    return await invokeDesktopCommand<boolean>('contacts_request_access');
  } catch (error) {
    console.error('[SystemContacts] Failed to request access:', error);
    return false;
  }
}

/**
 * Get current access status without showing permission dialog
 */
export async function getContactsAccessStatus(): Promise<ContactAccessStatus> {
  if (!isDesktopApp() || !isMacApp()) {
    return 'unsupported';
  }

  try {
    // Try to list contacts - if it fails with permission error, we know the status
    await invokeDesktopCommand<SystemContact[]>('contacts_list_contacts');
    return 'authorized';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('denied') || errorMessage.includes('not allowed')) {
      return 'denied';
    }
    if (errorMessage.includes('not determined') || errorMessage.includes('notDetermined')) {
      return 'notDetermined';
    }
    if (errorMessage.includes('restricted')) {
      return 'restricted';
    }
    
    return 'unsupported';
  }
}

/**
 * List all contacts from macOS Contacts.app
 */
export async function listSystemContacts(): Promise<SystemContact[]> {
  if (!isDesktopApp() || !isMacApp()) {
    throw new Error('System contacts are only available on macOS');
  }

  try {
    return await invokeDesktopCommand<SystemContact[]>('contacts_list_contacts');
  } catch (error) {
    console.error('[SystemContacts] Failed to list contacts:', error);
    throw error;
  }
}

/**
 * Save a new contact to macOS Contacts.app
 */
export async function saveSystemContact(contact: ContactInput): Promise<SystemContact> {
  if (!isDesktopApp() || !isMacApp()) {
    throw new Error('System contacts are only available on macOS');
  }

  try {
    return await invokeDesktopCommand<SystemContact>('contacts_save_contact', { contact });
  } catch (error) {
    console.error('[SystemContacts] Failed to save contact:', error);
    throw error;
  }
}

/**
 * Update an existing contact in macOS Contacts.app
 */
export async function updateSystemContact(
  identifier: string,
  contact: ContactInput
): Promise<SystemContact> {
  if (!isDesktopApp() || !isMacApp()) {
    throw new Error('System contacts are only available on macOS');
  }

  try {
    return await invokeDesktopCommand<SystemContact>('contacts_update_contact', {
      identifier,
      contact,
    });
  } catch (error) {
    console.error('[SystemContacts] Failed to update contact:', error);
    throw error;
  }
}

/**
 * Find a system contact by email address
 */
export async function findSystemContactByEmail(email: string): Promise<SystemContact | null> {
  try {
    const contacts = await listSystemContacts();
    const normalizedEmail = email.toLowerCase().trim();
    
    return contacts.find((contact) =>
      contact.email_addresses.some((e) => e.toLowerCase().trim() === normalizedEmail)
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Convert CRM customer to system contact format
 */
export function customerToSystemContact(
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      zipCode?: string;
      city?: string;
      country?: string;
    };
    company?: string;
    id: string;
  }
): ContactInput {
  return {
    given_name: customer.firstName || '',
    family_name: customer.lastName || '',
    email_addresses: customer.email ? [customer.email] : [],
    phone_numbers: customer.phone ? [customer.phone] : [],
    organization_name: customer.company,
    note: `Mietpark CRM ID: ${customer.id}`,
    postal_addresses: customer.address
      ? [
          {
            street: customer.address.street || '',
            city: customer.address.city || '',
            state: '',
            postal_code: customer.address.zipCode || '',
            country: customer.address.country || 'Deutschland',
          },
        ]
      : [],
  };
}

/**
 * Convert system contact to CRM customer format
 */
export function systemContactToCustomer(contact: SystemContact): {
  firstName: string;
  lastName: string;
  email: string | undefined;
  phone: string | undefined;
  address: { street: string; zipCode: string; city: string; country: string } | undefined;
  company: string | undefined;
  systemContactId: string;
} {
  const address = contact.postal_addresses[0];
  
  // Try to extract CRM ID from note
  const crmIdMatch = contact.note?.match(/Mietpark CRM ID: ([a-zA-Z0-9_-]+)/);
  const crmId = crmIdMatch?.[1];

  return {
    firstName: contact.given_name,
    lastName: contact.family_name,
    email: contact.email_addresses[0],
    phone: contact.phone_numbers[0],
    address: address
      ? {
          street: address.street,
          zipCode: address.postal_code,
          city: address.city,
          country: address.country,
        }
      : undefined,
    company: contact.organization_name,
    systemContactId: contact.identifier,
  };
}
