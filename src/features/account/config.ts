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

/** HTTP 访问服务上的路由路径（须与控制台路由一致；仓库默认 /test） */
export const ACCOUNT_HTTP_PATH =
  import.meta.env.VITE_ACCOUNT_HTTP_PATH?.trim().replace(/\/$/, '') || '/test';

/** 业务登录 token（verify-code 返回）；仅存 sessionStorage，关标签/非正常退出即失效，需重新登录 */
export const ACCOUNT_TOKEN_KEY = 'todo-calendar-account-token';

/** 当前业务登录邮箱（小写）；与 token 同存 sessionStorage */
export const ACCOUNT_EMAIL_KEY = 'todo-calendar-account-email';

/** 云开发内置邮箱验证码流程：发码接口返回的 verification_id（与邮箱成对暂存） */
export const ACCOUNT_VERIFICATION_ID_KEY = 'todo-calendar-account-verification-id';
export const ACCOUNT_VERIFICATION_EMAIL_KEY = 'todo-calendar-account-verification-email';
/** 未完成业务登录时曾打开「设置」，便于切到邮箱 App 回来后自动回到登录界面（会话级） */
export const ACCOUNT_SETTINGS_RESUME_OPEN_KEY = 'todo-calendar-account-settings-resume-open';
/** 登录页邮箱草稿（会话级）；未发码仅填邮箱时切走亦可恢复 */
export const ACCOUNT_LOGIN_DRAFT_EMAIL_KEY = 'todo-calendar-account-login-draft-email';
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

/** 协作工作区：与个人云同参数的空闲自动双向（拉/推检查）开关 */
export const TEAM_AUTO_BIDIR_ENABLED_KEY = 'todo-calendar-team-auto-bidir-enabled';

/**
 * 未配置 VITE_ACCOUNT_HTTP_BASE 时与 v0.2.5 等已发布安装包一致。
 * 预付型环境的「HTTP 默认域名」常为 cloudbase-prepaid-…，与控制台里的短环境 ID 拼出的 *.app.tcloudbase.com 不是同一主机；
 * 若用环境 ID 自动拼接会导致 HTTP 404，故默认仍指向本仓库历史网关。其它环境请在 .env 设置 VITE_ACCOUNT_HTTP_BASE。
 */
const LEGACY_DEFAULT_ACCOUNT_HTTP_ORIGIN =
  'https://cloudbase-prepaid-2ewaac0459784f-1310767840.ap-shanghai.app.tcloudbase.com';

export function getAccountHttpOrigin(): string {
  const raw = import.meta.env.VITE_ACCOUNT_HTTP_BASE?.trim();
  if (raw) {
    // 无协议时浏览器会把「主机名」当成相对路径，请求会打到当前站点（如 localhost）而非网关
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/$/, '');
  }
  return LEGACY_DEFAULT_ACCOUNT_HTTP_ORIGIN;
}

/** 登录失败排查用：不含密钥，仅 origin / 环境 / 网关主机 */
export function getAccountDiagnosticsSummary(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '(非浏览器)';
  const envHint = CLOUDBASE_ENV_ID
    ? CLOUDBASE_ENV_ID.length > 20
      ? `${CLOUDBASE_ENV_ID.slice(0, 20)}…`
      : CLOUDBASE_ENV_ID
    : '（未配置 VITE_CLOUDBASE_ENV_ID）';
  let httpHint = '（无法解析 HTTP 网关）';
  const rawBase = import.meta.env.VITE_ACCOUNT_HTTP_BASE?.trim();
  if (rawBase) {
    try {
      const normalized = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      httpHint = `${new URL(normalized.replace(/\/$/, '')).host}（来自 VITE_ACCOUNT_HTTP_BASE）`;
    } catch {
      httpHint = '（VITE_ACCOUNT_HTTP_BASE 格式无效）';
    }
  } else {
    try {
      httpHint = `${new URL(LEGACY_DEFAULT_ACCOUNT_HTTP_ORIGIN).host}（未配置 VITE_ACCOUNT_HTTP_BASE，使用仓库默认预付网关，与 v0.2.x 安装包一致；非本环境请在 .env 填写 VITE_ACCOUNT_HTTP_BASE）`;
    } catch {
      httpHint = '（默认 HTTP 网关无效）';
    }
  }
  const keyHint = CLOUDBASE_PUBLISHABLE_KEY
    ? '已配置 Publishable Key（HTTP 请求优先带 Key，不强制先匿名登录）'
    : '未配置 Publishable Key（发码前会先匿名登录，同样受 Web 安全域名约束）';
  return ['【诊断信息·不含密钥】', `页面 origin：${origin}`, `环境 ID：${envHint}`, `HTTP 网关主机：${httpHint}`, keyHint].join(
    '\n'
  );
}

export function getAccountHttpUrl(): string {
  return `${getAccountHttpOrigin()}${ACCOUNT_HTTP_PATH}`;
}
