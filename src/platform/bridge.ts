import { isMacApp } from './runtime';

export interface BridgeRequest<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
}

export interface BridgeResponse<TResult = unknown> {
  id: string;
  ok: boolean;
  result?: TResult;
  error?: string;
}

const pending = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }
>();

function ensureBridgeListener() {
  if (typeof window === 'undefined') return;
  if (window.mietparkCRMBridgeResponse) return;

  window.mietparkCRMBridgeResponse = (response: unknown) => {
    const message = response as BridgeResponse;
    if (!message || typeof message !== 'object' || typeof message.id !== 'string') return;

    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);

    if (message.ok) {
      handler.resolve(message.result);
      return;
    }

    handler.reject(new Error(message.error || 'Bridge request failed'));
  };
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bridge_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function callNativeBridge<TResult = unknown, TPayload = unknown>(
  type: string,
  payload: TPayload
): Promise<TResult> {
  if (!isMacApp()) {
    throw new Error('Native bridge is not available outside the macOS app');
  }

  ensureBridgeListener();

  const id = createRequestId();
  const request: BridgeRequest<TPayload> = { id, type, payload };

  return await new Promise<TResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    try {
      window.webkit?.messageHandlers?.mietparkCRM?.postMessage(request);
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error('Failed to post bridge message'));
    }
  });
}
