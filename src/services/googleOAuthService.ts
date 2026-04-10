/**
 * googleOAuthService.ts
 * Zentraler OAuth-Service: PKCE Loopback Flow, inkrementelle Scopes, Token-Refresh.
 * Delegiert Token-Speicherung an googleTokenStore (Keychain).
 */
import { invokeDesktopCommand, isDesktopApp } from '../platform/runtime';
import {
  GoogleTokenSet,
  loadTokenSet,
  saveTokenSet,
  clearTokenSet,
  isTokenExpired,
  scopeGranted,
  getConnectionStatus,
  SCOPES_CALENDAR,
  SCOPES_GMAIL,
  SCOPES_CONTACTS,
  SCOPE_PROFILE,
  SCOPE_EMAIL,
} from './googleTokenStore';

export type { GoogleConnectionStatus } from './googleTokenStore';
export { getConnectionStatus, clearTokenSet as disconnectGoogle };

const BASE_SCOPES = [SCOPE_PROFILE, SCOPE_EMAIL];

export const SERVICE_SCOPES: Record<'calendar' | 'gmail' | 'contacts', string> = {
  calendar: SCOPES_CALENDAR,
  gmail: SCOPES_GMAIL,
  contacts: SCOPES_CONTACTS,
};

interface OAuthCommandResult {
  access_token: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  email?: string;
  user_id?: string;
}

function friendlyError(raw: string): string {
  if (raw.includes('access_denied') || raw.includes('abgebrochen'))
    return 'Anmeldung abgebrochen. Bitte erneut versuchen.';
  if (raw.includes('invalid_client'))
    return 'Ungültige Client-ID. Bitte in den Einstellungen prüfen.';
  if (raw.includes('redirect_uri_mismatch'))
    return 'Redirect-URI passt nicht. Für die Desktop-App bitte einen OAuth-Client vom Typ „Desktop App“ erstellen (kein „Web Application“).';
  if (raw.includes('Token-Tausch fehlgeschlagen'))
    return `Token-Tausch fehlgeschlagen. Details: ${raw}`;
  if (raw.includes('OAuth token error:')) {
    const lower = raw.toLowerCase();
    if (lower.includes('invalid_grant')) {
      return 'Google OAuth: invalid_grant (Code abgelaufen/ungültig). Bitte erneut verbinden.';
    }
    if (lower.includes('client_secret is missing')) {
      return 'Google OAuth: client_secret fehlt. Du nutzt vermutlich einen OAuth Client vom Typ „Web Application“. Bitte einen Client vom Typ „Desktop App“ erstellen und dessen Client ID verwenden.';
    }
    if (lower.includes('unauthorized_client')) {
      return 'Google OAuth: unauthorized_client. Bitte OAuth Client Typ „Desktop App“ verwenden.';
    }
    if (lower.includes('invalid_request') && lower.includes('redirect_uri')) {
      return 'Google OAuth: invalid_request (redirect_uri). Bitte OAuth Client Typ „Desktop App“ verwenden.';
    }
    return raw;
  }
  if (raw.includes('Timeout'))
    return 'Anmeldung nicht abgeschlossen (Timeout). Bitte erneut versuchen.';
  if (raw.includes('insufficientPermissions') || raw.includes('PERMISSION_DENIED'))
    return 'Fehlende Berechtigungen. Bitte erneut verbinden und alle Berechtigungen bestätigen.';
  return raw;
}

/**
 * Verbindet Google für einen bestimmten Service (oder Basis-Login).
 * Öffnet System-Browser, wartet auf Loopback-Callback.
 */
