/** CloudBase 环境 ID（必须在 .env 中配置 VITE_CLOUDBASE_ENV_ID） */
export const CLOUDBASE_ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim() ?? '';

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

/** 当前业务登录邮箱（小写），用于直连数据库查询与 watch */
export const ACCOUNT_EMAIL_KEY = 'todo-calendar-account-email';

/** 云开发内置邮箱验证码流程：发码接口返回的 verification_id（与邮箱成对暂存） */
export const ACCOUNT_VERIFICATION_ID_KEY = 'todo-calendar-account-verification-id';
export const ACCOUNT_VERIFICATION_EMAIL_KEY = 'todo-calendar-account-verification-email';
export const ACCOUNT_BASE_VERSION_KEY = 'todo-calendar-account-base-version';
export const ACCOUNT_DEVICE_ID_KEY = 'todo-calendar-account-device-id';

/** 工作区：个人云同步 vs 双人协作空间 */
export const WORKSPACE_MODE_KEY = 'todo-calendar-workspace-mode';
export const ACTIVE_TEAM_ID_KEY = 'todo-calendar-active-team-id';

export function teamBaseVersionStorageKey(teamId: string): string {
  return `todo-calendar-team-base-${teamId}`;
}

/** 与 FIRST_PULL_DONE_KEY 同理：协作空间至少拉取一次后才自动推，避免覆盖队友数据 */
export function teamFirstPullDoneKey(teamId: string): string {
  return `todo-calendar-team-first-pull-${teamId}`;
}

export function getAccountHttpOrigin(): string {
  const fromEnv = import.meta.env.VITE_ACCOUNT_HTTP_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://cloudbase-prepaid-2ewaac0459784f-1310767840.ap-shanghai.app.tcloudbase.com';
}

export function getAccountHttpUrl(): string {
  return `${getAccountHttpOrigin()}${ACCOUNT_HTTP_PATH}`;
}
