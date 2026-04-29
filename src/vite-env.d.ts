/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  /** 与控制台环境一致，例如 ap-shanghai */
  readonly VITE_CLOUDBASE_REGION?: string;
  /**
   * 客户端 Publishable Key（控制台 → ApiKey / 身份令牌管理）。
   * 开启 HTTP 路由「身份认证」后强烈建议配置，否则易出现 403。
   */
  readonly VITE_CLOUDBASE_PUBLISHABLE_KEY?: string;
  /** 不含末尾斜杠，例如 https://xxx.ap-shanghai.app.tcloudbase.com */
  readonly VITE_ACCOUNT_HTTP_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
