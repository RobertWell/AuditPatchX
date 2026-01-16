/// <reference types="react-scripts" />

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorkerUrl: () => string;
    };
  }
}

export {};
