import { invokeDesktopCommand, isDesktopApp } from '../platform/runtime';

export interface ICloudBackupInfo {
  id: string;
  createdAt: number;
  sizeBytes: number;
  version: string;
}

type RawICloudBackupInfo = {
  id: string;
  created_at: number;
  size_bytes: number;
  version: string;
};

function normalize(item: RawICloudBackupInfo): ICloudBackupInfo {
  return {
    id: item.id,
    createdAt: Number(item.created_at || 0),
    sizeBytes: Number(item.size_bytes || 0),
    version: String(item.version || '1'),
  };
}

export function isICloudBackupSupported(): boolean {
  return isDesktopApp();
}

export async function createICloudBackup(): Promise<string> {
  if (!isDesktopApp()) throw new Error('iCloud-Backups sind nur in der Desktop-App verfügbar.');
  return await invokeDesktopCommand<string>('create_icloud_backup');
}

export async function listICloudBackups(): Promise<ICloudBackupInfo[]> {
  if (!isDesktopApp()) return [];
  const raw = await invokeDesktopCommand<RawICloudBackupInfo[]>('list_icloud_backups');
  return (raw || []).map(normalize).sort((a, b) => b.createdAt - a.createdAt);
}
