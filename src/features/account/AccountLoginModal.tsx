import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSharedAccountAuth } from './AccountAuthContext';
import { AccountSyncConflictError } from './authApi';
import type { SnapshotHistoryItem } from './authApi';
import { watchUserSnapshotByEmail } from './userSnapshotDb';
import type { UserSnapshotDocPayload } from './userSnapshotDb';

const AUTO_PUSH_IDLE_MS = 30_000;
const AUTO_PUSH_INTERVAL_MS = 60_000;
const AUTO_SYNC_COOLDOWN_MS = 15_000;
const AUTO_PUSH_ENABLED_KEY = 'todo-calendar-auto-push-enabled';
const AUTO_PUSH_LAST_AT_KEY = 'todo-calendar-auto-push-last-at';
const FIRST_PULL_DONE_KEY = 'todo-calendar-first-pull-done';
const ACCOUNT_LAST_PULL_AT_KEY = 'todo-calendar-account-last-pull-at';
const ACCOUNT_LAST_PUSH_AT_KEY = 'todo-calendar-account-last-push-at';
/** watch 不可用时用云函数 pull 轮询兜底（与手动「拉取云端」同路径，不依赖前端库可读） */
const SNAPSHOT_POLL_INTERVAL_MS = 15_000;

interface AccountLoginModalProps {
  open: boolean;
  onClose: () => void;
  onPullSnapshot: (snapshot: unknown) => void;
  onPushSnapshot: () => unknown;
  onRuntimeStatusChange?: (status: '未登录' | '同步中' | '空闲') => void;
}

