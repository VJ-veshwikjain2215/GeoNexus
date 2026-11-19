/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend REST API. Defaults to the same-origin path `/api/v1`. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
