/**
 * googleClientSecretStore.ts
 * Speichert den Google OAuth Client Secret.
 *
 * Hinweis: Bei Desktop-App OAuth ist der "Client Secret" in der Praxis nicht geheim,
 * daher vermeiden wir hier bewusst den Keychain-Roundtrip und halten ihn in
 * der normalen App-Konfiguration.
 */
import { getStoredString, removeStoredValue, setStoredString } from '../platform/storage';

const CLIENT_SECRET_KEY = 'google_oauth_client_secret_v1';

export async function loadGoogleClientSecret(): Promise<string | null> {
  const raw = await getStoredString(CLIENT_SECRET_KEY);
  const v = String(raw || '').trim();
  return v ? v : null;
}

export async function saveGoogleClientSecret(secret: string): Promise<void> {
  const v = String(secret || '').trim();
  if (!v) {
    await clearGoogleClientSecret();
    return;
  }
  await setStoredString(CLIENT_SECRET_KEY, v);
}

export async function clearGoogleClientSecret(): Promise<void> {
  await removeStoredValue(CLIENT_SECRET_KEY);
}
