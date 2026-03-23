import { getStoredString, removeStoredValue, setStoredString } from './storage';

export async function getTokenValue(key: string): Promise<string | undefined> {
  return await getStoredString(key);
}

export async function setTokenValue(key: string, value: string): Promise<void> {
  await setStoredString(key, value);
}

export async function clearTokenValue(key: string): Promise<void> {
  await removeStoredValue(key);
}
