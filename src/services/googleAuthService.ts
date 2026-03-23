import { getTokenValue, setTokenValue } from '../platform/auth';

type TokenInfo = {
  accessToken: string;
  expiresAt: number;
  scope: string; // space-separated
};

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORAGE_KEY_PREFIX = 'mietpark_google_oauth_token_cache_';

let gisLoading: Promise<void> | null = null;

function ensureGisLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('GIS can only be used in the browser'));
  if ((window as any).google?.accounts?.oauth2?.initTokenClient) return Promise.resolve();
  if (gisLoading) return gisLoading;

  gisLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

  return gisLoading;
}

const tokenCache: Record<string, TokenInfo | undefined> = {};
const storageLoaded: Record<string, boolean | undefined> = {};

function storageKeyFor(clientId: string, scopes: string): string {
  // Keep key readable, but safe for localStorage.
  return `${STORAGE_KEY_PREFIX}${clientId}__${encodeURIComponent(scopes)}`;
}

async function loadTokenFromStorage(storageKey: string): Promise<TokenInfo | undefined> {
  try {
    const raw = await getTokenValue(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as TokenInfo;
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (typeof parsed.accessToken !== 'string') return undefined;
    if (typeof parsed.expiresAt !== 'number') return undefined;
    if (typeof parsed.scope !== 'string') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function saveTokenToStorage(storageKey: string, token: TokenInfo): Promise<void> {
  await setTokenValue(storageKey, JSON.stringify(token));
}

function scopesKey(scopes: string[]) {
  return scopes
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(' ');
}

function hasAllScopes(tokenScope: string, requiredScopes: string[]) {
  const set = new Set(tokenScope.split(/\s+/g).filter(Boolean));
  return requiredScopes.every((s) => set.has(s));
}

export async function getAccessToken(opts: {
  clientId: string;
  scopes: string[];
  prompt?: '' | 'consent' | 'select_account';
  force?: boolean;
}): Promise<string> {
  const clientId = opts.clientId.trim();
  if (!clientId) throw new Error('Google OAuth Client ID is missing');

  const requiredScopes = opts.scopes.map((s) => s.trim()).filter(Boolean);
  if (requiredScopes.length === 0) throw new Error('No Google OAuth scopes configured');

  await ensureGisLoaded();

  const scopes = scopesKey(requiredScopes);
  const key = `${clientId}::${scopes}`;
  const persistKey = storageKeyFor(clientId, scopes);

  // Load persistent cache once per key (survives restarts).
  if (!opts.force && !storageLoaded[key]) {
    storageLoaded[key] = true;
    const persisted = await loadTokenFromStorage(persistKey);
    if (persisted) {
      tokenCache[key] = persisted;
    }
  }

  const cached = tokenCache[key];
  if (!opts.force && cached && Date.now() < cached.expiresAt && hasAllScopes(cached.scope, requiredScopes)) {
    return cached.accessToken;
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: requiredScopes.join(' '),
      callback: (resp: any) => {
        if (resp?.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        if (!resp?.access_token) {
          reject(new Error('No access_token returned by GIS'));
          return;
        }

        const grantedScope = String(resp.scope || '').trim() || requiredScopes.join(' ');
        if (!hasAllScopes(grantedScope, requiredScopes)) {
          reject(
            new Error(
              `Google OAuth: Missing required scopes. Required: ${requiredScopes.join(' ')}; Granted: ${grantedScope}. ` +
                `Try again with prompt="consent".`
            )
          );
          return;
        }

        const expiresInSec = Number(resp.expires_in || 3600);
        const info: TokenInfo = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + expiresInSec * 1000 - 30_000, // 30s safety window
          // Store actual granted scopes (if provided) to avoid "insufficientPermissions" surprises.
          scope: grantedScope,
        };
        tokenCache[key] = info;
        void saveTokenToStorage(persistKey, info);
        resolve(resp.access_token);
      },
    });

    try {
      tokenClient.requestAccessToken({
        prompt: opts.prompt ?? '',
      });
    } catch (e: any) {
      reject(e);
    }
  });
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
