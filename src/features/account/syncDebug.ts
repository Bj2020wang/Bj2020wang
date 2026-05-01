/** 仅在 `.env` 中设置 `VITE_SYNC_DEBUG=true` 并重启 dev/build 后输出（默认关闭，避免控制台噪音） */
export const isSyncDebugEnabled = (): boolean => import.meta.env.VITE_SYNC_DEBUG === 'true';

const lastWarnAt = new Map<string, number>();
const WARN_THROTTLE_MS = 30_000;

export function syncDebugInfo(payload: string, detail?: unknown): void {
  if (!isSyncDebugEnabled()) return;
  if (detail !== undefined) {
    console.info('[sync-debug]', payload, detail);
  } else {
    console.info('[sync-debug]', payload);
  }
}

/** 同类告警在 WARN_THROTTLE_MS 内只打一次，避免 watch / 轮询失败刷屏 */
export function syncDebugWarn(key: string, payload: string, detail?: unknown): void {
  if (!isSyncDebugEnabled()) return;
  const now = Date.now();
  const prev = lastWarnAt.get(key) ?? 0;
  if (now - prev < WARN_THROTTLE_MS) return;
  lastWarnAt.set(key, now);
  if (detail !== undefined) {
    console.warn('[sync-debug]', payload, detail);
  } else {
    console.warn('[sync-debug]', payload);
  }
}
