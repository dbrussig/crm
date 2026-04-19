import { invoke } from '@tauri-apps/api/core';
import { isDesktopApp } from '../platform/runtime';

export interface IconInfo {
  id: string;
  label: string;
  filename: string;
}

/**
 * List all available built-in app icon variants.
 */
export async function listAppIcons(): Promise<IconInfo[]> {
  if (!isDesktopApp()) return [];
  return await invoke<IconInfo[]>('list_app_icons');
}

/**
 * Get the currently selected icon ID (or "default" if none set).
 */
export async function getCurrentAppIcon(): Promise<string> {
  if (!isDesktopApp()) return 'default';
  return await invoke<string>('get_current_app_icon');
}

/**
 * Set the current app icon by ID. Pass "default" to restore the default icon.
 */
export async function setAppIcon(iconId: string): Promise<void> {
  if (!isDesktopApp()) return;
  await invoke<void>('set_app_icon', { iconId });
}

/**
 * Upload a custom icon. Provide a display name and base64-encoded PNG data.
 * Returns the assigned custom icon ID.
 */
export async function uploadCustomIcon(name: string, data: string): Promise<string> {
  if (!isDesktopApp()) throw new Error('Not running in desktop mode');
  return await invoke<string>('upload_custom_icon', { name, data });
}

/**
 * Get thumbnail image data as a base64 data-URL string.
 * Returns something like "data:image/png;base64,..." that can be used directly as <img src>.
 */
export async function getIconThumbnailDataUrl(iconId: string): Promise<string> {
  if (!isDesktopApp()) return '';
  const base64 = await invoke<string>('get_icon_thumbnail_base64', { iconId });
  return `data:image/png;base64,${base64}`;
}
