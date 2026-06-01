import {
  WECHAT_APP_ID,
  WECHAT_CALLBACK_URL,
  getAccountHttpUrl,
  ACCOUNT_TOKEN_KEY,
  ACCOUNT_EMAIL_KEY,
  WECHAT_LOGIN_PENDING_KEY,
} from './config';

export interface WechatCallbackResult {
  token: string;
  email: string;
  error?: undefined;
}

export interface WechatCallbackError {
  error: string;
  token?: undefined;
  email?: undefined;
}

export type WechatCallbackSuccess = WechatCallbackResult & { error: undefined };

/**
 * 检测当前 URL 是否包含微信登录回调参数（token / email / error）。
 * 有则清理 URL 并返回结果，无则返回 null。
 *
 * 应在 React 挂载前（main.tsx）调用一次，以便在状态初始化前写入 sessionStorage。
 */
export function detectWechatCallback(): WechatCallbackSuccess | WechatCallbackError | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const email = params.get('email');
  const error = params.get('error');

  if (!token && !error) {
    return null;
  }

  // 清除 URL 中的回调参数，不留痕迹
  params.delete('token');
  params.delete('email');
  params.delete('error');
  const cleanSearch = params.toString();
  const newUrl = cleanSearch
    ? `${window.location.pathname}?${cleanSearch}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);

  if (error) {
    return { error };
  }

  if (token && email) {
    return { token, email, error: undefined };
  }

  // token 存在但缺少 email（异常情况）
  return { error: '登录数据不完整' };
}

/**
 * 校验微信登录配置，完整后跳转微信 OAuth 二维码页。
 *
 * - 未配置 VITE_WECHAT_APP_ID 或 VITE_WECHAT_CALLBACK_URL 时抛出错误
 * - state 参数携带 app 跳回地址与云函数 API URL
 */
export function initiateWechatLogin(): void {
  const appId = WECHAT_APP_ID;
  const callbackUrl = WECHAT_CALLBACK_URL;
  const apiUrl = getAccountHttpUrl();

  if (!appId) {
    throw new Error('未配置 VITE_WECHAT_APP_ID');
  }
  if (!callbackUrl) {
    throw new Error('未配置 VITE_WECHAT_CALLBACK_URL');
  }

  // state 中携带回调目的地与云函数网关地址
  const statePayload = JSON.stringify({
    r: window.location.origin,
    a: apiUrl,
  });

  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(statePayload)}#wechat_redirect`;

  window.location.href = url;
}

/**
 * 将 detectWechatCallback 返回的 token/email 写入 sessionStorage，
 * 供 useAccountAuth 初始化时读取。
 */
export function persistWechatSession(result: WechatCallbackSuccess): void {
  sessionStorage.setItem(ACCOUNT_TOKEN_KEY, result.token);
  sessionStorage.setItem(ACCOUNT_EMAIL_KEY, result.email);
  sessionStorage.setItem(WECHAT_LOGIN_PENDING_KEY, 'true');
}
