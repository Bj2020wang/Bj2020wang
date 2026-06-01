import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_BASE_VERSION_KEY,
  ACCOUNT_DEVICE_ID_KEY,
  ACCOUNT_EMAIL_KEY,
  ACCOUNT_TOKEN_KEY,
  ACCOUNT_VERIFICATION_EMAIL_KEY,
  ACCOUNT_VERIFICATION_ID_KEY,
} from './config';
import { signInWithCustomTicketIfPresent, signOutCloudbaseAuth } from './cloudbase';
import * as api from './authApi';

/** 旧版本曾把 token/邮箱写入 localStorage；启动时清除，避免遗留凭证 */
function purgeLegacyAccountAuthFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACCOUNT_TOKEN_KEY);
    window.localStorage.removeItem(ACCOUNT_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  purgeLegacyAccountAuthFromLocalStorage();
  return sessionStorage.getItem(ACCOUNT_TOKEN_KEY);
}

function readStoredEmail(): string | null {
  if (typeof window === 'undefined') return null;
  purgeLegacyAccountAuthFromLocalStorage();
  const raw = sessionStorage.getItem(ACCOUNT_EMAIL_KEY);
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v || null;
}

function ensureDeviceId(): string {
  if (typeof window === 'undefined') return 'web-unknown';
  const existed = localStorage.getItem(ACCOUNT_DEVICE_ID_KEY);
  if (existed) return existed;
  const id =
    'web-' +
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2));
  localStorage.setItem(ACCOUNT_DEVICE_ID_KEY, id);
  return id;
}

function readBaseVersion(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(ACCOUNT_BASE_VERSION_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function useAccountAuth() {
  const [businessToken, setBusinessToken] = useState<string | null>(() => readStoredToken());
  const [accountEmail, setAccountEmail] = useState<string | null>(() => readStoredEmail());
  const [hint, setHint] = useState('');
  const [baseVersion, setBaseVersion] = useState<number>(() => readBaseVersion());
  const [deviceId] = useState<string>(() => ensureDeviceId());
  const baseVersionRef = useRef(baseVersion);
  useEffect(() => {
    baseVersionRef.current = baseVersion;
  }, [baseVersion]);

  const persistBusinessToken = useCallback((token: string | null) => {
    setBusinessToken(token);
    if (typeof window === 'undefined') return;
    try {
      if (token) sessionStorage.setItem(ACCOUNT_TOKEN_KEY, token);
      else sessionStorage.removeItem(ACCOUNT_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const persistAccountEmail = useCallback((email: string | null) => {
    setAccountEmail(email);
    if (typeof window === 'undefined') return;
    try {
      if (email) sessionStorage.setItem(ACCOUNT_EMAIL_KEY, email);
      else sessionStorage.removeItem(ACCOUNT_EMAIL_KEY);
    } catch {
      /* ignore */
    }
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
      sessionStorage.setItem(ACCOUNT_EMAIL_KEY, norm);
      setAccountEmail(norm);
      persistBusinessToken(token);
      try {
        await signInWithCustomTicketIfPresent(res.data?.customLoginTicket ?? null);
      } catch (e) {
        console.warn('[account] 自定义登录未成功，直连数据库将不可用直至控制台配置票据', e);
      }
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
      sessionStorage.removeItem(ACCOUNT_EMAIL_KEY);
    }
    setAccountEmail(null);
    void signOutCloudbaseAuth();
  }, [persistBusinessToken]);

  const updateBaseVersion = useCallback((next: number) => {
    setBaseVersion(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACCOUNT_BASE_VERSION_KEY, String(next));
    }
  }, []);

  const withAuthGuard = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } catch (e) {
        if (e instanceof api.AccountAuthExpiredError) {
          persistBusinessToken(null);
          setHint('登录已失效，请重新验证');
        }
        throw e;
      }
    },
    [persistBusinessToken]
  );

  const pullSnapshot = useCallback(
    (token: string, opts?: { syncBaseVersion?: boolean }) =>
      withAuthGuard(async () => {
        const res = await api.pullSnapshot(token);
        const em = res.data?.email;
        if (em && typeof window !== 'undefined') {
          const normalized = String(em).trim().toLowerCase();
          sessionStorage.setItem(ACCOUNT_EMAIL_KEY, normalized);
          setAccountEmail(normalized);
        }
        const ver = typeof res.data?.version === 'number' ? res.data.version : 0;
        if (opts?.syncBaseVersion !== false) {
          updateBaseVersion(ver);
        }
        return res;
      }),
    [withAuthGuard, updateBaseVersion]
  );

  const pushSnapshot = useCallback(
    (token: string, snapshot: unknown, opts?: { force?: boolean }) =>
      withAuthGuard(async () => {
        const res = await api.pushSnapshot(token, snapshot, {
          baseVersion: baseVersionRef.current,
          deviceId,
          platform: 'web',
          force: opts?.force === true,
        });
        const ver = typeof res.data?.version === 'number' ? res.data.version : baseVersionRef.current;
        updateBaseVersion(ver);
        return res;
      }),
    [withAuthGuard, deviceId, updateBaseVersion]
  );

  return {
    businessToken,
    accountEmail,
    hint,
    setHint,
    sendCode,
    verify,
    logout,
    baseVersion,
    deviceId,
    persistBusinessToken,
    persistAccountEmail,
    pullSnapshot,
    pushSnapshot,
    listSnapshotHistory: (token: string) => withAuthGuard(() => api.listSnapshotHistory(token)),
    restoreSnapshotHistory: (token: string, historyId: string) =>
      withAuthGuard(() => api.restoreSnapshotHistory(token, historyId)),
    updateBaseVersion,
  };
}

export type AccountAuthContextValue = ReturnType<typeof useAccountAuth>;
