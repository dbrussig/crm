import { getStoredString, removeStoredValue, setStoredString } from './storage';
import { invokeDesktopCommand, isDesktopApp } from './runtime';

export async function getTokenValue(key: string): Promise<string | undefined> {
  if (isDesktopApp()) {
    const response = await invokeDesktopCommand<{ value?: string }>('auth_get_secret', { key });
    return response?.value;
  }
  return await getStoredString(key);
}

export async function setTokenValue(key: string, value: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('auth_set_secret', { key, value });
    return;
  }
  await setStoredString(key, value);
}

export async function clearTokenValue(key: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeDesktopCommand('auth_delete_secret', { key });
    return;
  }
  await removeStoredValue(key);
}
