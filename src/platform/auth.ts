import { getStoredString, removeStoredValue, setStoredString } from './storage';
import { invokeDesktopCommand, isDesktopApp } from './runtime';

const tokenCache = new Map<string, string | undefined>();
const pendingReads = new Map<string, Promise<string | undefined>>();

export async function getTokenValue(key: string): Promise<string | undefined> {
  if (tokenCache.has(key)) {
    return tokenCache.get(key);
  }

  const existingRead = pendingReads.get(key);
  if (existingRead) {
    return existingRead;
  }

  const readPromise = (async () => {
    if (isDesktopApp()) {
      const response = await invokeDesktopCommand<{ value?: string }>('auth_get_secret', { key });
      const value = response?.value;
      tokenCache.set(key, value);
      return value;
    }
    const value = await getStoredString(key);
    tokenCache.set(key, value);
    return value;
  })();

  pendingReads.set(key, readPromise);
  if (isDesktopApp()) {
    try {
      return await readPromise;
    } finally {
      pendingReads.delete(key);
    }
  }
  try {
    return await readPromise;
  } finally {
    pendingReads.delete(key);
  }
}

export async function setTokenValue(key: string, value: string): Promise<void> {
  tokenCache.set(key, value);
  pendingReads.delete(key);
  if (isDesktopApp()) {
    await invokeDesktopCommand('auth_set_secret', { key, value });
    return;
  }
  await setStoredString(key, value);
}

export async function clearTokenValue(key: string): Promise<void> {
  tokenCache.delete(key);
  pendingReads.delete(key);
  if (isDesktopApp()) {
    await invokeDesktopCommand('auth_delete_secret', { key });
    return;
  }
  await removeStoredValue(key);
}
