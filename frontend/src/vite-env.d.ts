/// <reference types="vite/client" />

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorkerUrl: () => string;
    };
  }
}

export {};
