/**
 * googleAuthService.ts
 * Abwärtskompatibilität: getAccessToken delegiert an googleOAuthService.
 * Direkt: getValidAccessToken aus googleOAuthService verwenden.
 */
import { getValidAccessToken, connectGoogle } from './googleOAuthService';
import { loadTokenSet } from './googleTokenStore';
import { isDesktopApp } from '../platform/runtime';

export async function getAccessToken(opts: {
  clientId: string;
  scopes: string[];
  prompt?: '' | 'consent' | 'select_account';
  force?: boolean;
}): Promise<string> {
  const clientId = opts.clientId.trim();
  if (!clientId) throw new Error('Google OAuth Client ID fehlt. Bitte in den Einstellungen eintragen.');

  if (isDesktopApp()) {
    const ts = await loadTokenSet();
    if (!ts || opts.force) {
      await connectGoogle(clientId);
    }
    return getValidAccessToken(clientId);
  }

  throw new Error('Google OAuth ist nur in der Desktop-App verfügbar.');
}

export async function googleFetchJson<T>(opts: {
  url: string;
  method?: string;
  token: string;
  body?: any;
  headers?: Record<string, string>;
}): Promise<T> {
  const res = await fetch(opts.url, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google API error ${res.status} ${res.statusText}: ${text}`);
  }
  const text = await res.text().catch(() => '');
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
