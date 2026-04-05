declare global {
  interface Window {
    mietparkCRMBridgeResponse?: (response: unknown) => void;
    webkit?: {
      messageHandlers?: {
        mietparkCRM?: {
          postMessage: (payload: unknown) => void;
        };
      };
    };
  }
}

export {};
