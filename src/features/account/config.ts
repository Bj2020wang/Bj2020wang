/** CloudBase 环境 ID（可在 .env 中用 VITE_CLOUDBASE_ENV_ID 覆盖） */
export const CLOUDBASE_ENV_ID =
  import.meta.env.VITE_CLOUDBASE_ENV_ID ?? 'cloudbase-prepaid-2ewaac0459784f';

/** 与云开发环境地域一致（HTTP 域名一般为 *.ap-shanghai.app.tcloudbase.com） */
export const CLOUDBASE_REGION = import.meta.env.VITE_CLOUDBASE_REGION ?? 'ap-shanghai';

/**
 * 客户端 Publishable Key。开启 HTTP「身份认证」时用于 init.accessKey，
 * 并可在 getAccessToken 异常时作为 Authorization 兜底（官方允许 Bearer 携带该 Key）。
 */
export const CLOUDBASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim() ?? '';

/** HTTP 访问服务上的路由路径（与控制台配置一致） */
export const ACCOUNT_HTTP_PATH = '/test';

/** 业务登录 token（verify-code 返回），仅存内存/sessionStorage */
export const ACCOUNT_TOKEN_KEY = 'todo-calendar-account-token';

/** 云开发内置邮箱验证码流程：发码接口返回的 verification_id（与邮箱成对暂存） */
export const ACCOUNT_VERIFICATION_ID_KEY = 'todo-calendar-account-verification-id';
export const ACCOUNT_VERIFICATION_EMAIL_KEY = 'todo-calendar-account-verification-email';
export const ACCOUNT_BASE_VERSION_KEY = 'todo-calendar-account-base-version';
export const ACCOUNT_DEVICE_ID_KEY = 'todo-calendar-account-device-id';

export function getAccountHttpOrigin(): string {
  const fromEnv = import.meta.env.VITE_ACCOUNT_HTTP_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://cloudbase-prepaid-2ewaac0459784f-1310767840.ap-shanghai.app.tcloudbase.com';
}

export function getAccountHttpUrl(): string {
  return `${getAccountHttpOrigin()}${ACCOUNT_HTTP_PATH}`;
}
