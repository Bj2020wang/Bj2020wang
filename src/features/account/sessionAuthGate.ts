import { ACCOUNT_TOKEN_KEY } from './config';

/** 当前浏览器会话是否持有业务登录 token（仅存 sessionStorage，关页即失效） */
export function hasSessionBusinessAuth(): boolean {
  if (typeof window === 'undefined') return false;
  const t = sessionStorage.getItem(ACCOUNT_TOKEN_KEY);
  return typeof t === 'string' && t.trim().length > 0;
}
