import cloudbase from '@cloudbase/js-sdk';
import { CLOUDBASE_ENV_ID, CLOUDBASE_PUBLISHABLE_KEY, CLOUDBASE_REGION } from './config';
import { throwIfTauriFetchLikelySecurityDomain } from './desktopFetchHint';

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
  try {
    const cb = getCloudbaseApp();
    const auth = cb.auth();
    const loginState = await auth.getLoginState();
    if (loginState) return;
    await auth.signInAnonymously();
  } catch (e) {
    throwIfTauriFetchLikelySecurityDomain(e);
    throw e;
  }
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

/**
 * 使用云函数返回的票据切换为自定义登录（用于数据库安全规则中的 auth.uid）。
 * 未配置自定义登录私钥时服务端不返回票据，本函数不应被调用。
 */
export async function signInWithCustomTicketIfPresent(ticket: string | null | undefined): Promise<void> {
  if (ticket == null || typeof ticket !== 'string' || !ticket.trim()) return;
  const auth = getCloudbaseApp().auth();
  await auth.signInWithCustomTicket(() => Promise.resolve(ticket));
  try {
    const state = await auth.getLoginState();
    const s = state as unknown as { uid?: unknown; isAnonymous?: unknown } | null;
    const scopeFn = (auth as unknown as { loginScope?: () => Promise<string> }).loginScope;
    const scope = typeof scopeFn === 'function' ? await scopeFn.call(auth) : 'unknown';
    console.info('[sync-debug] custom sign-in done', {
      hasLoginState: !!state,
      loginScope: scope,
      uid: s?.uid ?? null,
      isAnonymous: s?.isAnonymous ?? null,
      ts: Date.now(),
    });
  } catch (e) {
    console.warn('[sync-debug] custom sign-in state read failed', { e, ts: Date.now() });
  }
}

/** 退出 CloudBase 登录态（含自定义登录）；之后 HTTP 需要可再匿名登录 */
export async function signOutCloudbaseAuth(): Promise<void> {
  try {
    await getCloudbaseApp().auth().signOut();
  } catch {
    // ignore
  }
}
