/// <reference types="vite/client" />

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorkerUrl: () => string;
    };
  }
}

export {};

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  };
  export default workerConstructor;
}
