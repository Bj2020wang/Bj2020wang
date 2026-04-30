import { getHttpAuthorizationToken } from './cloudbase';
import { getAccountHttpUrl } from './config';
import { throwIfTauriFetchLikelySecurityDomain } from './desktopFetchHint';

export type AccountApiEnvelope<T = unknown> = {
  code: number;
  message: string;
  data?: T;
};

export class AccountAuthExpiredError extends Error {
  constructor(message = '登录已失效，请重新验证') {
    super(message);
    this.name = 'AccountAuthExpiredError';
  }
}

export class AccountSyncConflictError extends Error {
  currentVersion: number | null;
  updatedAt: number | null;
  constructor(
    message = '云端数据已更新，请先拉取或确认覆盖',
    opts?: { currentVersion?: number | null; updatedAt?: number | null }
  ) {
    super(message);
    this.name = 'AccountSyncConflictError';
    this.currentVersion = opts?.currentVersion ?? null;
    this.updatedAt = opts?.updatedAt ?? null;
  }
}

export type SnapshotHistoryItem = {
  id: string;
  backupAt?: number | null;
  updatedAt?: number | null;
};

export async function postAccountAction<T = unknown>(body: {
  action: string;
  payload?: Record<string, unknown>;
}): Promise<AccountApiEnvelope<T>> {
  const accessToken = await getHttpAuthorizationToken();
  let res: Response;
  try {
    res = await fetch(getAccountHttpUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throwIfTauriFetchLikelySecurityDomain(e);
    throw e;
  }

  let json: AccountApiEnvelope<T>;
  try {
    json = (await res.json()) as AccountApiEnvelope<T>;
  } catch {
    throw new Error('服务器返回非 JSON');
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new AccountAuthExpiredError(json.message || '登录已失效，请重新验证');
    }
    if (res.status === 409 || json.code === 409) {
      const data = (json.data ?? {}) as { currentVersion?: number; updatedAt?: number };
      throw new AccountSyncConflictError(json.message || '云端数据已更新，请先拉取或确认覆盖', {
        currentVersion: typeof data.currentVersion === 'number' ? data.currentVersion : null,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : null,
      });
    }
    throw new Error(json.message || `请求失败 HTTP ${res.status}`);
  }
  if (json.code !== 0) {
    if (json.code === 401) {
      throw new AccountAuthExpiredError(json.message || '登录已失效，请重新验证');
    }
    if (json.code === 409) {
      const data = (json.data ?? {}) as { currentVersion?: number; updatedAt?: number };
      throw new AccountSyncConflictError(json.message || '云端数据已更新，请先拉取或确认覆盖', {
        currentVersion: typeof data.currentVersion === 'number' ? data.currentVersion : null,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : null,
      });
    }
    throw new Error(json.message || '接口返回错误');
  }
  return json;
}

export function sendCode(email: string) {
  return postAccountAction<{
    email: string;
    verification_id: string;
    expires_in?: number;
    is_user?: boolean;
  }>({
    action: 'send-code',
    payload: { email },
  });
}

export function verifyCode(email: string, code: string, verificationId: string) {
  return postAccountAction<{
    token: string;
    email: string;
    customLoginTicket?: string | null;
  }>({
    action: 'verify-code',
    payload: { email, code, verificationId },
  });
}

export function pullSnapshot(token: string) {
  return postAccountAction<{
    email: string;
    snapshot: unknown;
    updatedAt?: number | null;
    version?: number;
    lastWriterDeviceId?: string | null;
    lastWriterPlatform?: string | null;
  }>({
    action: 'pull',
    payload: { token },
  });
}

export function pushSnapshot(
  token: string,
  snapshot: unknown,
  opts?: { baseVersion?: number; deviceId?: string; platform?: string; force?: boolean }
) {
  return postAccountAction<{ email: string; updatedAt: number; version: number; forceApplied?: boolean }>({
    action: 'push',
    payload: {
      token,
      snapshot,
      baseVersion: opts?.baseVersion ?? 0,
      deviceId: opts?.deviceId,
      platform: opts?.platform ?? 'web',
      force: opts?.force === true,
    },
  });
}

export function listSnapshotHistory(token: string) {
  return postAccountAction<{ email: string; items: SnapshotHistoryItem[] }>({
    action: 'list-history',
    payload: { token },
  });
}

export function restoreSnapshotHistory(token: string, historyId: string) {
  return postAccountAction<{
    email: string;
    snapshot: unknown;
    backupAt?: number | null;
    updatedAt?: number | null;
  }>({
    action: 'restore-history',
    payload: { token, historyId },
  });
}
