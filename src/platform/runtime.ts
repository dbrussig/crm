import { invoke } from '@tauri-apps/api/core';

export function getRuntimeInfo(): string {
  if ('__TAURI_INTERNALS__' in window) return 'tauri-desktop';
  return 'browser-dev';
}

export async function invokeBackend<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return await invoke<T>(command, args);
}
