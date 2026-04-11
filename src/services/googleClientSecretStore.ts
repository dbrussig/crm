/**
 * googleClientSecretStore.ts
 * Speichert den Google OAuth Client Secret sicher (Desktop: Keychain).
 *
 * Hinweis: Bei Desktop-App OAuth ist der "Client Secret" in der Praxis nicht geheim,
 * aber er sollte trotzdem nicht unverschlüsselt im localStorage liegen.
 */
import { getTokenValue, setTokenValue, clearTokenValue } from '../platform/auth';

const CLIENT_SECRET_KEY = 'google_oauth_client_secret_v1';

export async function loadGoogleClientSecret(): Promise<string | null> {
  const raw = await getTokenValue(CLIENT_SECRET_KEY);
  const v = String(raw || '').trim();
  return v ? v : null;
}

export async function saveGoogleClientSecret(secret: string): Promise<void> {
  const v = String(secret || '').trim();
  if (!v) {
    await clearGoogleClientSecret();
    return;
  }
  await setTokenValue(CLIENT_SECRET_KEY, v);
}

export async function clearGoogleClientSecret(): Promise<void> {
  await clearTokenValue(CLIENT_SECRET_KEY);
}

