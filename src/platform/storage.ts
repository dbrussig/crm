import { callNativeBridge } from './bridge';
import { isMacApp } from './runtime';

interface StorageGetResponse<T> {
  value?: T;
}

export async function getStructuredValue<T>(key: string): Promise<T | undefined> {
  if (!isMacApp()) return undefined;
  const response = await callNativeBridge<StorageGetResponse<T>>('storage:get', { key });
  return response?.value;
}

export async function setStructuredValue<T>(key: string, value: T): Promise<void> {
  if (!isMacApp()) {
    throw new Error('Structured native storage is only available inside the macOS app');
  }
  await callNativeBridge('storage:set', { key, value });
}

export async function removeStructuredValue(key: string): Promise<void> {
  if (!isMacApp()) {
    throw new Error('Structured native storage is only available inside the macOS app');
  }
  await callNativeBridge('storage:remove', { key });
}

export async function getStoredString(key: string): Promise<string | undefined> {
  if (isMacApp()) {
    const response = await callNativeBridge<StorageGetResponse<string>>('storage:get', { key });
    return response?.value;
  }

  try {
    const value = localStorage.getItem(key);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

export async function setStoredString(key: string, value: string): Promise<void> {
  if (isMacApp()) {
    await callNativeBridge('storage:set', { key, value });
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in the browser fallback.
  }
}

export async function removeStoredValue(key: string): Promise<void> {
  if (isMacApp()) {
    await callNativeBridge('storage:remove', { key });
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors in the browser fallback.
  }
}
