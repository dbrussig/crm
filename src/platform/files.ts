import { callNativeBridge } from './bridge';
import { isMacApp } from './runtime';

export async function saveFile(name: string, dataBase64: string, mimeType: string): Promise<void> {
  if (isMacApp()) {
    await callNativeBridge('file:save', { name, dataBase64, mimeType });
    return;
  }

  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
