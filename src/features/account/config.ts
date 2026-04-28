/** CloudBase 环境 ID（可在 .env 中用 VITE_CLOUDBASE_ENV_ID 覆盖） */
export const CLOUDBASE_ENV_ID =
  import.meta.env.VITE_CLOUDBASE_ENV_ID ?? 'cloudbase-prepaid-2ewaac0459784f';

/** HTTP 访问服务上的路由路径（与控制台配置一致） */
export const ACCOUNT_HTTP_PATH = '/test';

/** 业务登录 token（verify-code 返回），仅存内存/sessionStorage */
export const ACCOUNT_TOKEN_KEY = 'todo-calendar-account-token';

export function getAccountHttpOrigin(): string {
  const fromEnv = import.meta.env.VITE_ACCOUNT_HTTP_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://cloudbase-prepaid-2ewaac0459784f-1310767840.ap-shanghai.app.tcloudbase.com';
}

export function getAccountHttpUrl(): string {
  return `${getAccountHttpOrigin()}${ACCOUNT_HTTP_PATH}`;
}
