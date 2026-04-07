import { isDesktopApp, isMacApp } from '../platform/runtime';
import {
  customerToSystemContact,
  findSystemContactByEmail,
  listSystemContacts,
  requestContactsAccess,
  saveSystemContact,
  systemContactToCustomer,
  updateSystemContact,
  type ContactAccessStatus,
  type ContactInput,
  type SystemContact,
} from './systemContactsService';

export type { ContactAccessStatus };
export { requestContactsAccess };

export type ContactSyncProvider = 'google' | 'icloud' | 'system' | 'none';
export type SyncDirection = 'bidirectional' | 'toExternal' | 'fromExternal';

export interface ContactSyncSettings {
  provider: ContactSyncProvider;
  enabled: boolean;
  syncDirection: SyncDirection;
  lastSyncAt?: number;
}

const SYNC_SETTINGS_KEY = 'mietpark_crm_contact_sync_settings_v1';

/**
 * Get current contact sync settings
 */
export function getContactSyncSettings(): ContactSyncSettings {
  try {
    const stored = localStorage.getItem(SYNC_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  
  // Default: system on macOS if available, otherwise none
  const defaultProvider: ContactSyncProvider = isDesktopApp() && isMacApp() ? 'system' : 'none';
  
  return {
    provider: defaultProvider,
    enabled: false,
    syncDirection: 'bidirectional',
  };
}

/**
 * Save contact sync settings
 */
export function saveContactSyncSettings(settings: ContactSyncSettings): void {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Check if system contacts are available (macOS only)
 */
export function isSystemContactsAvailable(): boolean {
  return isDesktopApp() && isMacApp();
}

/**
 * Get human-readable provider name
 */
export function getProviderLabel(provider: ContactSyncProvider): string {
  switch (provider) {
    case 'google':
      return 'Google Kontakte';
    case 'icloud':
      return 'iCloud Kontakte';
    case 'system':
      return 'macOS Kontakte (lokal)';
    case 'none':
      return 'Keine Synchronisation';
    default:
      return 'Unbekannt';
  }
}

/**
 * Get available providers for current platform
 */
export function getAvailableProviders(): ContactSyncProvider[] {
  const providers: ContactSyncProvider[] = ['none'];
  
  if (isDesktopApp() && isMacApp()) {
    providers.push('system');
  }
  
  // Google/iCloud are always available as they use web APIs
  providers.push('google', 'icloud');
  
  return providers;
}

export interface SyncResult {
  success: boolean;
  imported: number;
  exported: number;
  errors: string[];
}

export interface Customer {
  id: string;
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
  systemContactId?: string;
  updatedAt: number;
}

/**
 * Sync contacts based on current settings
 */
export async function syncContacts(customers: Customer[]): Promise<SyncResult> {
  const settings = getContactSyncSettings();
  const result: SyncResult = {
    success: false,
    imported: 0,
    exported: 0,
    errors: [],
  };
  
  if (!settings.enabled) {
    result.errors.push('Synchronisation ist deaktiviert');
    return result;
  }
  
  if (settings.provider === 'system') {
    return syncWithSystemContacts(customers, settings.syncDirection);
  }
  
  // TODO: Implement Google/iCloud sync
  result.errors.push(`Provider ${settings.provider} ist noch nicht implementiert`);
  return result;
}

/**
 * Sync with macOS Contacts.app
 */
async function syncWithSystemContacts(
  customers: Customer[],
  direction: SyncDirection
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    imported: 0,
    exported: 0,
    errors: [],
  };
  
  if (!isSystemContactsAvailable()) {
    result.errors.push('Systemkontakte sind nur auf macOS verfügbar');
    return result;
  }
  
  try {
    // Request access if needed
    const hasAccess = await requestContactsAccess();
    if (!hasAccess) {
      result.errors.push('Keine Berechtigung für Kontakte');
      return result;
    }
    
    const systemContacts = await listSystemContacts();
    
    // Import from system contacts (find CRM contacts by email)
    if (direction === 'bidirectional' || direction === 'fromExternal') {
      for (const customer of customers) {
        if (!customer.email) continue;
        
        const systemContact = await findSystemContactByEmail(customer.email);
        if (systemContact) {
          // Update customer with system contact ID if not set
          if (!customer.systemContactId) {
            customer.systemContactId = systemContact.identifier;
            result.imported++;
          }
        }
      }
    }
    
    // Export to system contacts
    if (direction === 'bidirectional' || direction === 'toExternal') {
      for (const customer of customers) {
        if (!customer.email) continue;
        
        const existingContact = await findSystemContactByEmail(customer.email);
        const contactInput = customerToSystemContact(customer);
        
        try {
          if (existingContact) {
            // Update existing
            await updateSystemContact(existingContact.identifier, contactInput);
          } else {
            // Create new
            const newContact = await saveSystemContact(contactInput);
            customer.systemContactId = newContact.identifier;
          }
          result.exported++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Fehler bei ${customer.email}: ${errorMsg}`);
        }
      }
    }
    
    result.success = result.errors.length === 0;
    
    // Update last sync timestamp
    saveContactSyncSettings({
      ...getContactSyncSettings(),
      lastSyncAt: Date.now(),
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Synchronisation fehlgeschlagen: ${errorMsg}`);
  }
  
  return result;
}

/**
 * Get system contacts access status
 */
export async function getSystemContactsStatus(): Promise<ContactAccessStatus> {
  if (!isSystemContactsAvailable()) {
    return 'unsupported';
  }
  
  try {
    // Try to list contacts to determine status
    await listSystemContacts();
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
 * Import a single contact from system contacts
 */
export async function importFromSystemContact(email: string): Promise<Partial<Customer> | null> {
  if (!isSystemContactsAvailable()) {
    return null;
  }
  
  try {
    const systemContact = await findSystemContactByEmail(email);
    if (!systemContact) {
      return null;
    }
    
    const converted = systemContactToCustomer(systemContact);
    
    return {
      firstName: converted.firstName,
      lastName: converted.lastName,
      email: converted.email,
      phone: converted.phone,
      address: converted.address,
      company: converted.company,
      systemContactId: converted.systemContactId,
    };
  } catch (error) {
    console.error('[ContactSync] Failed to import contact:', error);
    return null;
  }
}

/**
 * Export a single customer to system contacts
 */
export async function exportToSystemContact(customer: Customer): Promise<boolean> {
  if (!isSystemContactsAvailable()) {
    return false;
  }
  
  try {
    const contactInput = customerToSystemContact(customer);
    
    if (customer.systemContactId) {
      await updateSystemContact(customer.systemContactId, contactInput);
    } else {
      const newContact = await saveSystemContact(contactInput);
      customer.systemContactId = newContact.identifier;
    }
    
    return true;
  } catch (error) {
    console.error('[ContactSync] Failed to export contact:', error);
    return false;
  }
}
