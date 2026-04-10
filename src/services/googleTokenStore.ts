/**
 * googleTokenStore.ts
 * Sichere Token-Persistenz für Google OAuth.
 * - macOS/Windows/Linux: Keychain via Tauri auth_get_secret / auth_set_secret
 * - Tokens werden NIEMALS im Klartext in localStorage abgelegt
 * - Kein Token-Inhalt im Log
 */
import { getTokenValue, setTokenValue, clearTokenValue } from '../platform/auth';

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
  email?: string;
  googleUserId?: string;
  connectedAt: number;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  email?: string;
  googleUserId?: string;
  connectedAt?: number;
  grantedScopes: string[];
  calendarConnected: boolean;
  gmailConnected: boolean;
  contactsConnected: boolean;
}

const SCOPES_CALENDAR = 'https://www.googleapis.com/auth/calendar';
const SCOPES_GMAIL = 'https://www.googleapis.com/auth/gmail.modify';
const SCOPES_CONTACTS = 'https://www.googleapis.com/auth/contacts';
const SCOPE_PROFILE = 'https://www.googleapis.com/auth/userinfo.profile';
const SCOPE_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

const TOKEN_KEY = 'google_token_set_v1';

export function scopeGranted(grantedScopes: string[], required: string): boolean {
  return grantedScopes.some(s => s.trim() === required.trim());
}

export async function loadTokenSet(): Promise<GoogleTokenSet | null> {
  try {
    const raw = await getTokenValue(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleTokenSet;
    if (!parsed.accessToken || typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveTokenSet(ts: GoogleTokenSet): Promise<void> {
  await setTokenValue(TOKEN_KEY, JSON.stringify(ts));
}

export async function clearTokenSet(): Promise<void> {
  await clearTokenValue(TOKEN_KEY);
}

export async function getConnectionStatus(): Promise<GoogleConnectionStatus> {
  const ts = await loadTokenSet();
  if (!ts) {
    return {
      connected: false,
      grantedScopes: [],
      calendarConnected: false,
      gmailConnected: false,
      contactsConnected: false,
    };
  }
  return {
    connected: true,
    email: ts.email,
    googleUserId: ts.googleUserId,
    connectedAt: ts.connectedAt,
    grantedScopes: ts.scopes,
    calendarConnected: scopeGranted(ts.scopes, SCOPES_CALENDAR),
    gmailConnected: scopeGranted(ts.scopes, SCOPES_GMAIL),
    contactsConnected: scopeGranted(ts.scopes, SCOPES_CONTACTS),
  };
}

export function isTokenExpired(ts: GoogleTokenSet, bufferMs = 60_000): boolean {
  return Date.now() >= ts.expiresAt - bufferMs;
}

export { SCOPES_CALENDAR, SCOPES_GMAIL, SCOPES_CONTACTS, SCOPE_PROFILE, SCOPE_EMAIL };