export async function connectGoogle(
  clientId: string,
  service?: 'calendar' | 'gmail' | 'contacts'
): Promise<GoogleTokenSet> {
  if (!clientId.trim()) throw new Error('Google Client-ID fehlt. Bitte in den Einstellungen eintragen.');
  if (!isDesktopApp()) throw new Error('Google OAuth ist nur in der Desktop-App verfügbar.');

  const existingTs = await loadTokenSet();
  const requestedScope = service ? SERVICE_SCOPES[service] : null;

  // Alle bereits erteilten Scopes + neuen Scope bündeln (inkrementell)
  const alreadyGranted = existingTs?.scopes ?? [];
  const scopeSet = new Set([...BASE_SCOPES, ...alreadyGranted]);
  if (requestedScope) scopeSet.add(requestedScope);
  const scopes = Array.from(scopeSet);

  // Schritt 1: Port binden + Auth-URL vorbereiten (Rust)
  let prepared: { auth_url: string; port: number; state: string; verifier: string; redirect_uri: string };
  try {
    prepared = await invokeDesktopCommand('google_oauth_prepare', { clientId, scopes });
  } catch (e: unknown) {
    throw new Error(friendlyError(String((e as any)?.message ?? e)));
  }

  // Schritt 2: Browser öffnen via Tauri-Opener-Command (AppHandle nötig)
  try {
    await invokeDesktopCommand('open_url_in_browser', { url: prepared.auth_url });
  } catch (e: unknown) {
    throw new Error(`Browser konnte nicht geöffnet werden: ${(e as any)?.message ?? e}`);
  }

  // Schritt 3: Auf Callback warten + Token tauschen (Rust wartet blockierend)
  let result: OAuthCommandResult;
  try {
    result = await invokeDesktopCommand<OAuthCommandResult>('google_oauth_exchange', {
      clientId,
      redirectUri: prepared.redirect_uri,
      state: prepared.state,
      verifier: prepared.verifier,
    });
  } catch (e: unknown) {
    throw new Error(friendlyError(String((e as any)?.message ?? e)));
  }

  const grantedScopes = result.scope
    ? result.scope.split(/\s+/).filter(Boolean)
    : scopes;

  const ts: GoogleTokenSet = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token ?? existingTs?.refreshToken,
    expiresAt: Date.now() + result.expires_in * 1000 - 30_000,
    scopes: grantedScopes,
    email: result.email ?? existingTs?.email,
    googleUserId: result.user_id ?? existingTs?.googleUserId,
    connectedAt: Date.now(),
  };

  await saveTokenSet(ts);
  return ts;
}

/**
 * Gibt einen gültigen Access Token zurück.
 * Refresht automatisch wenn abgelaufen.
 * Wirft einen verständlichen Fehler wenn Refresh fehlschlägt.
 */
export async function getValidAccessToken(clientId: string): Promise<string> {
  let ts = await loadTokenSet();
  if (!ts) throw new Error('Nicht mit Google verbunden. Bitte zuerst verbinden.');

  if (!isTokenExpired(ts)) return ts.accessToken;

  // Token abgelaufen → Refresh
  if (!ts.refreshToken) {
    await clearTokenSet();
    throw new Error('Sitzung abgelaufen und kein Refresh-Token vorhanden. Bitte erneut verbinden.');
  }

  try {
    const result = await invokeDesktopCommand<OAuthCommandResult>('google_token_refresh', {
      clientId,
      refreshToken: ts.refreshToken,
    });

    const grantedScopes = result.scope
      ? result.scope.split(/\s+/).filter(Boolean)
      : ts.scopes;

    ts = {
      ...ts,
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? ts.refreshToken,
      expiresAt: Date.now() + result.expires_in * 1000 - 30_000,
      scopes: grantedScopes,
      email: result.email ?? ts.email,
    };
    await saveTokenSet(ts);
    return ts.accessToken;
  } catch (e: unknown) {
    await clearTokenSet();
    const msg = String((e as any)?.message ?? e ?? '');
    throw new Error(`Sitzung abgelaufen. Bitte erneut verbinden. (${friendlyError(msg)})`);
  }
}

/**
 * Prüft ob ein bestimmter Scope erteilt ist.
 * Falls nicht → connectGoogle für diesen Service aufrufen.
 */
export async function requireScope(
  clientId: string,
  service: 'calendar' | 'gmail' | 'contacts'
): Promise<string> {
  const ts = await loadTokenSet();
  const required = SERVICE_SCOPES[service];

  if (!ts || !scopeGranted(ts.scopes, required)) {
    await connectGoogle(clientId, service);
  }

  return getValidAccessToken(clientId);
}
