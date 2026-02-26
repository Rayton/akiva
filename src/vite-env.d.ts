/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_COUCHDB_SALES_URL?: string;
  readonly VITE_COUCHDB_USERNAME?: string;
  readonly VITE_COUCHDB_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
