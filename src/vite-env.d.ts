/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  /** 不含末尾斜杠，例如 https://xxx.ap-shanghai.app.tcloudbase.com */
  readonly VITE_ACCOUNT_HTTP_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
