import cloudbase from '@cloudbase/js-sdk';
import { CLOUDBASE_ENV_ID, CLOUDBASE_PUBLISHABLE_KEY, CLOUDBASE_REGION } from './config';

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let app: CloudbaseApp | null = null;

function buildInitOptions(): Parameters<typeof cloudbase.init>[0] {
  const opts: Parameters<typeof cloudbase.init>[0] = {
    env: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION,
    persistence: 'local',
  };
  if (CLOUDBASE_PUBLISHABLE_KEY) {
    opts.accessKey = CLOUDBASE_PUBLISHABLE_KEY;
  }
  return opts;
}

export function getCloudbaseApp(): CloudbaseApp {
  if (!app) {
    app = cloudbase.init(buildInitOptions());
  }
  return app;
}

/** 兼容不同版本 SDK 返回的 accessToken 结构 */
function unwrapAccessToken(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.accessToken === 'string') return o.accessToken;
  if (typeof o.access_token === 'string') return o.access_token;
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>;
    if (typeof d.access_token === 'string') return d.access_token;
    if (typeof d.accessToken === 'string') return d.accessToken;
  }
  return null;
}

/** 情况 B：先匿名登录，保证函数权限 auth != null */
export async function ensureAnonymousSignIn(): Promise<void> {
  const cb = getCloudbaseApp();
  const auth = cb.auth();
  const loginState = await auth.getLoginState();
  if (loginState) return;
  await auth.signInAnonymously();
}

/** 用于 HTTP 网关 Authorization: Bearer … */
export async function getCloudbaseAccessToken(): Promise<string> {
  await ensureAnonymousSignIn();
  const raw = await getCloudbaseApp().auth().getAccessToken();
  const accessToken = unwrapAccessToken(raw);
  if (accessToken) return accessToken;
  throw new Error(
    '无法获取 CloudBase access token，请确认匿名登录已开启且安全域名包含当前站点。'
  );
}

/**
 * HTTP 路由开启身份认证时，优先使用 Publishable Key 作为 Bearer。
 * 若未配置 Publishable Key，再回退到登录态 access token。
 */
export async function getHttpAuthorizationToken(): Promise<string> {
  if (CLOUDBASE_PUBLISHABLE_KEY) return CLOUDBASE_PUBLISHABLE_KEY;
  return getCloudbaseAccessToken();
}
