import { idbDel, idbGet, idbSet } from './idbKv';
import { getStructuredValue, removeStructuredValue, setStructuredValue } from '../platform/storage';
import { isMacApp } from '../platform/runtime';

function shouldAutoMigrateAndClearLocalStorage(key: string): boolean {
  // Keep small settings keys in localStorage; move large datasets / caches to IndexedDB.
  if (key === 'mietpark_google_oauth_client_id') return false;
  if (key === 'mietpark_google_oauth_enabled') return false;
  if (key === 'mietpark_crm_archive_after_import') return false;
  if (key.startsWith('mietpark_google_oauth_token_cache_')) return false;
  return (
    key.startsWith('mietpark_crm_') ||
    key === 'mietpark_company_profile_v1' ||
    key.startsWith('mietpark_invoice_seq_')
  );
}

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  if (isMacApp()) {
    try {
      const value = await getStructuredValue<T>(key);
      return value !== undefined ? value : fallback;
    } catch {
      return fallback;
    }
  }

  // Prefer IndexedDB.
  try {
    const v = await idbGet<any>(key);
    if (v !== undefined) {
      if (typeof v === 'string') {
        try {
          return JSON.parse(v) as T;
        } catch {
          // If a legacy string was stored directly, ignore and continue to migration fallback.
        }
      } else {
        return v as T;
      }
    }
  } catch {
    // Ignore and fall back to localStorage migration.
  }

  // Migration fallback: read from localStorage and move to IndexedDB.
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    try {
      await idbSet(key, parsed);
      if (shouldAutoMigrateAndClearLocalStorage(key)) {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore: best-effort migration.
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export async function saveJson<T>(key: string, value: T): Promise<void> {
  if (isMacApp()) {
    await setStructuredValue(key, value);
    return;
  }

  try {
    await idbSet(key, value);
    if (shouldAutoMigrateAndClearLocalStorage(key)) {
      // Ensure we don't accidentally keep large duplicate payloads in localStorage.
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
  } catch {
    // Fallback to localStorage if IndexedDB is unavailable.
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore
    }
  }
}

export async function deleteKey(key: string): Promise<void> {
  if (isMacApp()) {
    await removeStructuredValue(key);
    return;
  }

  await idbDel(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
