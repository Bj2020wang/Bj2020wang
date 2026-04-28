import { useCallback, useState } from 'react';
import { ACCOUNT_TOKEN_KEY } from './config';
import * as api from './authApi';

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ACCOUNT_TOKEN_KEY);
}

export function useAccountAuth() {
  const [businessToken, setBusinessToken] = useState<string | null>(() => readStoredToken());
  const [hint, setHint] = useState('');

  const persistBusinessToken = useCallback((token: string | null) => {
    setBusinessToken(token);
    if (typeof window === 'undefined') return;
    if (token) sessionStorage.setItem(ACCOUNT_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCOUNT_TOKEN_KEY);
  }, []);

  const sendCode = useCallback(async (email: string) => {
    setHint('');
    await api.sendCode(email.trim());
    setHint('验证码已发送（若生产环境未返回验证码，请到邮箱或后台查看）');
  }, []);

  const verify = useCallback(
    async (email: string, code: string) => {
      setHint('');
      const res = await api.verifyCode(email.trim(), code.trim());
      const token = res.data?.token;
      if (!token) throw new Error('未返回 token');
      persistBusinessToken(token);
      setHint('登录成功');
      return res.data;
    },
    [persistBusinessToken]
  );

  const logout = useCallback(() => {
    persistBusinessToken(null);
    setHint('');
  }, [persistBusinessToken]);

  return {
    businessToken,
    hint,
    setHint,
    sendCode,
    verify,
    logout,
    persistBusinessToken,
    pullSnapshot: api.pullSnapshot,
    pushSnapshot: api.pushSnapshot,
  };
}