export default function AccountLoginModal({
  open,
  onClose,
  onPullSnapshot,
  onPushSnapshot,
  onRuntimeStatusChange,
}: AccountLoginModalProps) {
  const {
    businessToken,
    accountEmail,
    hint,
    sendCode,
    verify,
    logout,
    setHint,
    pullSnapshot,
    pushSnapshot,
    listSnapshotHistory,
    restoreSnapshotHistory,
    baseVersion,
    updateBaseVersion,
  } = useSharedAccountAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyItems, setHistoryItems] = useState<SnapshotHistoryItem[]>([]);
  const [syncStatus, setSyncStatus] = useState('');
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTO_PUSH_ENABLED_KEY) === '1';
  });
  const [hasPulledOnce, setHasPulledOnce] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(FIRST_PULL_DONE_KEY) === '1';
  });
  const [lastAutoPushAt, setLastAutoPushAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(AUTO_PUSH_LAST_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  const [lastPullAt, setLastPullAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(ACCOUNT_LAST_PULL_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  const [lastPushAt, setLastPushAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(ACCOUNT_LAST_PUSH_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  const lastActivityAtRef = useRef(Date.now());
  const lastAutoPushAtRef = useRef(0);
  const lastSyncActionAtRef = useRef(0);
  const lastReportedRuntimeRef = useRef<string>('');
  const baseVersionRef = useRef(baseVersion);
  const pullSnapshotRef = useRef(pullSnapshot);
  pullSnapshotRef.current = pullSnapshot;

  useEffect(() => {
    baseVersionRef.current = baseVersion;
  }, [baseVersion]);

  /** 云端 user_snapshots 变更实时合并（需验码后拿到 customLoginTicket 且控制台配置好库权限） */
  useEffect(() => {
    if (typeof window === 'undefined' || !businessToken) return;
    if (!accountEmail) return;

    console.info('[sync-debug] watch start', {
      email: accountEmail,
      baseVersion: baseVersionRef.current,
      ts: Date.now(),
    });

    let cancelled = false;
    let closeFn: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let pollStarted = false;

    const applyRemoteRow = (row: UserSnapshotDocPayload | null, source: 'watch' | 'poll') => {
      if (cancelled) {
        console.info('[sync-debug] apply ignored: cancelled', { source, ts: Date.now() });
        return;
      }
      if (!row) {
        console.info('[sync-debug] row empty', { source, ts: Date.now() });
        return;
      }
      const v = row.version;
      console.info('[sync-debug] remote row', {
        source,
        incomingVersion: v,
        baseVersion: baseVersionRef.current,
        updatedAt: row.updatedAt,
        ts: Date.now(),
      });
      if (v <= baseVersionRef.current) {
        console.info('[sync-debug] skipped by version gate', {
          source,
          incomingVersion: v,
          baseVersion: baseVersionRef.current,
          ts: Date.now(),
        });
        return;
      }
      console.info('[sync-debug] apply snapshot', {
        source,
        incomingVersion: v,
        previousBaseVersion: baseVersionRef.current,
        ts: Date.now(),
      });
      onPullSnapshot(row.snapshot);
      updateBaseVersion(v);
    };

    const runPollPull = async () => {
      if (cancelled || !businessToken) return;
      try {
        const res = await pullSnapshotRef.current(businessToken, { syncBaseVersion: false });
        const cloudVer = typeof res.data?.version === 'number' ? res.data.version : 0;
        const row: UserSnapshotDocPayload = {
          snapshot: res.data?.snapshot ?? null,
          updatedAt: typeof res.data?.updatedAt === 'number' ? res.data.updatedAt : null,
          version: cloudVer,
          lastWriterDeviceId:
            typeof res.data?.lastWriterDeviceId === 'string' ? res.data.lastWriterDeviceId : null,
          lastWriterPlatform:
            typeof res.data?.lastWriterPlatform === 'string' ? res.data.lastWriterPlatform : null,
        };
        applyRemoteRow(row, 'poll');
      } catch (e) {
        console.warn('[sync-debug] poll pull failed', { e, ts: Date.now() });
      }
    };

    const startPollFallback = () => {
      if (pollStarted || cancelled) return;
      pollStarted = true;
      console.warn('[sync-debug] watch failed, starting HTTP poll fallback', {
        email: accountEmail,
        intervalMs: SNAPSHOT_POLL_INTERVAL_MS,
        ts: Date.now(),
      });
      void runPollPull();
      pollTimer = window.setInterval(() => {
        void runPollPull();
      }, SNAPSHOT_POLL_INTERVAL_MS);
    };

    void watchUserSnapshotByEmail(accountEmail, {
      onChange: (row) => applyRemoteRow(row, 'watch'),
      onError: (err) => {
        const e = err as {
          errCode?: unknown;
          errMsg?: unknown;
          message?: unknown;
          original?: unknown;
        } | null;
        console.warn('[sync-debug] watch error', {
          email: accountEmail,
          errCode: e?.errCode ?? null,
          errMsg: e?.errMsg ?? null,
          message: e?.message ?? null,
          original: e?.original ?? null,
          err,
          ts: Date.now(),
        });
        startPollFallback();
      },
    }).then((w) => {
      if (cancelled) {
        w.close();
        return;
      }
      closeFn = w.close;
      console.info('[sync-debug] watch ready', { email: accountEmail, ts: Date.now() });
    });

    return () => {
      cancelled = true;
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
      console.info('[sync-debug] watch cleanup', { email: accountEmail, ts: Date.now() });
      closeFn?.();
    };
  }, [accountEmail, businessToken, onPullSnapshot, updateBaseVersion]);

  const reportRuntime = (status: '未登录' | '同步中' | '空闲') => {
    if (lastReportedRuntimeRef.current === status) return;
    lastReportedRuntimeRef.current = status;
    onRuntimeStatusChange?.(status);
  };

  const readUpdatedAt = (value: unknown): number | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = (value as { updatedAt?: unknown }).updatedAt;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };

  const formatTime = (ts: number | null): string => {
    if (!ts) return '未知';
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  };

  const normalizeSnapshotForCompare = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const cloned = { ...(value as Record<string, unknown>) };
    delete cloned.updatedAt;
    return cloned;
  };

  const toComparableString = (value: unknown): string => {
    try {
      return JSON.stringify(normalizeSnapshotForCompare(value));
    } catch {
      return '';
    }
  };

  const checkSyncStatus = async (
    token: string
  ): Promise<{
    localUpdatedAt: number | null;
    cloudUpdatedAt: number | null;
    localHasChanges: boolean;
    cloudHasNewerVersion: boolean;
    cloudVersion: number;
  }> => {
    const localSnapshot = onPushSnapshot();
    const localUpdatedAt = readUpdatedAt(localSnapshot);
    const cloudRes = await pullSnapshot(token, { syncBaseVersion: false });
    const cloudSnapshot = cloudRes.data?.snapshot;
    const cloudUpdatedAt = typeof cloudRes.data?.updatedAt === 'number' ? cloudRes.data.updatedAt : null;
    const cloudVersion = typeof cloudRes.data?.version === 'number' ? cloudRes.data.version : 0;
    const cloudHasNewerVersion = cloudVersion > baseVersion;
    const localComparable = toComparableString(localSnapshot);
    const cloudComparable = toComparableString(cloudSnapshot);
    const snapshotDifferent = localComparable !== '' && cloudComparable !== '' && localComparable !== cloudComparable;
    const localHasChanges = snapshotDifferent || (!!localUpdatedAt && (!cloudUpdatedAt || localUpdatedAt > cloudUpdatedAt));
    setHasPendingSync(localHasChanges && !cloudHasNewerVersion);

    if (!localUpdatedAt && !cloudUpdatedAt) {
      setSyncStatus('暂无可比较的同步时间');
      return { localUpdatedAt, cloudUpdatedAt, localHasChanges, cloudHasNewerVersion, cloudVersion };
    }
    if (cloudHasNewerVersion) {
      setSyncStatus('检测到云端有更新，建议先拉取云端');
      return { localUpdatedAt, cloudUpdatedAt, localHasChanges, cloudHasNewerVersion, cloudVersion };
    }
    if (cloudUpdatedAt && (!localUpdatedAt || cloudUpdatedAt > localUpdatedAt)) {
      setSyncStatus('检测到云端有更新，建议先拉取云端');
      return { localUpdatedAt, cloudUpdatedAt, localHasChanges, cloudHasNewerVersion, cloudVersion };
    }
    if (localHasChanges) {
      setSyncStatus('检测到本地有未推送更新，建议推送云端');
      return { localUpdatedAt, cloudUpdatedAt, localHasChanges, cloudHasNewerVersion, cloudVersion };
    }
    setSyncStatus('本地与云端已同步');
    return { localUpdatedAt, cloudUpdatedAt, localHasChanges, cloudHasNewerVersion, cloudVersion };
  };

  useEffect(() => {
    if (!businessToken) {
      setSyncStatus('');
      setHistoryItems([]);
      setHasPendingSync(false);
      reportRuntime('未登录');
      return;
    }

    let cancelled = false;
    const tick = async () => {
      reportRuntime('同步中');
      try {
        const summary = await checkSyncStatus(businessToken);
        if (!autoPushEnabled || !hasPulledOnce || busy) {
          reportRuntime('空闲');
          return;
        }
        const now = Date.now();
        const isIdle = now - lastActivityAtRef.current >= AUTO_PUSH_IDLE_MS;
        const intervalOk = now - lastAutoPushAtRef.current >= AUTO_PUSH_INTERVAL_MS;
        const cooldownOk = now - lastSyncActionAtRef.current >= AUTO_SYNC_COOLDOWN_MS;
        if (!isIdle || !intervalOk || !cooldownOk) {
          reportRuntime('空闲');
          return;
        }

        if (summary.cloudHasNewerVersion && summary.localHasChanges) {
          const pullRes = await pullSnapshot(businessToken);
          onPullSnapshot(pullRes.data?.snapshot ?? null);
          const pulledAt = Date.now();
          setLastPullAt(pulledAt);
          window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));

          const mergedSnapshot = onPushSnapshot();
          await pushSnapshot(businessToken, mergedSnapshot);
          const pushedAt = Date.now();
          lastAutoPushAtRef.current = pushedAt;
          lastSyncActionAtRef.current = pushedAt;
          setLastAutoPushAt(pushedAt);
          window.localStorage.setItem(AUTO_PUSH_LAST_AT_KEY, String(pushedAt));
          setLastPushAt(pushedAt);
          window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
          setHasPendingSync(false);
          setSyncStatus('已自动执行双向同步（先拉后推）');
          reportRuntime('空闲');
          return;
        }

        if (summary.cloudHasNewerVersion) {
          const pullRes = await pullSnapshot(businessToken);
          onPullSnapshot(pullRes.data?.snapshot ?? null);
          const pulledAt = Date.now();
          lastSyncActionAtRef.current = pulledAt;
          setLastPullAt(pulledAt);
          window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));
          setHasPendingSync(false);
          setSyncStatus('已自动拉取云端最新数据');
          reportRuntime('空闲');
          return;
        }

        if (summary.localHasChanges) {
          const localSnapshot = onPushSnapshot();
          await pushSnapshot(businessToken, localSnapshot);
          const pushedAt = Date.now();
          lastAutoPushAtRef.current = pushedAt;
          lastSyncActionAtRef.current = pushedAt;
          setLastAutoPushAt(pushedAt);
          window.localStorage.setItem(AUTO_PUSH_LAST_AT_KEY, String(pushedAt));
          setLastPushAt(pushedAt);
          window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
          setHasPendingSync(false);
          setSyncStatus('空闲自动推送完成');
        }
        reportRuntime('空闲');
      } catch (e) {
        if (e instanceof AccountSyncConflictError) {
          if (!cancelled) setSyncStatus('自动推送遇到版本冲突，建议先拉取云端');
          reportRuntime('空闲');
          return;
        }
        if (!cancelled) {
          setSyncStatus('');
        }
        reportRuntime('空闲');
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoPushEnabled, baseVersion, businessToken, busy, hasPulledOnce, onRuntimeStatusChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AUTO_PUSH_ENABLED_KEY, autoPushEnabled ? '1' : '0');
  }, [autoPushEnabled]);

  useEffect(() => {
    if (!businessToken || !autoPushEnabled) return;
    const markActive = () => {
      lastActivityAtRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    return () => {
      events.forEach((name) => window.removeEventListener(name, markActive));
    };
  }, [autoPushEnabled, businessToken]);

  useEffect(() => {
    if (!businessToken || !hasPendingSync) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [businessToken, hasPendingSync]);

  const handleSend = async () => {
    setError('');
    if (!email.trim()) {
      setError('请填写邮箱');
      return;
    }
    setBusy(true);
    try {
      await sendCode(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    if (!email.trim() || !code.trim()) {
      setError('请填写邮箱和验证码');
      return;
    }
    setBusy(true);
    try {
      await verify(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const localSnapshot = onPushSnapshot();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const res = await pullSnapshot(businessToken);
      const cloudUpdatedAt = typeof res.data?.updatedAt === 'number' ? res.data.updatedAt : null;
      const confirmed = window.confirm(
        `确认用云端数据覆盖本地吗？\n注意：会覆盖本地未上云的改动。\n云端写入时间：${formatTime(cloudUpdatedAt)}\n本地保存时间：${formatTime(localUpdatedAt)}`
      );
      if (!confirmed) {
        setHint('已取消拉取，保留本地数据');
        return;
      }
      onPullSnapshot(res.data?.snapshot ?? null);
      const pulledAt = Date.now();
      setLastPullAt(pulledAt);
      window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));
      setHasPulledOnce(true);
      window.localStorage.setItem(FIRST_PULL_DONE_KEY, '1');
      setHint('已从云端拉取并应用到本地');
    } catch (e) {
      setError(e instanceof Error ? e.message : '拉取失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const localSnapshot = onPushSnapshot();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const cloudRes = await pullSnapshot(businessToken);
      const cloudUpdatedAt = typeof cloudRes.data?.updatedAt === 'number' ? cloudRes.data.updatedAt : null;
      const confirmed = window.confirm(
        `确认将本地数据推送到云端吗？\n本地保存时间：${formatTime(localUpdatedAt)}\n云端写入时间：${formatTime(cloudUpdatedAt)}`
      );
      if (!confirmed) {
        setHint('已取消推送，保留云端数据');
        return;
      }
      await pushSnapshot(businessToken, localSnapshot);
      const pushedAt = Date.now();
      setLastPushAt(pushedAt);
      window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
      setHint('已将本地数据推送到云端');
    } catch (e) {
      if (e instanceof AccountSyncConflictError) {
        const doForce = window.confirm(
          `检测到云端版本已变化（当前基线版本：${baseVersion}）。\n` +
            `可先拉取云端再处理，或点“确定”强制用本地覆盖云端。`
        );
        if (doForce) {
          const localSnapshot = onPushSnapshot();
          await pushSnapshot(businessToken, localSnapshot, { force: true });
          setHint('已强制推送本地数据并覆盖云端');
          return;
        }
        setHint('已取消推送，建议先拉取云端后再处理');
        return;
      }
      setError(e instanceof Error ? e.message : '推送失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadHistory = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const res = await listSnapshotHistory(businessToken);
      setHistoryItems(res.data?.items ?? []);
      setHint((res.data?.items?.length ?? 0) > 0 ? '已加载云端历史快照' : '暂无历史快照');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载历史失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreHistory = async (item: SnapshotHistoryItem) => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const localSnapshot = onPushSnapshot();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const confirmed = window.confirm(
        `确认恢复这条历史快照到本地吗？\n历史备份时间：${formatTime(item.backupAt ?? null)}\n该快照原更新时间：${formatTime(
          item.updatedAt ?? null
        )}\n本地更新时间：${formatTime(localUpdatedAt)}`
      );
      if (!confirmed) {
        setHint('已取消恢复历史快照');
        return;
      }
      const res = await restoreSnapshotHistory(businessToken, item.id);
      onPullSnapshot(res.data?.snapshot ?? null);
      setHint('已恢复历史快照到本地（如需上云请再点推送云端）');
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复历史失败');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        className="relative w-full max-w-md rounded-xl border border-[#2E2E36] bg-[#212128] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-login-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-[#9CA3AF] hover:bg-[#2A2A32] hover:text-white"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-[#2E2E36] px-5 py-4">
          <h2 id="account-login-title" className="text-lg font-semibold text-white">
            账号（邮箱验证码）
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            首次会先匿名登录 CloudBase，再调用云端接口；业务 token 仅存本会话。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {businessToken ? (
            <div className="rounded-lg bg-[#2A2A32] px-3 py-2 text-sm text-emerald-300">
              当前已登录（业务会话）
            </div>
          ) : null}

          <label className="block text-xs font-medium text-[#9CA3AF]">
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#3E3E48] bg-[#1A1A1F] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A853]"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
            />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1 text-xs font-medium text-[#9CA3AF]">
              验证码
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3E3E48] bg-[#1A1A1F] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A853]"
                placeholder="6 位数字"
                disabled={busy}
              />
            </label>
          </div>

          {(error || hint || syncStatus) && (
            <p className={`text-sm ${error ? 'text-red-400' : 'text-[#9CA3AF]'}`}>
              {error || hint || syncStatus}
            </p>
          )}

          {businessToken ? (
            <label className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <input
                type="checkbox"
                checked={autoPushEnabled}
                onChange={(e) => {
                  if (e.target.checked && !hasPulledOnce) {
                    window.alert('首次登录请先执行一次“拉取云端”，再开启自动推送。');
                    setAutoPushEnabled(false);
                    return;
                  }
                  setAutoPushEnabled(e.target.checked);
                }}
                disabled={busy}
              />
              开启空闲自动推送（空闲 30 秒，最短间隔 60 秒）
            </label>
          ) : null}

          {businessToken && !hasPulledOnce ? (
            <p className="text-xs text-amber-300">首次登录请先拉取云端，避免自动推送覆盖云端数据。</p>
          ) : null}

          {businessToken && autoPushEnabled ? (
            <p className="text-xs text-[#9CA3AF]">
              上次自动推送时间：{formatTime(lastAutoPushAt)}
            </p>
          ) : null}
          {businessToken ? (
            <p className="text-xs text-[#9CA3AF]">上次拉取时间：{formatTime(lastPullAt)}</p>
          ) : null}
          {businessToken ? (
            <p className="text-xs text-[#9CA3AF]">上次推送时间：{formatTime(lastPushAt)}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleSend}
              className="rounded-lg bg-[#3E3E48] px-4 py-2 text-sm font-medium text-white hover:bg-[#4B5563] disabled:opacity-50"
            >
              发送验证码
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleVerify}
              className="rounded-lg bg-[#D4A853] px-4 py-2 text-sm font-medium text-black hover:bg-[#e8c066] disabled:opacity-50"
            >
              验证并登录
            </button>
            {businessToken ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePull}
                  className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                >
                  拉取云端
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePush}
                  className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                >
                  推送云端
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLoadHistory}
                  className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                >
                  查看历史
                </button>
              </>
            ) : null}
            {businessToken ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  logout();
                  setHint('');
                  setCode('');
                }}
                className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32]"
              >
                退出业务登录
              </button>
            ) : null}
          </div>

          {businessToken && historyItems.length > 0 ? (
            <div className="rounded-lg border border-[#2E2E36] bg-[#1A1A1F] p-3">
              <p className="mb-2 text-xs font-medium text-[#9CA3AF]">云端历史快照（最近 3 条）</p>
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-[#212128] px-2 py-2">
                    <div className="min-w-0 text-xs text-[#9CA3AF]">
                      <p>备份时间：{formatTime(item.backupAt ?? null)}</p>
                      <p>快照原时间：{formatTime(item.updatedAt ?? null)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreHistory(item)}
                      className="shrink-0 rounded-md border border-[#3E3E48] px-3 py-1 text-xs text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
