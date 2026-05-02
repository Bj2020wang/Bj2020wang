import { useCallback, useEffect, useRef, useState } from 'react';
import { ThumbsUp, X } from 'lucide-react';
import * as authApi from './authApi';
import { AccountSyncConflictError } from './authApi';
import type { SnapshotHistoryItem, TeamPeerAccess } from './authApi';
import { normalizeTeamPeerAccess } from '@/lib/teamCollab';
import { TEAM_AUTO_BIDIR_ENABLED_KEY, teamFirstPullDoneKey } from './config';
import { useSharedAccountAuth } from './useSharedAccountAuth';
import { watchUserSnapshotByEmail } from './userSnapshotDb';
import type { UserSnapshotDocPayload } from './userSnapshotDb';
import { syncDebugInfo, syncDebugWarn } from './syncDebug';

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

type SettingsTab = 'login' | 'sync' | 'team';

function formatSyncShortTime(ts: number | null): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

function readUpdatedAt(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as { updatedAt?: unknown }).updatedAt;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function normalizeSnapshotForCompare(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const cloned = { ...(value as Record<string, unknown>) };
  delete cloned.updatedAt;
  return cloned;
}

function snapshotToComparableString(value: unknown): string {
  try {
    return JSON.stringify(normalizeSnapshotForCompare(value));
  } catch {
    return '';
  }
}

interface AccountLoginModalProps {
  open: boolean;
  onClose: () => void;
  onPullSnapshot: (snapshot: unknown) => void;
  onPushSnapshot: () => unknown;
  /** 顶栏一行文案，例如「已登录 · 拉 14:05 · 推 14:06 · 轮询兜底」 */
  onRuntimeStatusChange?: (statusLine: string) => void;
  /** 个人云 vs 双人协作（team_snapshots） */
  workspaceMode?: 'personal' | 'team';
  activeTeamId?: string | null;
  teamBaseVersion?: number;
  onSwitchToTeamWorkspace?: (teamId: string) => Promise<void>;
  /** skipTeamFlush：已调用 team-leave 等场景，勿再 team-push */
  onSwitchToPersonalWorkspace?: (opts?: { skipTeamFlush?: boolean }) => Promise<void>;
  onTeamCloudPulled?: (teamId: string, snapshot: unknown, version: number) => void;
  onTeamPushedVersion?: (teamId: string, version: number) => void;
  teamPeerAccess?: TeamPeerAccess;
  teamOwnerEmail?: string | null;
  onTeamWorkspaceMeta?: (meta: { peerAccess: TeamPeerAccess; ownerEmail: string | null }) => void;
  /** 业务登出完成后：若用户选择清空本机日历，由宿主清理 localStorage 与界面状态 */
  onAfterLogout?: (opts: { clearLocalCalendar: boolean }) => void;
}

