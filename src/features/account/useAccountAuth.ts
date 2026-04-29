import { useCallback, useState } from 'react';
import {
  ACCOUNT_TOKEN_KEY,
  ACCOUNT_VERIFICATION_EMAIL_KEY,
  ACCOUNT_VERIFICATION_ID_KEY,
} from './config';
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
    const res = await api.sendCode(email.trim());
    const vid = res.data?.verification_id;
    if (!vid) throw new Error('未返回 verification_id');
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACCOUNT_VERIFICATION_ID_KEY, vid);
      sessionStorage.setItem(ACCOUNT_VERIFICATION_EMAIL_KEY, email.trim().toLowerCase());
    }
    setHint('验证码已发送，请查收邮箱；若未收到可稍后再试或检查垃圾箱。');
  }, []);

  const verify = useCallback(
    async (email: string, code: string) => {
      setHint('');
      if (typeof window === 'undefined') throw new Error('仅浏览器内可验证');
      const vid = sessionStorage.getItem(ACCOUNT_VERIFICATION_ID_KEY);
      if (!vid) throw new Error('请先发送验证码');
      const storedEmail = sessionStorage.getItem(ACCOUNT_VERIFICATION_EMAIL_KEY);
      const norm = email.trim().toLowerCase();
      if (storedEmail && storedEmail !== norm) {
        throw new Error('请使用发送验证码时填写的同一邮箱');
      }
      const res = await api.verifyCode(norm, code.trim(), vid);
      const token = res.data?.token;
      if (!token) throw new Error('未返回 token');
      sessionStorage.removeItem(ACCOUNT_VERIFICATION_ID_KEY);
      sessionStorage.removeItem(ACCOUNT_VERIFICATION_EMAIL_KEY);
      persistBusinessToken(token);
      setHint('登录成功');
      return res.data;
    },
    [persistBusinessToken]
  );

  const logout = useCallback(() => {
    persistBusinessToken(null);
    setHint('');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ACCOUNT_VERIFICATION_ID_KEY);
      sessionStorage.removeItem(ACCOUNT_VERIFICATION_EMAIL_KEY);
    }
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
