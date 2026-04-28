import cloudbase from '@cloudbase/js-sdk';
import { CLOUDBASE_ENV_ID } from './config';

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let app: CloudbaseApp | null = null;

export function getCloudbaseApp(): CloudbaseApp {
  if (!app) {
    app = cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      persistence: 'local',
    });
  }
  return app;
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
  const { accessToken } = await getCloudbaseApp().auth().getAccessToken();
  return accessToken;
}
