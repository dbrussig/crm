import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isDesktopApp } from '../platform/runtime';

const LAST_CHECK_KEY = 'mietpark_desktop_update_last_check';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function shouldRunCheckNow(): boolean {
  const raw = localStorage.getItem(LAST_CHECK_KEY);
  const previous = raw ? Number(raw) : 0;
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return Date.now() - previous >= CHECK_INTERVAL_MS;
}

function markCheckedNow(): void {
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
}

export async function runDesktopAutoUpdate(): Promise<void> {
  if (!isDesktopApp()) return;
  if (import.meta.env.DEV) return;
  if (!shouldRunCheckNow()) return;

  markCheckedNow();

  try {
    const update = await check();
    if (!update) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.warn('[updater] Update check/install failed', error);
  }
}
