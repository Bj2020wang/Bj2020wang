import { getHttpAuthorizationToken } from './cloudbase';
import { ACCOUNT_HTTP_PATH, getAccountHttpUrl } from './config';
import { rethrowAccountNetworkError } from './desktopFetchHint';

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
  let accessToken: string;
  try {
    accessToken = await getHttpAuthorizationToken();
  } catch (e) {
    rethrowAccountNetworkError(e, 'cloudbase-auth');
  }
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
    rethrowAccountNetworkError(e, 'account-http-gateway');
  }

  const contentType = res.headers.get('content-type') ?? '';
  const rawText = await res.text();
  let json: AccountApiEnvelope<T>;
  try {
    json = JSON.parse(rawText) as AccountApiEnvelope<T>;
  } catch {
    const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 320);
    throw new Error(
      [
        '服务器返回的不是 JSON（常见：HTTP 路由未指向云函数，网关回了 HTML 404/错误页）。',
        `请求地址：${getAccountHttpUrl()}（路径来自 ACCOUNT_HTTP_PATH=${ACCOUNT_HTTP_PATH}，可用环境变量 VITE_ACCOUNT_HTTP_PATH 覆盖）`,
        `HTTP ${res.status}；Content-Type：${contentType || '（无）'}`,
        preview
          ? `响应片段：${preview}${rawText.length > preview.length ? '…' : ''}`
          : '响应体为空。',
        '',
        '请到腾讯云控制台 → CloudBase → HTTP 访问服务：确认「默认域名 + 路由路径」绑定的云函数为 newworld，且路径与本应用一致；修改 .env 后需重启 npm run dev。',
      ].join('\n')
    );
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

export type TeamPeerAccess = 'bothPush' | 'peerReadOnly' | 'peerReadAllWriteOwn';

export function teamCreate(token: string, name?: string) {
  return postAccountAction<{
    teamId: string;
    name: string;
    members: string[];
    peerReadOnly?: boolean;
    peerAccess?: TeamPeerAccess;
  }>({
    action: 'team-create',
    payload: { token, name },
  });
}

export function teamJoin(token: string, teamId: string) {
  return postAccountAction<{
    teamId: string;
    name: string;
    members: string[];
    alreadyMember?: boolean;
    peerReadOnly?: boolean;
    peerAccess?: TeamPeerAccess;
    ownerEmail?: string | null;
  }>({
    action: 'team-join',
    payload: { token, teamId },
  });
}

export function teamLeave(token: string, teamId: string) {
  return postAccountAction<{
    left: boolean;
    teamDeleted?: boolean;
    members?: string[];
    ownerEmail?: string | null;
  }>({
    action: 'team-leave',
    payload: { token, teamId },
  });
}

export function teamGet(token: string, teamId: string) {
  return postAccountAction<{
    teamId: string;
    name: string;
    members: string[];
    ownerEmail?: string | null;
    peerReadOnly?: boolean;
    peerAccess?: TeamPeerAccess;
    version: number;
    updatedAt?: number | null;
  }>({
    action: 'team-get',
    payload: { token, teamId },
  });
}

export function teamPull(token: string, teamId: string) {
  return postAccountAction<{
    teamId: string;
    name: string;
    members: string[];
    ownerEmail?: string | null;
    peerReadOnly?: boolean;
    peerAccess?: TeamPeerAccess;
    snapshot: unknown;
    updatedAt?: number | null;
    version: number;
    lastWriterDeviceId?: string | null;
    lastWriterPlatform?: string | null;
  }>({
    action: 'team-pull',
    payload: { token, teamId },
  });
}

export function teamPush(
  token: string,
  teamId: string,
  snapshot: unknown,
  opts?: { baseVersion?: number; deviceId?: string; platform?: string; force?: boolean }
) {
  return postAccountAction<{
    teamId: string;
    updatedAt: number;
    version: number;
    forceApplied?: boolean;
  }>({
    action: 'team-push',
    payload: {
      token,
      teamId,
      snapshot,
      baseVersion: opts?.baseVersion ?? 0,
      deviceId: opts?.deviceId,
      platform: opts?.platform ?? 'web',
      force: opts?.force === true,
    },
  });
}

export function teamSetPeerReadOnly(token: string, teamId: string, peerReadOnly: boolean) {
  return postAccountAction<{ teamId: string; peerReadOnly: boolean; peerAccess?: TeamPeerAccess }>({
    action: 'team-set-peer-read-only',
    payload: { token, teamId, peerReadOnly },
  });
}

export function teamSetPeerAccess(token: string, teamId: string, peerAccess: TeamPeerAccess) {
  return postAccountAction<{ teamId: string; peerAccess: TeamPeerAccess; peerReadOnly: boolean }>({
    action: 'team-set-peer-access',
    payload: { token, teamId, peerAccess },
  });
}
