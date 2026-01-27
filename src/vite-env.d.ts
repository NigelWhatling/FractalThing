/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export {};