export default function AccountLoginModal({
  open,
  onClose,
  onPullSnapshot,
  onPushSnapshot,
  onRuntimeStatusChange,
  workspaceMode = 'personal',
  activeTeamId = null,
  teamBaseVersion = 0,
  onSwitchToTeamWorkspace,
  onSwitchToPersonalWorkspace,
  onTeamCloudPulled,
  onTeamPushedVersion,
  teamPeerAccess = 'bothPush',
  teamOwnerEmail = null,
  onTeamWorkspaceMeta,
  onAfterLogout,
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
    deviceId,
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
  const [teamAutoBidirEnabled, setTeamAutoBidirEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TEAM_AUTO_BIDIR_ENABLED_KEY) === '1';
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
  const [pollFallbackActive, setPollFallbackActive] = useState(false);
  const [logoutChoiceOpen, setLogoutChoiceOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('login');
  const [teamJoinId, setTeamJoinId] = useState('');
  const [teamMemberEmails, setTeamMemberEmails] = useState<string[]>([]);
  const lastActivityAtRef = useRef(Date.now());
  const lastAutoPushAtRef = useRef(0);
  const lastSyncActionAtRef = useRef(0);
  const lastReportedRuntimeRef = useRef<string>('');
  const runtimePhaseRef = useRef<'未登录' | '同步中' | '空闲'>('未登录');
  const baseVersionRef = useRef(baseVersion);
  const teamBaseVersionRef = useRef(teamBaseVersion);
  const pullSnapshotRef = useRef(pullSnapshot);
  pullSnapshotRef.current = pullSnapshot;
  const pushSnapshotRef = useRef(pushSnapshot);
  pushSnapshotRef.current = pushSnapshot;
  const onPullSnapshotRef = useRef(onPullSnapshot);
  onPullSnapshotRef.current = onPullSnapshot;
  const onPushSnapshotRef = useRef(onPushSnapshot);
  onPushSnapshotRef.current = onPushSnapshot;

  const isTeamOwner =
    !!accountEmail &&
    !!teamOwnerEmail &&
    accountEmail.trim().toLowerCase() === teamOwnerEmail.trim().toLowerCase();
  const teamPushForbidden =
    workspaceMode === 'team' &&
    !!activeTeamId &&
    teamPeerAccess === 'peerReadOnly' &&
    !!accountEmail &&
    !!teamOwnerEmail &&
    accountEmail.trim().toLowerCase() !== teamOwnerEmail.trim().toLowerCase();

  useEffect(() => {
    baseVersionRef.current = baseVersion;
  }, [baseVersion]);

  useEffect(() => {
    teamBaseVersionRef.current = teamBaseVersion;
  }, [teamBaseVersion]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasPulledOnce(window.localStorage.getItem(FIRST_PULL_DONE_KEY) === '1');
  }, [businessToken]);

  useEffect(() => {
    if (!open) setLogoutChoiceOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSettingsTab(businessToken ? 'sync' : 'login');
  }, [open, businessToken]);

  /** 云端 user_snapshots 变更实时合并（需验码后拿到 customLoginTicket 且控制台配置好库权限） */
  useEffect(() => {
    if (typeof window === 'undefined' || !businessToken) return;
    if (!accountEmail) return;
    if (workspaceMode === 'team' && activeTeamId) {
      setPollFallbackActive(false);
      return;
    }

    syncDebugInfo('watch start', {
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
        syncDebugInfo('apply ignored: cancelled', { source, ts: Date.now() });
        return;
      }
      if (!row) {
        syncDebugInfo('row empty', { source, ts: Date.now() });
        return;
      }
      const v = row.version;
      syncDebugInfo('remote row', {
        source,
        incomingVersion: v,
        baseVersion: baseVersionRef.current,
        updatedAt: row.updatedAt,
        ts: Date.now(),
      });
      if (v <= baseVersionRef.current) {
        syncDebugInfo('skipped by version gate', {
          source,
          incomingVersion: v,
          baseVersion: baseVersionRef.current,
          ts: Date.now(),
        });
        return;
      }
      syncDebugInfo('apply snapshot', {
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
        syncDebugWarn('poll-pull', 'poll pull failed', { e, ts: Date.now() });
      }
    };

    /** 个人云：与 watch 并行，固定间隔 HTTP pull（watch 仅作加速；watch 异常时 interval 已存在则不再重复建） */
    const beginPersonalPoll = (reason: 'parallel' | 'watch-failed') => {
      if (pollStarted || cancelled) return;
      pollStarted = true;
      setPollFallbackActive(true);
      if (reason === 'watch-failed') {
        syncDebugWarn('watch-fallback', 'watch failed, ensuring HTTP poll is active', {
          email: accountEmail,
          intervalMs: SNAPSHOT_POLL_INTERVAL_MS,
          ts: Date.now(),
        });
      } else {
        syncDebugInfo('[personal-poll] HTTP pull every 15s in parallel with watch', {
          email: accountEmail,
          intervalMs: SNAPSHOT_POLL_INTERVAL_MS,
          ts: Date.now(),
        });
      }
      void runPollPull();
      pollTimer = window.setInterval(() => {
        void runPollPull();
      }, SNAPSHOT_POLL_INTERVAL_MS);
    };

    beginPersonalPoll('parallel');

    void watchUserSnapshotByEmail(accountEmail, {
      onChange: (row) => applyRemoteRow(row, 'watch'),
      onError: (err) => {
        const e = err as {
          errCode?: unknown;
          errMsg?: unknown;
          message?: unknown;
          original?: unknown;
        } | null;
        syncDebugWarn('watch-error', 'watch error', {
          email: accountEmail,
          errCode: e?.errCode ?? null,
          errMsg: e?.errMsg ?? null,
          message: e?.message ?? null,
          original: e?.original ?? null,
          err,
          ts: Date.now(),
        });
        beginPersonalPoll('watch-failed');
      },
    })
      .then((w) => {
        if (cancelled) {
          w.close();
          return;
        }
        closeFn = w.close;
        syncDebugInfo('watch ready', { email: accountEmail, ts: Date.now() });
      })
      .catch((err) => {
        syncDebugWarn('watch-init', 'watch init failed', {
          email: accountEmail,
          err,
          ts: Date.now(),
        });
        beginPersonalPoll('watch-failed');
      });

    return () => {
      cancelled = true;
      setPollFallbackActive(false);
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
      syncDebugInfo('watch cleanup', { email: accountEmail, ts: Date.now() });
      closeFn?.();
    };
  }, [accountEmail, activeTeamId, businessToken, onPullSnapshot, updateBaseVersion, workspaceMode]);

  const emitIdleStatusLine = useCallback(() => {
    if (!businessToken) return;
    if (workspaceMode === 'team' && activeTeamId) {
      const line = `已登录 · 协作 ${activeTeamId} · 拉 ${formatSyncShortTime(lastPullAt)} · 推 ${formatSyncShortTime(
        lastPushAt
      )}`;
      if (line === lastReportedRuntimeRef.current) return;
      lastReportedRuntimeRef.current = line;
      onRuntimeStatusChange?.(line);
      return;
    }
    const pull = formatSyncShortTime(lastPullAt);
    const push = formatSyncShortTime(lastPushAt);
    const poll = pollFallbackActive ? ' · 定时拉取' : '';
    const line = `已登录 · 拉 ${pull} · 推 ${push}${poll}`;
    if (line === lastReportedRuntimeRef.current) return;
    lastReportedRuntimeRef.current = line;
    onRuntimeStatusChange?.(line);
  }, [activeTeamId, lastPullAt, lastPushAt, pollFallbackActive, businessToken, onRuntimeStatusChange, workspaceMode]);

  const reportRuntime = useCallback(
    (phase: '未登录' | '同步中' | '空闲') => {
      runtimePhaseRef.current = phase;
      if (phase === '未登录') {
        const line = '未登录';
        if (line === lastReportedRuntimeRef.current) return;
        lastReportedRuntimeRef.current = line;
        onRuntimeStatusChange?.(line);
        return;
      }
      if (phase === '同步中') {
        const line = '同步检查中…';
        if (line === lastReportedRuntimeRef.current) return;
        lastReportedRuntimeRef.current = line;
        onRuntimeStatusChange?.(line);
        return;
      }
      emitIdleStatusLine();
    },
    [emitIdleStatusLine, onRuntimeStatusChange]
  );

  useEffect(() => {
    if (runtimePhaseRef.current === '空闲' && businessToken) {
      emitIdleStatusLine();
    }
  }, [emitIdleStatusLine, businessToken, workspaceMode, activeTeamId]);

  useEffect(() => {
    if (!open || !businessToken || workspaceMode !== 'team' || !activeTeamId) {
      if (!open) setTeamMemberEmails([]);
      return;
    }
    let cancelled = false;
    void authApi
      .teamGet(businessToken, activeTeamId)
      .then((res) => {
        if (cancelled) return;
        setTeamMemberEmails(res.data?.members ?? []);
        onTeamWorkspaceMeta?.({
          peerAccess: normalizeTeamPeerAccess(res.data?.peerAccess, res.data?.peerReadOnly),
          ownerEmail: typeof res.data?.ownerEmail === 'string' ? res.data.ownerEmail : null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, businessToken, workspaceMode, activeTeamId, onTeamWorkspaceMeta]);

  const formatTime = (ts: number | null): string => {
    if (!ts) return '未知';
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  };

  const checkSyncStatus = useCallback(
    async (
      token: string
    ): Promise<{
      localUpdatedAt: number | null;
      cloudUpdatedAt: number | null;
      localHasChanges: boolean;
      cloudHasNewerVersion: boolean;
      cloudVersion: number;
    }> => {
      const localSnapshot = onPushSnapshotRef.current();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const cloudRes = await pullSnapshotRef.current(token, { syncBaseVersion: false });
      const cloudSnapshot = cloudRes.data?.snapshot;
      const cloudUpdatedAt = typeof cloudRes.data?.updatedAt === 'number' ? cloudRes.data.updatedAt : null;
      const cloudVersion = typeof cloudRes.data?.version === 'number' ? cloudRes.data.version : 0;
      const cloudHasNewerVersion = cloudVersion > baseVersionRef.current;
      const localComparable = snapshotToComparableString(localSnapshot);
      const cloudComparable = snapshotToComparableString(cloudSnapshot);
      const snapshotDifferent =
        localComparable !== '' && cloudComparable !== '' && localComparable !== cloudComparable;
      const localHasChanges =
        snapshotDifferent || (!!localUpdatedAt && (!cloudUpdatedAt || localUpdatedAt > cloudUpdatedAt));
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
    },
    []
  );

  const applyTeamCloudPullMerge = useCallback(
    (teamId: string, res: Awaited<ReturnType<typeof authApi.teamPull>>) => {
      onTeamWorkspaceMeta?.({
        peerAccess: normalizeTeamPeerAccess(res.data?.peerAccess, res.data?.peerReadOnly),
        ownerEmail: typeof res.data?.ownerEmail === 'string' ? res.data.ownerEmail : null,
      });
      const ver = typeof res.data?.version === 'number' ? res.data.version : 0;
      onTeamCloudPulled?.(teamId, res.data?.snapshot ?? null, ver);
      const pulledAt = Date.now();
      setLastPullAt(pulledAt);
      window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));
    },
    [onTeamCloudPulled, onTeamWorkspaceMeta]
  );

  const checkCollaborationSyncStatus = useCallback(
    async (
      token: string,
      teamId: string
    ): Promise<{
      localUpdatedAt: number | null;
      cloudUpdatedAt: number | null;
      localHasChanges: boolean;
      cloudHasNewerVersion: boolean;
      cloudVersion: number;
      pullRes: Awaited<ReturnType<typeof authApi.teamPull>>;
    }> => {
      const localSnapshot = onPushSnapshotRef.current();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const pullRes = await authApi.teamPull(token, teamId);
      const cloudSnapshot = pullRes.data?.snapshot;
      const cloudUpdatedAt = typeof pullRes.data?.updatedAt === 'number' ? pullRes.data.updatedAt : null;
      const cloudVersion = typeof pullRes.data?.version === 'number' ? pullRes.data.version : 0;
      const cloudHasNewerVersion = cloudVersion > teamBaseVersionRef.current;
      const localComparable = snapshotToComparableString(localSnapshot);
      const cloudComparable = snapshotToComparableString(cloudSnapshot);
      const snapshotDifferent =
        localComparable !== '' && cloudComparable !== '' && localComparable !== cloudComparable;
      const localHasChanges =
        snapshotDifferent ||
        (!!localUpdatedAt && (!cloudUpdatedAt || localUpdatedAt > cloudUpdatedAt));
      setHasPendingSync(localHasChanges && !cloudHasNewerVersion);

      if (!localUpdatedAt && !cloudUpdatedAt) {
        setSyncStatus('协作：暂无可比较的同步时间');
      } else if (cloudHasNewerVersion) {
        setSyncStatus('协作：检测到云端有更新');
      } else if (cloudUpdatedAt && (!localUpdatedAt || cloudUpdatedAt > localUpdatedAt)) {
        setSyncStatus('协作：检测到云端有更新');
      } else if (localHasChanges) {
        setSyncStatus('协作：检测到本地有未推送更新');
      } else {
        setSyncStatus('协作：本地与云端已同步');
      }

      return {
        localUpdatedAt,
        cloudUpdatedAt,
        localHasChanges,
        cloudHasNewerVersion,
        cloudVersion,
        pullRes,
      };
    },
    []
  );

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
      if (workspaceMode === 'team' && activeTeamId) {
        reportRuntime('空闲');
        return;
      }
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
          const pullRes = await pullSnapshotRef.current(businessToken);
          onPullSnapshotRef.current(pullRes.data?.snapshot ?? null);
          const pulledAt = Date.now();
          setLastPullAt(pulledAt);
          window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));

          const mergedSnapshot = onPushSnapshotRef.current();
          await pushSnapshotRef.current(businessToken, mergedSnapshot);
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
          const pullRes = await pullSnapshotRef.current(businessToken);
          onPullSnapshotRef.current(pullRes.data?.snapshot ?? null);
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
          const localSnapshot = onPushSnapshotRef.current();
          await pushSnapshotRef.current(businessToken, localSnapshot);
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
  }, [
    activeTeamId,
    autoPushEnabled,
    businessToken,
    busy,
    checkSyncStatus,
    hasPulledOnce,
    reportRuntime,
    workspaceMode,
  ]);

  /** 协作云：与个人云同参数的空闲自动双向（每 60s 检查；空闲 30s + 最短间隔 60s + 冷却 15s 才执行） */
  useEffect(() => {
    if (!businessToken) return;
    if (workspaceMode !== 'team' || !activeTeamId) return;

    let cancelled = false;
    const tick = async () => {
      if (!teamAutoBidirEnabled) {
        reportRuntime('空闲');
        return;
      }
      if (
        typeof window !== 'undefined' &&
        window.localStorage.getItem(teamFirstPullDoneKey(activeTeamId)) !== '1'
      ) {
        reportRuntime('空闲');
        return;
      }
      if (busy) {
        reportRuntime('空闲');
        return;
      }

      reportRuntime('同步中');
      try {
        const summary = await checkCollaborationSyncStatus(businessToken, activeTeamId);
        if (cancelled) return;

        const now = Date.now();
        const isIdle = now - lastActivityAtRef.current >= AUTO_PUSH_IDLE_MS;
        const intervalOk = now - lastAutoPushAtRef.current >= AUTO_PUSH_INTERVAL_MS;
        const cooldownOk = now - lastSyncActionAtRef.current >= AUTO_SYNC_COOLDOWN_MS;
        if (!isIdle || !intervalOk || !cooldownOk) {
          reportRuntime('空闲');
          return;
        }

        const tid = activeTeamId;
        const pullVer =
          typeof summary.pullRes.data?.version === 'number' ? summary.pullRes.data.version : 0;

        if (summary.cloudHasNewerVersion && summary.localHasChanges) {
          applyTeamCloudPullMerge(tid, summary.pullRes);
          const pulledAt = Date.now();
          lastSyncActionAtRef.current = pulledAt;
          setHasPendingSync(false);

          if (teamPushForbidden) {
            setSyncStatus('协作：已自动拉取合并（只读成员无法推送本地改动）');
            reportRuntime('空闲');
            return;
          }

          const mergedSnapshot = onPushSnapshotRef.current();
          try {
            const pushRes = await authApi.teamPush(businessToken, tid, mergedSnapshot, {
              baseVersion: pullVer,
              deviceId,
              platform: 'web',
            });
            const pv = pushRes.data?.version;
            if (typeof pv === 'number') onTeamPushedVersion?.(tid, pv);
            const pushedAt = Date.now();
            lastAutoPushAtRef.current = pushedAt;
            lastSyncActionAtRef.current = pushedAt;
            setLastAutoPushAt(pushedAt);
            window.localStorage.setItem(AUTO_PUSH_LAST_AT_KEY, String(pushedAt));
            setLastPushAt(pushedAt);
            window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
            setSyncStatus('协作：已自动执行双向同步（先拉后推）');
          } catch (e) {
            if (e instanceof AccountSyncConflictError) {
              setSyncStatus('协作自动同步遇到版本冲突，请手动拉取或推送');
            } else {
              throw e;
            }
          }
          reportRuntime('空闲');
          return;
        }

        if (summary.cloudHasNewerVersion) {
          applyTeamCloudPullMerge(tid, summary.pullRes);
          const pulledAt = Date.now();
          lastSyncActionAtRef.current = pulledAt;
          setHasPendingSync(false);
          setSyncStatus('协作：已自动拉取云端并合并');
          reportRuntime('空闲');
          return;
        }

        if (summary.localHasChanges && !teamPushForbidden) {
          const localSnapshot = onPushSnapshotRef.current();
          try {
            const pushRes = await authApi.teamPush(businessToken, tid, localSnapshot, {
              baseVersion: teamBaseVersionRef.current,
              deviceId,
              platform: 'web',
            });
            const pv = pushRes.data?.version;
            if (typeof pv === 'number') onTeamPushedVersion?.(tid, pv);
            const pushedAt = Date.now();
            lastAutoPushAtRef.current = pushedAt;
            lastSyncActionAtRef.current = pushedAt;
            setLastAutoPushAt(pushedAt);
            window.localStorage.setItem(AUTO_PUSH_LAST_AT_KEY, String(pushedAt));
            setLastPushAt(pushedAt);
            window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
            setHasPendingSync(false);
            setSyncStatus('协作：空闲自动推送完成');
          } catch (e) {
            if (e instanceof AccountSyncConflictError) {
              setSyncStatus('协作自动同步遇到版本冲突，请手动拉取或推送');
            } else {
              throw e;
            }
          }
        }
        reportRuntime('空闲');
      } catch (e) {
        if (e instanceof AccountSyncConflictError) {
          if (!cancelled) setSyncStatus('协作自动同步遇到版本冲突，请手动拉取或推送');
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
  }, [
    activeTeamId,
    applyTeamCloudPullMerge,
    businessToken,
    busy,
    checkCollaborationSyncStatus,
    deviceId,
    onTeamPushedVersion,
    reportRuntime,
    teamAutoBidirEnabled,
    teamPushForbidden,
    workspaceMode,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AUTO_PUSH_ENABLED_KEY, autoPushEnabled ? '1' : '0');
  }, [autoPushEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TEAM_AUTO_BIDIR_ENABLED_KEY, teamAutoBidirEnabled ? '1' : '0');
  }, [teamAutoBidirEnabled]);

  useEffect(() => {
    const trackTeamIdle = workspaceMode === 'team' && !!activeTeamId && teamAutoBidirEnabled;
    if (!businessToken || (!autoPushEnabled && !trackTeamIdle)) return;
    const markActive = () => {
      lastActivityAtRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    return () => {
      events.forEach((name) => window.removeEventListener(name, markActive));
    };
  }, [activeTeamId, autoPushEnabled, businessToken, teamAutoBidirEnabled, workspaceMode]);

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

  const handleTeamCreate = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    if (!onSwitchToTeamWorkspace) {
      setError('协作切换未配置');
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.teamCreate(businessToken);
      const id = res.data?.teamId;
      if (!id) throw new Error('未返回 teamId');
      setTeamMemberEmails(res.data?.members ?? []);
      await onSwitchToTeamWorkspace(id);
      setHint(`已创建协作空间，ID：${id}（可复制给队友加入）`);
      setTeamJoinId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleTeamJoin = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    const tid = teamJoinId.trim();
    if (!tid) {
      setError('请填写协作空间 ID');
      return;
    }
    if (!onSwitchToTeamWorkspace) {
      setError('协作切换未配置');
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.teamJoin(businessToken, tid);
      setTeamMemberEmails(res.data?.members ?? []);
      await onSwitchToTeamWorkspace(tid);
      setHint(res.data?.alreadyMember ? '已在该协作空间，已切换' : '已加入并切换到协作空间');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加入失败');
    } finally {
      setBusy(false);
    }
  };

  const handleTeamLeave = async () => {
    setError('');
    if (!businessToken || !activeTeamId) {
      setError('请先登录并进入协作空间');
      return;
    }
    let memberCount = 0;
    try {
      const g = await authApi.teamGet(businessToken, activeTeamId);
      memberCount = Array.isArray(g.data?.members) ? g.data.members.length : 0;
    } catch {
      memberCount = -1;
    }
    let confirmMsg: string;
    if (memberCount === 1) {
      confirmMsg =
        '【重要】当前协作空间里只有你一个人。\n\n' +
        '点「确定」退出后，整个协作空间会被删除，这个协作 ID 也会永久失效，以后无法再用该 ID 进入。\n\n' +
        '如果只是想回到个人云、但希望保留协作空间给队友或以后再用，请点「取消」，然后使用「切回个人云」。\n\n' +
        '仍要删除协作空间并退出吗？';
    } else if (memberCount === 2) {
      confirmMsg =
        '确定退出该协作空间吗？\n\n' +
        '空间会保留，队友可继续使用；协作 ID 仍然有效。你之后若在仍有空位时，可以凭同一 ID 再次加入。\n\n' +
        '若只想暂时用个人云而不退出成员身份，可点「取消」后使用「切回个人云」。';
    } else {
      confirmMsg =
        '确定退出协作空间吗？\n\n' +
        '若你是空间里最后一人，退出后整个协作空间将被删除，协作 ID 将永久失效。\n\n' +
        '若只想切回个人云、不删除协作空间，请点「取消」，改用「切回个人云」。';
    }
    if (!window.confirm(confirmMsg)) return;
    if (isTeamOwner) {
      const second =
        '【创建者二次确认】您是本协作空间的创建者，退出后将失去成员身份；若当前仅剩您一人，云端会删除该协作空间且协作 ID 永久失效。\n\n' +
        '若只想暂时使用个人云而不退出协作，请点「取消」，改用「切回个人云」。\n\n' +
        '确定仍要退出协作吗？';
      if (!window.confirm(second)) return;
    }
    setBusy(true);
    try {
      await authApi.teamLeave(businessToken, activeTeamId);
      setTeamJoinId('');
      setTeamMemberEmails([]);
      await onSwitchToPersonalWorkspace?.({ skipTeamFlush: true });
      setHint('已退出协作空间');
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出失败');
    } finally {
      setBusy(false);
    }
  };

  const handleSetTeamPeerAccess = async (next: TeamPeerAccess) => {
    setError('');
    if (!businessToken || !activeTeamId || !isTeamOwner) {
      setError('仅创建者可修改该选项');
      return;
    }
    setBusy(true);
    try {
      await authApi.teamSetPeerAccess(businessToken, activeTeamId, next);
      onTeamWorkspaceMeta?.({
        peerAccess: next,
        ownerEmail: teamOwnerEmail,
      });
      const hints: Record<TeamPeerAccess, string> = {
        bothPush: '已设为「对方可读写」：双方均可推送到协作云端',
        peerReadOnly: '已设为「对方只读」：队友可拉取、不可推送到协作云端',
        peerReadAllWriteOwn:
          '已设为「对方读全、写己」：队友可拉取全部任务，推送时仅同步本人任务、对应日程与本人笔记',
      };
      setHint(hints[next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchToPersonalOnly = async () => {
    setError('');
    if (!onSwitchToPersonalWorkspace) return;
    setBusy(true);
    try {
      await onSwitchToPersonalWorkspace();
      setHint('已切回个人云工作区');
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败');
    } finally {
      setBusy(false);
    }
  };

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
      const data = await verify(email, code);
      const token = data?.token;
      if (typeof token !== 'string' || !token) {
        setError('登录异常：未返回 token');
        return;
      }
      try {
        if (workspaceMode === 'team' && activeTeamId) {
          const res = await authApi.teamPull(token, activeTeamId);
          const ver = typeof res.data?.version === 'number' ? res.data.version : 0;
          onTeamWorkspaceMeta?.({
            peerAccess: normalizeTeamPeerAccess(res.data?.peerAccess, res.data?.peerReadOnly),
            ownerEmail: typeof res.data?.ownerEmail === 'string' ? res.data.ownerEmail : null,
          });
          onTeamCloudPulled?.(activeTeamId, res.data?.snapshot ?? null, ver);
          const pulledAt = Date.now();
          setLastPullAt(pulledAt);
          window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));
          setHint('登录成功，已自动从协作云端合并最新数据');
        } else {
          const res = await pullSnapshot(token);
          const snap = res.data?.snapshot ?? null;
          if (snap != null) {
            onPullSnapshot(snap);
          }
          const pulledAt = Date.now();
          setLastPullAt(pulledAt);
          window.localStorage.setItem(ACCOUNT_LAST_PULL_AT_KEY, String(pulledAt));
          setHasPulledOnce(true);
          window.localStorage.setItem(FIRST_PULL_DONE_KEY, '1');
          setHint('登录成功，已自动从个人云端合并最新数据');
        }
      } catch (pullErr) {
        if (workspaceMode === 'team' && activeTeamId) {
          setHint('登录时自动拉取失败，必须手动拉');
        } else {
          setHint('登录成功，但自动拉取失败，请稍后点击「拉取云端」。');
        }
        console.warn('[account] login auto-pull failed', pullErr);
      }
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
      if (workspaceMode === 'team' && activeTeamId) {
        const localSnapshot = onPushSnapshot();
        const localUpdatedAt = readUpdatedAt(localSnapshot);
        const res = await authApi.teamPull(businessToken, activeTeamId);
        const cloudUpdatedAt = typeof res.data?.updatedAt === 'number' ? res.data.updatedAt : null;
        const confirmed = window.confirm(
          `确认用协作云端数据合并到本地吗？\n注意：会按规则合并，可能覆盖本地未协作的改动。\n云端写入时间：${formatTime(
            cloudUpdatedAt
          )}\n本地保存时间：${formatTime(localUpdatedAt)}`
        );
        if (!confirmed) {
          setHint('已取消拉取协作云端');
          return;
        }
        applyTeamCloudPullMerge(activeTeamId, res);
        setHint('已从协作云端拉取并合并到本地');
        return;
      }
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
    if (workspaceMode === 'team' && activeTeamId && teamPushForbidden) {
      setError('当前为「对方只读」，仅创建者可推送到协作云端');
      return;
    }
    setBusy(true);
    try {
      if (workspaceMode === 'team' && activeTeamId) {
        const localSnapshot = onPushSnapshot();
        const localUpdatedAt = readUpdatedAt(localSnapshot);
        const cloudRes = await authApi.teamPull(businessToken, activeTeamId);
        const cloudUpdatedAt = typeof cloudRes.data?.updatedAt === 'number' ? cloudRes.data.updatedAt : null;
        const confirmed = window.confirm(
          `确认将本地数据推送到协作云端吗？\n本地保存时间：${formatTime(localUpdatedAt)}\n协作云端写入时间：${formatTime(
            cloudUpdatedAt
          )}`
        );
        if (!confirmed) {
          setHint('已取消推送到协作云端');
          return;
        }
        try {
          const pushRes = await authApi.teamPush(businessToken, activeTeamId, localSnapshot, {
            baseVersion: teamBaseVersion,
            deviceId,
            platform: 'web',
          });
          const v = pushRes.data?.version;
          if (typeof v === 'number') onTeamPushedVersion?.(activeTeamId, v);
        } catch (e) {
          if (e instanceof AccountSyncConflictError) {
            const doForce = window.confirm(
              `协作云端版本已变化（当前基线：${teamBaseVersion}）。\n可先拉取再推送，或点「确定」强制用本地覆盖协作云端。`
            );
            if (doForce) {
              const snap = onPushSnapshot();
              const pushRes = await authApi.teamPush(businessToken, activeTeamId, snap, {
                baseVersion: teamBaseVersion,
                deviceId,
                platform: 'web',
                force: true,
              });
              const v = pushRes.data?.version;
              if (typeof v === 'number') onTeamPushedVersion?.(activeTeamId, v);
              setHint('已强制推送到协作云端');
              const pushedAt = Date.now();
              setLastPushAt(pushedAt);
              window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
              return;
            }
            setHint('已取消推送，建议先拉取协作云端');
            return;
          }
          throw e;
        }
        const pushedAt = Date.now();
        setLastPushAt(pushedAt);
        window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
        setHint('已推送到协作云端');
        return;
      }
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

  /** 退出前尝试推送，再弹窗说明是否已同步，最后登出（不额外弹出「确认推送」以免与退出打断叠） */
  const executeLogout = async (clearLocalCalendar: boolean) => {
    setLogoutChoiceOpen(false);
    const finishLogout = () => {
      logout();
      if (clearLocalCalendar) onAfterLogout?.({ clearLocalCalendar: true });
      setHint('');
      setCode('');
    };
    if (!businessToken) {
      finishLogout();
      return;
    }
    setBusy(true);
    setError('');
    let syncOk = false;
    let syncDetail = '';
    try {
      if (workspaceMode === 'team' && activeTeamId) {
        if (teamPushForbidden) {
          syncDetail = '未同步：当前为「对方只读」成员，无法向协作云端推送。';
        } else {
          const localSnapshot = onPushSnapshot();
          const pushRes = await authApi.teamPush(businessToken, activeTeamId, localSnapshot, {
            baseVersion: teamBaseVersion,
            deviceId,
            platform: 'web',
          });
          const v = pushRes.data?.version;
          if (typeof v === 'number') onTeamPushedVersion?.(activeTeamId, v);
          const pushedAt = Date.now();
          setLastPushAt(pushedAt);
          window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
          syncOk = true;
        }
      } else {
        const localSnapshot = onPushSnapshot();
        await pushSnapshot(businessToken, localSnapshot);
        const pushedAt = Date.now();
        setLastPushAt(pushedAt);
        window.localStorage.setItem(ACCOUNT_LAST_PUSH_AT_KEY, String(pushedAt));
        syncOk = true;
      }
    } catch (e) {
      if (e instanceof AccountSyncConflictError) {
        syncDetail = '未同步：云端版本已变（存在冲突），未能自动推送。可稍后再登录处理。';
      } else {
        syncDetail = `未同步：${e instanceof Error ? e.message : '推送失败'}。`;
      }
    } finally {
      setBusy(false);
    }
    if (syncOk) {
      window.alert('已同步：本地数据已上传到云端。');
      finishLogout();
    } else {
      const stillQuit = window.confirm(
        `${syncDetail}\n\n仍要退出登录吗？\n点「确定」退出，点「取消」留在已登录状态。`
      );
      if (stillQuit) finishLogout();
      else setHint('已取消退出，可处理同步后再试。');
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

  const tabBtn = (t: SettingsTab) =>
    `rounded-t-lg px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
      settingsTab === t
        ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
        : 'border-transparent text-[var(--shell-text-muted)] hover:text-[var(--shell-text-strong)]'
    }`;

  const needLoginPanel = (
    <div className="rounded-lg border border-dashed border-[var(--shell-border-subtle)] bg-[var(--shell-elevated)] p-6 text-center space-y-3">
      <p className="text-sm text-[var(--shell-text-muted)]">此分类需要先完成邮箱验证登录。</p>
      <button
        type="button"
        onClick={() => setSettingsTab('login')}
        className="rounded-lg bg-[var(--shell-accent)] px-4 py-2 text-sm font-medium text-[var(--shell-accent-contrast)] hover:bg-[var(--shell-accent-hover)]"
      >
        去「登录」
      </button>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1 text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] hover:text-[var(--shell-text-strong)]"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-[var(--shell-border-subtle)] px-5 py-4 pr-12">
          <h2 id="settings-modal-title" className="text-lg font-semibold text-[var(--shell-text-strong)]">
            设置
          </h2>
          <p className="mt-1 text-xs text-[var(--shell-text-muted)]">
            登录、云端同步与双人协作。首次会先匿名登录 CloudBase；业务 token 仅存本会话。
          </p>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-[var(--shell-border-subtle)] px-3">
          <button type="button" className={tabBtn('login')} onClick={() => setSettingsTab('login')}>
            登录
          </button>
          <button type="button" className={tabBtn('sync')} onClick={() => setSettingsTab('sync')}>
            同步与云
          </button>
          <button type="button" className={tabBtn('team')} onClick={() => setSettingsTab('team')}>
            协作
          </button>
        </div>

        {(error || hint || syncStatus) ? (
          <div
            className={`border-b border-[var(--shell-border-subtle)] px-5 py-2 text-sm ${
              error ? 'text-red-400' : 'text-[var(--shell-text-muted)]'
            }`}
          >
            {error || hint || syncStatus}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {settingsTab === 'login' && (
            <div className="space-y-3">
              {businessToken ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-[var(--shell-surface-hover)] px-3 py-2 text-sm text-emerald-300">
                    当前已登录（业务会话）
                  </div>
                  {accountEmail ? (
                    <p className="text-xs text-[var(--shell-text-muted)]">登录邮箱：{accountEmail}</p>
                  ) : null}
                  <p className="text-xs text-[var(--shell-text-muted)]">
                    拉取/推送、自动同步与退出请在「同步与云」；双人协作请在「协作」。
                  </p>
                </div>
              ) : (
                <>
                  <label className="block text-xs font-medium text-[var(--shell-text-muted)]">
                    邮箱
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--shell-border)] bg-[var(--shell-elevated)] px-3 py-2 text-sm text-[var(--shell-text-strong)] outline-none focus:border-[var(--shell-accent)]"
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={busy}
                    />
                  </label>
                  <div className="flex gap-2">
                    <label className="block flex-1 text-xs font-medium text-[var(--shell-text-muted)]">
                      验证码
                      <input
                        type="text"
                        inputMode="numeric"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--shell-border)] bg-[var(--shell-elevated)] px-3 py-2 text-sm text-[var(--shell-text-strong)] outline-none focus:border-[var(--shell-accent)]"
                        placeholder="6 位数字"
                        disabled={busy}
                      />
                    </label>
                  </div>
                </>
              )}
              {!businessToken ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSend}
                    className="rounded-lg bg-[var(--shell-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text-strong)] hover:bg-[var(--shell-faint)] disabled:opacity-50"
                  >
                    发送验证码
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleVerify}
                    className="rounded-lg bg-[var(--shell-accent)] px-4 py-2 text-sm font-medium text-[var(--shell-accent-contrast)] hover:bg-[var(--shell-accent-hover)] disabled:opacity-50"
                  >
                    验证并登录
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {settingsTab === 'sync' &&
            (!businessToken ? (
              needLoginPanel
            ) : (
              <div className="space-y-3">
            {workspaceMode === 'team' && activeTeamId ? (
              <label className="flex items-center gap-2 text-xs text-[var(--shell-text-muted)]">
                <input
                  type="checkbox"
                  checked={teamAutoBidirEnabled}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setTeamAutoBidirEnabled(false);
                      return;
                    }
                    if (
                      typeof window !== 'undefined' &&
                      window.localStorage.getItem(teamFirstPullDoneKey(activeTeamId)) !== '1'
                    ) {
                      window.alert('请先在协作空间执行一次「拉取协作云端」，再开启协作空闲自动双向。');
                      setTeamAutoBidirEnabled(false);
                      return;
                    }
                    setTeamAutoBidirEnabled(true);
                  }}
                  disabled={busy}
                />
                开启协作空闲自动双向（与个人云一致：空闲约 30 秒，每 60 秒检查；可静默先拉后推）
              </label>
            ) : (
              <label className="flex items-center gap-2 text-xs text-[var(--shell-text-muted)]">
                <input
                  type="checkbox"
                  checked={autoPushEnabled}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setAutoPushEnabled(false);
                      return;
                    }
                    if (!hasPulledOnce) {
                      window.alert('首次登录请先执行一次“拉取云端”，再开启自动推送。');
                      setAutoPushEnabled(false);
                      return;
                    }
                    setAutoPushEnabled(true);
                  }}
                  disabled={busy}
                />
                开启空闲自动推送（空闲 30 秒，最短间隔 60 秒）
              </label>
            )}

          {!hasPulledOnce && workspaceMode !== 'team' ? (
            <p className="text-xs text-amber-300">首次登录请先拉取云端，避免自动推送覆盖云端数据。</p>
          ) : null}
          {workspaceMode === 'team' && activeTeamId && typeof window !== 'undefined' && window.localStorage.getItem(teamFirstPullDoneKey(activeTeamId)) !== '1' ? (
            <p className="text-xs text-amber-300">协作空间请先「拉取协作云端」一次，再开启协作空闲自动双向。</p>
          ) : null}
          {workspaceMode === 'team' && activeTeamId && teamPushForbidden ? (
            <p className="text-xs text-amber-300">当前为「对方只读」：你可拉取协作内容；推送到协作云端仅创建者可用。</p>
          ) : null}
          {workspaceMode === 'team' &&
          activeTeamId &&
          teamPeerAccess === 'peerReadAllWriteOwn' &&
          !isTeamOwner ? (
            <p className="text-xs text-[var(--shell-text-muted)]">
              「读全写己」：你可改自己名下的任务与对应日程；队友任务及挂在其下的日程仅可查看。
            </p>
          ) : null}

          {(autoPushEnabled || (workspaceMode === 'team' && !!activeTeamId && teamAutoBidirEnabled)) && lastAutoPushAt ? (
            <p className="text-xs text-[var(--shell-text-muted)]">
              上次自动推送时间：{formatTime(lastAutoPushAt)}
            </p>
          ) : null}

            <p className="text-xs text-[var(--shell-text-muted)]">上次拉取时间：{formatTime(lastPullAt)}</p>
            <p className="text-xs text-[var(--shell-text-muted)]">上次推送时间：{formatTime(lastPushAt)}</p>

          <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePull}
                  className="rounded-lg border border-[var(--shell-border)] px-4 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                >
                  {workspaceMode === 'team' && activeTeamId ? '拉取协作云端' : '拉取云端'}
                </button>
                <button
                  type="button"
                  disabled={busy || (workspaceMode === 'team' && !!activeTeamId && teamPushForbidden)}
                  onClick={handlePush}
                  className="rounded-lg border border-[var(--shell-border)] px-4 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                >
                  {workspaceMode === 'team' && activeTeamId ? '推送协作云端' : '推送云端'}
                </button>
                {workspaceMode !== 'team' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleLoadHistory}
                    className="rounded-lg border border-[var(--shell-border)] px-4 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                  >
                    查看历史
                  </button>
                ) : null}
              {!logoutChoiceOpen ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setLogoutChoiceOpen(true)}
                  className="rounded-lg border border-[var(--shell-border)] px-4 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]"
                >
                  退出业务登录
                </button>
              ) : null}
          </div>

          {logoutChoiceOpen ? (
            <div className="rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-elevated)] p-3">
              <p className="mb-2 text-sm text-[var(--shell-text)]">请选择退出方式：</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void executeLogout(true);
                  }}
                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  退出并清空本机日历数据
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void executeLogout(false);
                  }}
                  className="rounded-lg border border-[var(--shell-border)] px-3 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                >
                  仅退出账号，保留本地数据
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setLogoutChoiceOpen(false)}
                  className="rounded-lg border border-[var(--shell-border)] px-3 py-2 text-sm text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {workspaceMode !== 'team' && historyItems.length > 0 ? (
            <div className="rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-elevated)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--shell-text-muted)]">云端历史快照（最近 3 条）</p>
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-[var(--shell-panel)] px-2 py-2">
                    <div className="min-w-0 text-xs text-[var(--shell-text-muted)]">
                      <p>备份时间：{formatTime(item.backupAt ?? null)}</p>
                      <p>快照原时间：{formatTime(item.updatedAt ?? null)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreHistory(item)}
                      className="shrink-0 rounded-md border border-[var(--shell-border)] px-3 py-1 text-xs text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
              </div>
            ))}

          {settingsTab === 'team' &&
            (!businessToken ? (
              needLoginPanel
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-elevated)] p-3 space-y-2">
                  <p className="text-xs font-medium text-[var(--shell-text-muted)]">双人协作（MVP，最多 2 人）</p>
                  <p className="text-xs text-[var(--shell-text-muted)]">
                    当前工作区：
                    {workspaceMode === 'team' && activeTeamId ? (
                      <span className="text-emerald-300"> 协作 · {activeTeamId}</span>
                    ) : (
                      <span> 个人云</span>
                    )}
                  </p>
                  {workspaceMode === 'team' && activeTeamId && teamMemberEmails.length > 0 ? (
                    <div className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] p-2">
                      <p className="mb-1.5 text-xs font-medium text-[var(--shell-text-muted)]">成员（请区分本人与队友）</p>
                      <ul className="space-y-1">
                        {teamMemberEmails.map((raw, idx) => {
                          const em = typeof raw === 'string' ? raw.trim() : '';
                          const isMe =
                            !!accountEmail && em.toLowerCase() === accountEmail.trim().toLowerCase();
                          return (
                            <li
                              key={`${idx}-${em || String(raw)}`}
                              className="flex items-start gap-1.5 text-xs text-[var(--shell-text-strong)]"
                            >
                              {isMe ? (
                                <span
                                  className="mt-0.5 inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded bg-emerald-500/20 px-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-300"
                                  title="当前登录账号（本人）"
                                >
                                  我
                                </span>
                              ) : (
                                <span className="mt-0.5 shrink-0" title="队友（非本人，请谨慎修改或删除其任务）">
                                  <ThumbsUp
                                    className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400"
                                    strokeWidth={2.25}
                                    aria-label="队友"
                                  />
                                </span>
                              )}
                              <span className="break-all leading-snug">{em || raw}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {workspaceMode === 'team' && activeTeamId && isTeamOwner ? (
                    <div className="space-y-1 rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] p-2">
                      <p className="text-xs font-medium text-[var(--shell-text-muted)]">队友权限（仅创建者）</p>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--shell-text-strong)]">
                        <input
                          type="radio"
                          name="team-peer-mode-settings"
                          checked={teamPeerAccess === 'bothPush'}
                          onChange={() => void handleSetTeamPeerAccess('bothPush')}
                          disabled={busy}
                        />
                        对方可读写（双方均可推送到协作云端）
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--shell-text-strong)]">
                        <input
                          type="radio"
                          name="team-peer-mode-settings"
                          checked={teamPeerAccess === 'peerReadOnly'}
                          onChange={() => void handleSetTeamPeerAccess('peerReadOnly')}
                          disabled={busy}
                        />
                        对方只读（队友仅可拉取，不可推送）
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--shell-text-strong)]">
                        <input
                          type="radio"
                          name="team-peer-mode-settings"
                          checked={teamPeerAccess === 'peerReadAllWriteOwn'}
                          onChange={() => void handleSetTeamPeerAccess('peerReadAllWriteOwn')}
                          disabled={busy}
                        />
                        对方可读全部、仅写自己的任务与笔记
                      </label>
                    </div>
                  ) : null}
                  <label className="block text-xs font-medium text-[var(--shell-text-muted)]">
                    协作空间 ID（加入）
                    <input
                      type="text"
                      value={teamJoinId}
                      onChange={(e) => setTeamJoinId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 py-2 text-sm text-[var(--shell-text-strong)] outline-none focus:border-[var(--shell-accent)]"
                      placeholder="队友发给你的 ID"
                      disabled={busy}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleTeamCreate}
                      className="rounded-lg border border-[var(--shell-border)] px-3 py-1.5 text-xs text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                    >
                      创建协作空间
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleTeamJoin}
                      className="rounded-lg border border-[var(--shell-border)] px-3 py-1.5 text-xs text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                    >
                      加入并切换
                    </button>
                    {workspaceMode === 'team' && activeTeamId ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleSwitchToPersonalOnly}
                          className="rounded-lg border border-[var(--shell-border)] px-3 py-1.5 text-xs text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                        >
                          切回个人云
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleTeamLeave}
                          className="rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-[var(--shell-surface-hover)] disabled:opacity-50"
                        >
                          退出协作
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
