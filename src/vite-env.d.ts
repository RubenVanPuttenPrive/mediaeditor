/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Cloudflare Web Analytics beacon token; empty disables analytics. */
  readonly VITE_CF_BEACON_TOKEN?: string;
}
