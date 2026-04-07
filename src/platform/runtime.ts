import { invoke } from '@tauri-apps/api/core';

export type RuntimePlatform = 'browser' | 'tauri-desktop';

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'tauri-desktop';
  }
  return 'browser';
}

export function isDesktopApp(): boolean {
  return getRuntimePlatform() === 'tauri-desktop';
}

export function isMacApp(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac') || 
         navigator.userAgent.toLowerCase().includes('macintosh') ||
         navigator.userAgent.toLowerCase().includes('mac os');
}

export async function invokeDesktopCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return await invoke<T>(command, args);
}
