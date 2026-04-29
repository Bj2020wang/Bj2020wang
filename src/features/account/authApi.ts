import { getHttpAuthorizationToken } from './cloudbase';
import { getAccountHttpUrl } from './config';

export type AccountApiEnvelope<T = unknown> = {
  code: number;
  message: string;
  data?: T;
};

export async function postAccountAction<T = unknown>(body: {
  action: string;
  payload?: Record<string, unknown>;
}): Promise<AccountApiEnvelope<T>> {
  const accessToken = await getHttpAuthorizationToken();
  const res = await fetch(getAccountHttpUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  let json: AccountApiEnvelope<T>;
  try {
    json = (await res.json()) as AccountApiEnvelope<T>;
  } catch {
    throw new Error('服务器返回非 JSON');
  }

  if (!res.ok) {
    throw new Error(json.message || `请求失败 HTTP ${res.status}`);
  }
  if (json.code !== 0) {
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
  return postAccountAction<{ token: string; email: string }>({
    action: 'verify-code',
    payload: { email, code, verificationId },
  });
}

export function pullSnapshot(token: string) {
  return postAccountAction<{ email: string; snapshot: unknown; updatedAt?: number | null }>({
    action: 'pull',
    payload: { token },
  });
}

export function pushSnapshot(token: string, snapshot: unknown) {
  return postAccountAction<{ email: string; updatedAt: number }>({
    action: 'push',
    payload: { token, snapshot },
  });
}
