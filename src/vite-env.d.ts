/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_GA_ID?: string;
  readonly VITE_FORCE_EU?: string;
  readonly VITE_EU_COUNTRY?: string;
}

declare var dataLayer: unknown[] | undefined;
declare var gtag: ((...args: unknown[]) => void) | undefined;
