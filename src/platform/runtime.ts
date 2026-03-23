export type RuntimePlatform = 'browser' | 'mac-app';

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (message: unknown) => void }>;
    };
    mietparkCRMBridgeResponse?: (response: unknown) => void;
  }
}

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === 'undefined') return 'browser';
  if (window.webkit?.messageHandlers?.mietparkCRM) return 'mac-app';
  return 'browser';
}

export function isMacApp(): boolean {
  return getRuntimePlatform() === 'mac-app';
}
