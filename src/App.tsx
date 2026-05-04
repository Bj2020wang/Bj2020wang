import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Search, Sun, Moon } from 'lucide-react';
import TodoSidebar from '@/components/TodoSidebar';
import CalendarGrid from '@/components/CalendarGrid';
import WeekView from '@/components/WeekView';
import DayView from '@/components/DayView';
import YearView from '@/components/YearView';
import GlobalSearchPanel from '@/features/search/GlobalSearchPanel';
import AccountLoginModal from '@/features/account/AccountLoginModal';
import { useSharedAccountAuth } from '@/features/account/useSharedAccountAuth';
import * as authApi from '@/features/account/authApi';
import { AccountSyncConflictError } from '@/features/account/authApi';
import {
  ACTIVE_TEAM_ID_KEY,
  WORKSPACE_MODE_KEY,
  teamBaseVersionStorageKey,
  teamFirstPullDoneKey,
} from '@/features/account/config';
import type { ViewType, CalendarEvent, TodoItem, TodoCategory, TodoScopeType } from '@/types';
import { getMonthDays, getWeekDays } from '@/lib/calendar-utils';
import { resolveTodoScopeType } from '@/lib/todoScope';
import {
  buildWriteOwnTeamSnapshot,
  effectiveEventOwnerEmail,
  effectiveTodoOwnerEmail,
  isPeerEventInTeam,
  isPeerTodoInTeam,
  normCollabEmail,
  normalizeTeamPeerAccess,
  type TeamPeerAccess,
} from '@/lib/teamCollab';
import { useEventReminders } from '@/features/notifications/useEventReminders';
import { useAppTheme } from '@/features/theme/useAppTheme';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import './App.css';

// 2024年10月9日=周三, 10日=周四, 13日=周日
const defaultTodos: TodoItem[] = [
  {
    id: '1',
    text: '周三上午9点参加部门会议',
    color: '#F59E0B',
    category: 'work',
    month: 10,
    date: '2024-10-09',
        scopeType: 'day',
        count: 1,
  },
  {
    id: '2',
    text: '周四下午5点前往金融中心参加培训课程',
    color: '#8B5CF6',
    category: 'study',
    month: 10,
    date: '2024-10-10',
    scopeType: 'day',
    count: 1,
  },
  {
    id: '3',
    text: '购物清单：生日蛋糕、红酒、水果、百事可乐、牛排',
    color: '#FFFFFF',
    category: 'life',
    month: 10,
    scopeType: 'month',
    scopeYear: 2024,
    count: 1,
  },
  {
    id: '4',
    text: '周日上午10点飞机飞往上海出差',
    color: '#FFFFFF',
    category: 'work',
    month: 10,
    date: '2024-10-13',
    scopeType: 'day',
    count: 1,
  },
  {
    id: '5',
    text: '跑步3公里',
    color: '#10B981',
    category: 'health',
    month: 10,
    scopeType: 'month',
    scopeYear: 2024,
    count: 5,
  },
  {
    id: '6',
    text: '阅读30分钟',
    color: '#3B82F6',
    category: 'study',
    month: 10,
    scopeType: 'month',
    scopeYear: 2024,
    count: 7,
  },
  {
    id: '7',
    text: '喝水8杯',
    color: '#06B6D4',
    category: 'health',
    month: 10,
    scopeType: 'month',
    scopeYear: 2024,
    count: 8,
  },
];

const defaultEvents: CalendarEvent[] = [
  { id: 'holiday-2024-10-01', title: '国庆节', color: '#3B82F6', startDate: '2024-10-01', endDate: '2024-10-01' },
  { id: 'event-1', title: '上海出差', color: '#F59E0B', startDate: '2024-10-08', endDate: '2024-10-10' },
  { id: 'event-2', title: '电话会议...', color: '#10B981', startDate: '2024-10-08', endDate: '2024-10-08', completed: true },
  { id: 'event-3', title: '同学聚会', color: '#8B5CF6', startDate: '2024-10-19', endDate: '2024-10-19' },
  { id: 'event-4', title: '妈妈生日', color: '#EC4899', startDate: '2024-10-31', endDate: '2024-10-31' },
];

const STORAGE_KEY = 'todo-calendar-local-v1';
/** 与 AccountLoginModal 一致：完成过至少一次「拉取云端」后才自动推送，避免覆盖云端 */
const FIRST_PULL_DONE_KEY = 'todo-calendar-first-pull-done';
const ACCOUNT_LAST_PULL_AT_KEY = 'todo-calendar-account-last-pull-at';
const ACCOUNT_LAST_PUSH_AT_KEY = 'todo-calendar-account-last-push-at';
const AUTO_PUSH_DEBOUNCE_MS = 1200;

function removeLocalStorageKeysByPrefix(prefixes: string[]) {
  if (typeof window === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
}

function readWorkspaceMode(): 'personal' | 'team' {
  if (typeof window === 'undefined') return 'personal';
  return window.localStorage.getItem(WORKSPACE_MODE_KEY) === 'team' ? 'team' : 'personal';
}

function readActiveTeamId(): string | null {
  if (typeof window === 'undefined') return null;
  const t = window.localStorage.getItem(ACTIVE_TEAM_ID_KEY)?.trim();
  return t || null;
}

function readTeamBaseVersion(teamId: string | null): number {
  if (!teamId || typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(teamBaseVersionStorageKey(teamId));
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

interface PersistedData {
  todos: TodoItem[];
  todoTombstones?: Record<string, number>;
  events: CalendarEvent[];
  eventTombstones?: Record<string, number>;
  currentDate: string;
  viewType: ViewType;
  eventsByDate: Record<string, string[]>;
  notesByDate: Record<string, string>;
  noteOwnerByDate?: Record<string, string>;
  noteMetaByDate?: Record<string, number>;
  noteTombstonesByDate?: Record<string, number>;
  updatedAt?: number;
}

function isPersistedDataLike(value: unknown): value is PersistedData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PersistedData>;
  if (!Array.isArray(data.todos) || !Array.isArray(data.events)) return false;
  if (typeof data.currentDate !== 'string') return false;
  if (!data.viewType || !['today', 'week', 'month', 'year'].includes(data.viewType)) return false;
  if (!data.notesByDate || typeof data.notesByDate !== 'object') return false;
  return true;
}

const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const buildEventsByDate = (events: CalendarEvent[]): Record<string, string[]> => {
  const map: Record<string, string[]> = {};
  events.forEach((event) => {
    const endDate = event.endDate || event.startDate;
    let cursor = event.startDate;
    while (cursor <= endDate) {
      if (!map[cursor]) map[cursor] = [];
      map[cursor].push(event.id);
      cursor = addDays(cursor, 1);
    }
  });
  return map;
};

const loadPersistedData = (): PersistedData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedData;
    if (!Array.isArray(parsed.todos) || !Array.isArray(parsed.events)) return null;
    if (typeof parsed.currentDate !== 'string') return null;
    if (!parsed.viewType || !['today', 'week', 'month', 'year'].includes(parsed.viewType)) return null;
    if (parsed.notesByDate && typeof parsed.notesByDate !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const categoryColorMap: Record<TodoCategory, string> = {
  work: '#10B981',
  life: '#8B5CF6',
  study: '#F59E0B',
  health: '#EC4899',
};

const inferCategoryFromColor = (color: string): TodoCategory => {
  if (color === '#10B981' || color === '#06B6D4') return 'work';
  if (color === '#8B5CF6') return 'life';
  if (color === '#EC4899') return 'health';
  return 'work';
};

const normalizeTodoColorsByCategory = (todos: TodoItem[]): TodoItem[] =>
  todos.map((todo) => {
    const targetColor = categoryColorMap[todo.category];
    return todo.color === targetColor ? todo : { ...todo, color: targetColor };
  });

const normalizeEventColorsBySourceTodo = (events: CalendarEvent[], todos: TodoItem[]): CalendarEvent[] => {
  const todoMap = new Map(todos.map((todo) => [todo.id, todo]));
  return events.map((event) => {
    const sourceTodoId = event.sourceTodoId;
    if (!sourceTodoId) return event;
    const sourceTodo = todoMap.get(sourceTodoId);
    if (!sourceTodo) return event;
    const targetColor = categoryColorMap[sourceTodo.category];
    return event.color === targetColor ? event : { ...event, color: targetColor };
  });
};

const createPersistedPayload = (
  todos: TodoItem[],
  todoTombstones: Record<string, number>,
  events: CalendarEvent[],
  eventTombstones: Record<string, number>,
  currentDate: Date,
  viewType: ViewType,
  notesByDate: Record<string, string>,
  noteOwnerByDate: Record<string, string>,
  noteMetaByDate: Record<string, number>,
  noteTombstonesByDate: Record<string, number>
): PersistedData => ({
  todos,
  todoTombstones,
  events,
  eventTombstones,
  currentDate: currentDate.toISOString(),
  viewType,
  eventsByDate: buildEventsByDate(events),
  notesByDate,
  noteOwnerByDate,
  noteMetaByDate,
  noteTombstonesByDate,
  updatedAt: Date.now(),
});

const readTodoUpdatedAt = (todo: TodoItem): number =>
  typeof todo.updatedAt === 'number' && Number.isFinite(todo.updatedAt) ? todo.updatedAt : 0;

const TODO_COMPARE_FIELDS: Array<keyof TodoItem> = [
  'text',
  'color',
  'category',
  'month',
  'date',
  'scopeType',
  'scopeStart',
  'scopeYear',
  'count',
  'collabOwnerEmail',
];

const readEventUpdatedAt = (event: CalendarEvent): number =>
  typeof event.updatedAt === 'number' && Number.isFinite(event.updatedAt) ? event.updatedAt : 0;

/** 从协作区内存中提取「本人」数据，用于切回个人云时与个人快照合并（不含队友条目）。 */
function buildMyCollaborationSliceForPersonalMerge(
  teamOwnerEmail: string,
  accountEmail: string,
  todos: TodoItem[],
  events: CalendarEvent[],
  notesByDate: Record<string, string>,
  noteOwnerByDate: Record<string, string>,
  noteMetaByDate: Record<string, number>,
  noteTombstonesByDate: Record<string, number>
): {
  myTodos: TodoItem[];
  myEvents: CalendarEvent[];
  myNotesByDate: Record<string, string>;
  myNoteOwnerByDate: Record<string, string>;
  myNoteMetaByDate: Record<string, number>;
  myNoteTombstonesByDate: Record<string, number>;
} {
  const ownerKey = normCollabEmail(teamOwnerEmail);
  const me = normCollabEmail(accountEmail);
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const myTodos = todos.filter((t) => effectiveTodoOwnerEmail(t, ownerKey) === me);
  const myEvents = events.filter((e) => effectiveEventOwnerEmail(e, todoMap, ownerKey) === me);

  const myNotesByDate: Record<string, string> = {};
  const myNoteOwnerByDate: Record<string, string> = {};
  const myNoteMetaByDate: Record<string, number> = {};
  const myNoteTombstonesByDate: Record<string, number> = {};

  for (const [dateKey, ownerRaw] of Object.entries(noteOwnerByDate)) {
    if (typeof ownerRaw !== 'string' || normCollabEmail(ownerRaw) !== me) continue;
    myNoteOwnerByDate[dateKey] = me;
    if (Object.prototype.hasOwnProperty.call(notesByDate, dateKey)) {
      myNotesByDate[dateKey] = notesByDate[dateKey];
    }
    if (Object.prototype.hasOwnProperty.call(noteMetaByDate, dateKey)) {
      myNoteMetaByDate[dateKey] = noteMetaByDate[dateKey];
    }
    if (Object.prototype.hasOwnProperty.call(noteTombstonesByDate, dateKey)) {
      myNoteTombstonesByDate[dateKey] = noteTombstonesByDate[dateKey];
    }
  }

  return {
    myTodos,
    myEvents,
    myNotesByDate,
    myNoteOwnerByDate,
    myNoteMetaByDate,
    myNoteTombstonesByDate,
  };
}

const EVENT_COMPARE_FIELDS: Array<keyof CalendarEvent> = [
  'title',
  'color',
  'startDate',
  'endDate',
  'completed',
  'sourceTodoId',
  'startTime',
  'endTime',
  'reminderMinutes',
  'collabOwnerEmail',
];

const mergeTodoRecords = (
  localTodos: TodoItem[],
  localTombstones: Record<string, number>,
  cloudTodos: TodoItem[],
  cloudTombstones: Record<string, number>
): { todos: TodoItem[]; tombstones: Record<string, number>; fieldMergeCount: number; conflictCount: number } => {
  const mergedTombstones: Record<string, number> = { ...localTombstones };
  Object.entries(cloudTombstones).forEach(([id, ts]) => {
    if (!Number.isFinite(ts)) return;
    mergedTombstones[id] = Math.max(mergedTombstones[id] ?? 0, ts);
  });

  let fieldMergeCount = 0;
  let conflictCount = 0;
  const localMap = new Map(localTodos.map((todo) => [todo.id, todo]));
  const cloudMap = new Map(cloudTodos.map((todo) => [todo.id, todo]));
  const allIds = new Set<string>([...localMap.keys(), ...cloudMap.keys()]);

  const mergedTodos: TodoItem[] = [];
  allIds.forEach((id) => {
    const localTodo = localMap.get(id);
    const cloudTodo = cloudMap.get(id);
    if (!localTodo && !cloudTodo) return;
    const hasTombstone = id in mergedTombstones;
    if (hasTombstone) return;
    let todo = localTodo ?? cloudTodo!;

    if (localTodo && cloudTodo) {
      const localAt = readTodoUpdatedAt(localTodo);
      const cloudAt = readTodoUpdatedAt(cloudTodo);
      const newer = localAt >= cloudAt ? localTodo : cloudTodo;
      const older = localAt >= cloudAt ? cloudTodo : localTodo;

      const mergedTodo: TodoItem = { ...newer };
      let mergedAnyField = false;
      let conflictOnThisTodo = false;

      for (const key of TODO_COMPARE_FIELDS) {
        const newerVal = newer[key];
        const olderVal = older[key];
        if (newerVal === olderVal) continue;
        if (newerVal === undefined && olderVal !== undefined) {
          mergedTodo[key] = olderVal as never;
          mergedAnyField = true;
          continue;
        }
        if (olderVal === undefined && newerVal !== undefined) {
          mergedTodo[key] = newerVal as never;
          mergedAnyField = true;
          continue;
        }
        conflictOnThisTodo = true;
      }

      if (mergedAnyField) fieldMergeCount += 1;
      if (conflictOnThisTodo) conflictCount += 1;
      todo = mergedTodo;
    }

    mergedTodos.push(todo);
  });

  return { todos: mergedTodos, tombstones: mergedTombstones, fieldMergeCount, conflictCount };
};

const mergeEventRecords = (
  localEvents: CalendarEvent[],
  localTombstones: Record<string, number>,
  cloudEvents: CalendarEvent[],
  cloudTombstones: Record<string, number>
): { events: CalendarEvent[]; tombstones: Record<string, number>; fieldMergeCount: number; conflictCount: number } => {
  const mergedTombstones: Record<string, number> = { ...localTombstones };
  Object.entries(cloudTombstones).forEach(([id, ts]) => {
    if (!Number.isFinite(ts)) return;
    mergedTombstones[id] = Math.max(mergedTombstones[id] ?? 0, ts);
  });
  let fieldMergeCount = 0;
  let conflictCount = 0;
  const localMap = new Map(localEvents.map((event) => [event.id, event]));
  const cloudMap = new Map(cloudEvents.map((event) => [event.id, event]));
  const allIds = new Set<string>([...localMap.keys(), ...cloudMap.keys()]);
  const mergedEvents: CalendarEvent[] = [];

  allIds.forEach((id) => {
    const localEvent = localMap.get(id);
    const cloudEvent = cloudMap.get(id);
    if (!localEvent && !cloudEvent) return;
    if (id in mergedTombstones) return;
    if (!localEvent || !cloudEvent) {
      mergedEvents.push(localEvent ?? cloudEvent!);
      return;
    }

    const localAt = readEventUpdatedAt(localEvent);
    const cloudAt = readEventUpdatedAt(cloudEvent);
    const newer = localAt >= cloudAt ? localEvent : cloudEvent;
    const older = localAt >= cloudAt ? cloudEvent : localEvent;
    const mergedEvent: CalendarEvent = { ...newer };
    let mergedAnyField = false;
    let conflictOnThisEvent = false;

    for (const key of EVENT_COMPARE_FIELDS) {
      const newerVal = newer[key];
      const olderVal = older[key];
      if (newerVal === olderVal) continue;
      if (newerVal === undefined && olderVal !== undefined) {
        mergedEvent[key] = olderVal as never;
        mergedAnyField = true;
        continue;
      }
      if (olderVal === undefined && newerVal !== undefined) {
        mergedEvent[key] = newerVal as never;
        mergedAnyField = true;
        continue;
      }
      conflictOnThisEvent = true;
    }

    if (mergedAnyField) fieldMergeCount += 1;
    if (conflictOnThisEvent) conflictCount += 1;
    mergedEvents.push(mergedEvent);
  });

  return { events: mergedEvents, tombstones: mergedTombstones, fieldMergeCount, conflictCount };
};

const mergeNoteRecords = (
  localNotes: Record<string, string>,
  localOwnerByDate: Record<string, string>,
  localMeta: Record<string, number>,
  localTombstones: Record<string, number>,
  cloudNotes: Record<string, string>,
  cloudOwnerByDate: Record<string, string>,
  cloudMeta: Record<string, number>,
  cloudTombstones: Record<string, number>
): {
  notesByDate: Record<string, string>;
  noteOwnerByDate: Record<string, string>;
  noteMetaByDate: Record<string, number>;
  noteTombstonesByDate: Record<string, number>;
  mergeCount: number;
} => {
  const mergedNotes: Record<string, string> = {};
  const mergedOwners: Record<string, string> = {};
  const mergedMeta: Record<string, number> = {};
  const mergedTombstones: Record<string, number> = {};
  let mergeCount = 0;
  const allKeys = new Set<string>([
    ...Object.keys(localNotes),
    ...Object.keys(cloudNotes),
    ...Object.keys(localOwnerByDate),
    ...Object.keys(cloudOwnerByDate),
    ...Object.keys(localMeta),
    ...Object.keys(cloudMeta),
    ...Object.keys(localTombstones),
    ...Object.keys(cloudTombstones),
  ]);

  allKeys.forEach((key) => {
    const localAt = Number.isFinite(localMeta[key]) ? localMeta[key] : 0;
    const cloudAt = Number.isFinite(cloudMeta[key]) ? cloudMeta[key] : 0;
    const localDelAt = Number.isFinite(localTombstones[key]) ? localTombstones[key] : 0;
    const cloudDelAt = Number.isFinite(cloudTombstones[key]) ? cloudTombstones[key] : 0;
    const mergedDelAt = Math.max(localDelAt, cloudDelAt);
    const cloudText = cloudNotes[key] ?? '';
    const localText = localNotes[key] ?? '';
    const useCloud = cloudAt >= localAt;
    const chosenAt = useCloud ? cloudAt : localAt;
    const chosenText = useCloud ? cloudText : localText;
    const chosenOwnerRaw = useCloud ? cloudOwnerByDate[key] : localOwnerByDate[key];
    const chosenOwner = normCollabEmail(chosenOwnerRaw);

    if (localAt > 0 && cloudAt > 0 && localAt !== cloudAt) {
      mergeCount += 1;
    }
    if (chosenAt > 0) {
      mergedMeta[key] = chosenAt;
    }
    if (mergedDelAt > 0) {
      mergedTombstones[key] = mergedDelAt;
    }
    if (chosenOwner) {
      mergedOwners[key] = chosenOwner;
    }
    // 删除墓碑时间新于（或等于）文本更新时间时，文本必须保持空，防止复活。
    if (chosenText.trim() && mergedDelAt < chosenAt) {
      mergedNotes[key] = chosenText;
    }
  });

  return {
    notesByDate: mergedNotes,
    noteOwnerByDate: mergedOwners,
    noteMetaByDate: mergedMeta,
    noteTombstonesByDate: mergedTombstones,
    mergeCount,
  };
};

export default function App() {
  const {
    businessToken,
    pushSnapshot,
    pullSnapshot,
    updateBaseVersion,
    deviceId,
    accountEmail,
  } = useSharedAccountAuth();
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'personal' | 'team'>(() => readWorkspaceMode());
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => readActiveTeamId());
  const [teamBaseVersion, setTeamBaseVersion] = useState<number>(() => readTeamBaseVersion(readActiveTeamId()));
  const [teamPeerAccess, setTeamPeerAccess] = useState<TeamPeerAccess>('bothPush');
  const [teamOwnerEmail, setTeamOwnerEmail] = useState<string | null>(null);
  const teamServerBaselineRef = useRef<PersistedData | null>(null);
  const teamBaseVersionRef = useRef(teamBaseVersion);
  useEffect(() => {
    teamBaseVersionRef.current = teamBaseVersion;
  }, [teamBaseVersion]);

  useEffect(() => {
    if (workspaceMode === 'team' && !activeTeamId) {
      queueMicrotask(() => {
        setWorkspaceMode('personal');
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(WORKSPACE_MODE_KEY, 'personal');
          window.localStorage.removeItem(ACTIVE_TEAM_ID_KEY);
        }
      });
    }
  }, [workspaceMode, activeTeamId]);

  useEffect(() => {
    queueMicrotask(() => {
      if (activeTeamId) {
        setTeamBaseVersion(readTeamBaseVersion(activeTeamId));
      } else {
        setTeamBaseVersion(0);
      }
    });
  }, [activeTeamId]);

  useEffect(() => {
    if (workspaceMode !== 'team' || !activeTeamId) {
      queueMicrotask(() => {
        setTeamPeerAccess('bothPush');
        setTeamOwnerEmail(null);
        teamServerBaselineRef.current = null;
      });
    }
  }, [workspaceMode, activeTeamId]);

  useEffect(() => {
    if (!businessToken || workspaceMode !== 'team' || !activeTeamId) return;
    let cancelled = false;
    void authApi.teamGet(businessToken, activeTeamId).then((res) => {
      if (cancelled) return;
      setTeamPeerAccess(normalizeTeamPeerAccess(res.data?.peerAccess, res.data?.peerReadOnly));
      setTeamOwnerEmail(
        typeof res.data?.ownerEmail === 'string' ? res.data.ownerEmail.trim().toLowerCase() : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [businessToken, workspaceMode, activeTeamId]);

  const updateTeamBaseVersion = useCallback((teamId: string, v: number) => {
    setTeamBaseVersion(v);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(teamBaseVersionStorageKey(teamId), String(v));
    }
  }, []);
  const [persisted] = useState<PersistedData | null>(() => loadPersistedData());
  const initialTodos = normalizeTodoColorsByCategory(persisted?.todos ?? defaultTodos);
  const initialEvents = normalizeEventColorsBySourceTodo(persisted?.events ?? defaultEvents, initialTodos);
  const [currentDate, setCurrentDate] = useState(
    persisted?.currentDate ? new Date(persisted.currentDate) : new Date(2024, 9, 15)
  ); // Oct 15, 2024
  const [viewType, setViewType] = useState<ViewType>(persisted?.viewType ?? 'month');
  const [todos, setTodos] = useState<TodoItem[]>(() => initialTodos);
  const [todoTombstones, setTodoTombstones] = useState<Record<string, number>>(persisted?.todoTombstones ?? {});
  const [events, setEvents] = useState<CalendarEvent[]>(() => initialEvents);
  const [eventTombstones, setEventTombstones] = useState<Record<string, number>>(persisted?.eventTombstones ?? {});
  const [notesByDate, setNotesByDate] = useState<Record<string, string>>(persisted?.notesByDate ?? {});
  const [noteOwnerByDate, setNoteOwnerByDate] = useState<Record<string, string>>(persisted?.noteOwnerByDate ?? {});
  const [noteMetaByDate, setNoteMetaByDate] = useState<Record<string, number>>(persisted?.noteMetaByDate ?? {});
  const [noteTombstonesByDate, setNoteTombstonesByDate] = useState<Record<string, number>>(
    persisted?.noteTombstonesByDate ?? {}
  );
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const showGlobalSearchRef = useRef(false);
  useEffect(() => {
    showGlobalSearchRef.current = showGlobalSearch;
  }, [showGlobalSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowGlobalSearch(true);
        return;
      }
      if (e.key === 'Escape' && showGlobalSearchRef.current) {
        e.preventDefault();
        setShowGlobalSearch(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const [showAccountLogin, setShowAccountLogin] = useState(false);
  const [accountSyncRuntime, setAccountSyncRuntime] = useState<string>('未登录');
  const [todoMergeHint, setTodoMergeHint] = useState('');
  const [eventMergeHint, setEventMergeHint] = useState('');
  const [noteMergeHint, setNoteMergeHint] = useState('');
  const draggedTodoRef = useRef<TodoItem | null>(null);

  useEventReminders(events);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const eventsRef = useRef(events);
  const todosRef = useRef(todos);
  const monthRef = useRef(month);
  useEffect(() => {
    eventsRef.current = events;
    todosRef.current = todos;
    monthRef.current = month;
  }, [events, todos, month]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = createPersistedPayload(
      todos,
      todoTombstones,
      events,
      eventTombstones,
      currentDate,
      viewType,
      notesByDate,
      noteOwnerByDate,
      noteMetaByDate,
      noteTombstonesByDate
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [todos, todoTombstones, events, eventTombstones, currentDate, viewType, notesByDate, noteOwnerByDate, noteMetaByDate, noteTombstonesByDate]);

  const getAccountSnapshot = useCallback((): PersistedData => {
    return createPersistedPayload(
      todos,
      todoTombstones,
      events,
      eventTombstones,
      currentDate,
      viewType,
      notesByDate,
      noteOwnerByDate,
      noteMetaByDate,
      noteTombstonesByDate
    );
  }, [todos, todoTombstones, events, eventTombstones, currentDate, viewType, notesByDate, noteOwnerByDate, noteMetaByDate, noteTombstonesByDate]);

  const getTeamPushSnapshot = useCallback((): PersistedData => {
    const local = getAccountSnapshot();
    if (workspaceMode !== 'team' || !activeTeamId || !accountEmail || !teamOwnerEmail) {
      return local;
    }
    const isOwner = normCollabEmail(accountEmail) === normCollabEmail(teamOwnerEmail);
    if (teamPeerAccess !== 'peerReadAllWriteOwn' || isOwner) {
      return local;
    }
    const baseline = teamServerBaselineRef.current;
    if (!baseline) {
      return local;
    }
    return buildWriteOwnTeamSnapshot(local, baseline, accountEmail, teamOwnerEmail) as PersistedData;
  }, [getAccountSnapshot, workspaceMode, activeTeamId, accountEmail, teamOwnerEmail, teamPeerAccess]);

  /** 已登录且完成过首次拉取后：本地数据变更则防抖推送到云端（个人 → user_snapshots；协作 → team_snapshots） */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!businessToken) {
      if (autoPushTimerRef.current) {
        clearTimeout(autoPushTimerRef.current);
        autoPushTimerRef.current = null;
      }
      return;
    }
    const inTeam = workspaceMode === 'team' && activeTeamId;
    if (inTeam) {
      if (window.localStorage.getItem(teamFirstPullDoneKey(activeTeamId)) !== '1') return;
      if (
        teamPeerAccess === 'peerReadOnly' &&
        accountEmail &&
        teamOwnerEmail &&
        accountEmail.trim().toLowerCase() !== teamOwnerEmail.trim().toLowerCase()
      ) {
        return;
      }
    } else {
      if (window.localStorage.getItem(FIRST_PULL_DONE_KEY) !== '1') return;
    }

    if (autoPushTimerRef.current) clearTimeout(autoPushTimerRef.current);
    autoPushTimerRef.current = setTimeout(() => {
      autoPushTimerRef.current = null;
      const snap = getTeamPushSnapshot();
      if (inTeam && activeTeamId) {
        void authApi
          .teamPush(businessToken, activeTeamId, snap, {
            baseVersion: teamBaseVersionRef.current,
            deviceId,
            platform: 'web',
          })
          .then((res) => {
            const v = res.data?.version;
            if (typeof v === 'number') updateTeamBaseVersion(activeTeamId, v);
            try {
              teamServerBaselineRef.current = JSON.parse(JSON.stringify(snap)) as PersistedData;
            } catch {
              /* ignore */
            }
          })
          .catch((e) => {
            if (e instanceof AccountSyncConflictError) {
              console.warn('[auto-push team] 云端版本已变，请先拉取或稍后重试', e);
              return;
            }
            console.warn('[auto-push team] 推送失败', e);
          });
      } else {
        const personalSnap = createPersistedPayload(
          todos,
          todoTombstones,
          events,
          eventTombstones,
          currentDate,
          viewType,
          notesByDate,
          noteOwnerByDate,
          noteMetaByDate,
          noteTombstonesByDate
        );
        void pushSnapshot(businessToken, personalSnap).catch((e) => {
          if (e instanceof AccountSyncConflictError) {
            console.warn('[auto-push] 云端版本已变，请先拉取或稍后重试', e);
            return;
          }
          console.warn('[auto-push] 推送失败', e);
        });
      }
    }, AUTO_PUSH_DEBOUNCE_MS);

    return () => {
      if (autoPushTimerRef.current) {
        clearTimeout(autoPushTimerRef.current);
        autoPushTimerRef.current = null;
      }
    };
  }, [
    todos,
    todoTombstones,
    events,
    eventTombstones,
    currentDate,
    viewType,
    notesByDate,
    noteOwnerByDate,
    noteMetaByDate,
    noteTombstonesByDate,
    businessToken,
    pushSnapshot,
    workspaceMode,
    activeTeamId,
    deviceId,
    updateTeamBaseVersion,
    teamPeerAccess,
    teamOwnerEmail,
    accountEmail,
    getTeamPushSnapshot,
  ]);

  // Navigation: prev/next based on current view
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewType === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (viewType === 'year') {
      d.setFullYear(d.getFullYear() - 1);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewType === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (viewType === 'year') {
      d.setFullYear(d.getFullYear() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    setShowMonthPicker(false);
    setShowYearPicker(false);
    setCurrentDate(new Date());
    setViewType('today');
  };

  const handleDragStart = useCallback((todo: TodoItem) => {
    draggedTodoRef.current = todo;
  }, []);

  // Calculate end time (1 hour after start)
  const getEndTime = (startTime: string): string => {
    const [h, m] = startTime.split(':').map(Number);
    const endH = h + 1;
    return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleDrop = useCallback((dateStr: string, time?: string) => {
    const todo = draggedTodoRef.current;
    if (todo) {
      if (
        workspaceMode === 'team' &&
        activeTeamId &&
        teamPeerAccess === 'peerReadAllWriteOwn' &&
        accountEmail &&
        teamOwnerEmail &&
        normCollabEmail(accountEmail) !== normCollabEmail(teamOwnerEmail)
      ) {
        const o = effectiveTodoOwnerEmail(todo, teamOwnerEmail);
        if (o !== normCollabEmail(accountEmail)) {
          draggedTodoRef.current = null;
          return;
        }
      }
      if (isPeerTodoInTeam(workspaceMode, accountEmail, teamOwnerEmail, todo)) {
        const ok = window.confirm(
          '这是队友名下的任务（侧栏已用点赞图标标记）。确定要将其安排到日历上吗？此操作会参与协作同步，请谨慎确认。'
        );
        if (!ok) {
          draggedTodoRef.current = null;
          return;
        }
      }
      const evCollab =
        workspaceMode === 'team' && teamOwnerEmail
          ? effectiveTodoOwnerEmail(todo, teamOwnerEmail)
          : undefined;
      const newEvent: CalendarEvent = {
        id: `event-${Date.now()}`,
        title: todo.text,
        color: todo.color === '#FFFFFF' ? '#9CA3AF' : todo.color,
        startDate: dateStr,
        sourceTodoId: todo.id,
        startTime: time || undefined,
        endTime: time ? getEndTime(time) : undefined,
        reminderMinutes: time ? [50, 45, 40, 35, 30, 25, 20, 15, 10, 5] : undefined,
        updatedAt: Date.now(),
        ...(evCollab !== undefined ? { collabOwnerEmail: evCollab } : {}),
      };
      setEvents(prev => [...prev, newEvent]);

      // If a day-scope todo is rescheduled by drag-and-drop, move its owner date
      // so it appears only in the target day list.
      if (todo.scopeType === 'day') {
        const y = Number(dateStr.slice(0, 4));
        setTodos(prev =>
          prev.map(t =>
            t.id === todo.id
              ? {
                  ...t,
                  date: dateStr,
                  month: Number(dateStr.slice(5, 7)),
                  scopeYear: Number.isFinite(y) ? y : t.scopeYear,
                  updatedAt: Date.now(),
                }
              : t
          )
        );
      }

      // Increase repeat counter when a todo is scheduled on calendar.
      setTodos(prev =>
        prev.map(t =>
          t.id === todo.id ? { ...t, count: (t.count ?? 0) + 1, updatedAt: Date.now() } : t
        )
      );

      draggedTodoRef.current = null;
    }
  }, [workspaceMode, activeTeamId, teamPeerAccess, accountEmail, teamOwnerEmail]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Set or clear event time on day timeline.
  const handleMoveEvent = useCallback((eventId: string, newTime?: string) => {
    const ev0 = eventsRef.current.find((e) => e.id === eventId);
    if (!ev0) return;
    const todoMap = new Map(todosRef.current.map((t) => [t.id, t]));
    if (
      workspaceMode === 'team' &&
      activeTeamId &&
      teamPeerAccess === 'peerReadAllWriteOwn' &&
      accountEmail &&
      teamOwnerEmail &&
      normCollabEmail(accountEmail) !== normCollabEmail(teamOwnerEmail)
    ) {
      const o = effectiveEventOwnerEmail(ev0, todoMap, teamOwnerEmail);
      if (o !== normCollabEmail(accountEmail)) return;
    }
    if (isPeerEventInTeam(workspaceMode, accountEmail, teamOwnerEmail, ev0, todoMap)) {
      const ok = window.confirm(
        '这是队友名下的日程（日历上已用点赞图标标记）。确定要调整时间或拖动到无时间区域吗？此操作会参与协作同步，请谨慎确认。'
      );
      if (!ok) return;
    }
    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        if (!newTime) {
          return { ...ev, startTime: undefined, endTime: undefined, updatedAt: Date.now() };
        }
        const [h, m] = newTime.split(':').map(Number);
        const endH = h + 1;
        const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        return { ...ev, startTime: newTime, endTime, updatedAt: Date.now() };
      })
    );
  }, [workspaceMode, activeTeamId, teamPeerAccess, accountEmail, teamOwnerEmail]);

  const handleToggleComplete = useCallback((eventId: string) => {
    const event = eventsRef.current.find(ev => ev.id === eventId);
    if (!event) return;

    const todoMap = new Map(todosRef.current.map((t) => [t.id, t]));
    if (
      workspaceMode === 'team' &&
      activeTeamId &&
      teamPeerAccess === 'peerReadAllWriteOwn' &&
      accountEmail &&
      teamOwnerEmail &&
      normCollabEmail(accountEmail) !== normCollabEmail(teamOwnerEmail)
    ) {
      const o = effectiveEventOwnerEmail(event, todoMap, teamOwnerEmail);
      if (o !== normCollabEmail(accountEmail)) return;
    }

    if (isPeerEventInTeam(workspaceMode, accountEmail, teamOwnerEmail, event, todoMap)) {
      const ok = window.confirm(
        '这是队友名下的日程。确定要切换完成/未完成吗？此操作会参与协作同步，请谨慎确认。'
      );
      if (!ok) return;
    }

    const newCompleted = !event.completed;
    const todoId = event.sourceTodoId;

    setEvents(prev =>
      prev.map(ev =>
        ev.id === eventId ? { ...ev, completed: newCompleted, updatedAt: Date.now() } : ev
      )
    );

    if (todoId) {
      if (newCompleted) {
        // Task completed: decrease counter.
        setTodos(prev =>
          prev.map(t =>
            t.id === todoId ? { ...t, count: Math.max(0, (t.count ?? 0) - 1), updatedAt: Date.now() } : t
          )
        );
      } else {
        // Task un-completed: increase counter.
        setTodos(prev => {
          const existing = prev.find(t => t.id === todoId);
          if (existing) {
            return prev.map(t =>
              t.id === todoId ? { ...t, count: (t.count ?? 0) + 1, updatedAt: Date.now() } : t
            );
          }
          const todoMap = new Map(prev.map((t) => [t.id, t]));
          const ownerEm =
            workspaceMode === 'team' && teamOwnerEmail
              ? effectiveEventOwnerEmail(event, todoMap, teamOwnerEmail)
              : undefined;
          return [...prev, {
            id: todoId,
            text: event.title,
            color: event.color === '#9CA3AF' ? '#FFFFFF' : event.color,
            category: inferCategoryFromColor(event.color),
            month: monthRef.current,
            count: 1,
            updatedAt: Date.now(),
            ...(ownerEm !== undefined ? { collabOwnerEmail: ownerEm } : {}),
          }];
        });
      }
    }
  }, [workspaceMode, teamOwnerEmail, teamPeerAccess, activeTeamId, accountEmail]);

  const handleMonthSelect = (selectedMonth: number) => {
    setCurrentDate(new Date(year, selectedMonth - 1, 1));
    setShowMonthPicker(false);
  };

  const handleYearSelect = (selectedYear: number) => {
    const d = new Date(currentDate);
    d.setFullYear(selectedYear);
    const dim = new Date(selectedYear, d.getMonth() + 1, 0).getDate();
    if (d.getDate() > dim) d.setDate(dim);
    setCurrentDate(d);
    setShowYearPicker(false);
  };

  const handleDayCellClick = useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(y, m - 1, d));
    setViewType('today');
  }, []);

  const handleSearchJumpToDate = useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(y, m - 1, d));
    setViewType('today');
    setShowGlobalSearch(false);
  }, []);

  const handleAddSearchResultToTodayPlan = useCallback((title: string) => {
    const today = new Date();
    const todayKey = toDateKey(today);

    const confirmed = window.confirm(`确认将“${title}”加入今日计划吗？`);
    if (!confirmed) return;

    const hasDuplicateToday = todosRef.current.some(
      (todo) => todo.scopeType === 'day' && todo.date === todayKey && todo.text === title
    );
    if (hasDuplicateToday) {
      const continueAdd = window.confirm('今日计划中已存在同名任务，是否仍然继续添加？');
      if (!continueAdd) return;
    }

    const collab =
      workspaceMode === 'team' && accountEmail ? normCollabEmail(accountEmail) : undefined;
    setTodos((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: title,
        category: 'work',
        color: categoryColorMap.work,
        month: today.getMonth() + 1,
        date: todayKey,
        scopeType: 'day',
        count: null,
        updatedAt: Date.now(),
        ...(collab !== undefined ? { collabOwnerEmail: collab } : {}),
      },
    ]);
    setCurrentDate(today);
    setViewType('today');
  }, [workspaceMode, accountEmail]);

  const handleUpdateTodo = useCallback((todoId: string, text: string, category: TodoCategory) => {
    if (
      workspaceMode === 'team' &&
      activeTeamId &&
      teamPeerAccess === 'peerReadAllWriteOwn' &&
      accountEmail &&
      teamOwnerEmail &&
      normCollabEmail(accountEmail) !== normCollabEmail(teamOwnerEmail)
    ) {
      const t = todosRef.current.find((x) => x.id === todoId);
      if (t && effectiveTodoOwnerEmail(t, teamOwnerEmail) !== normCollabEmail(accountEmail)) {
        return;
      }
    }
    const nextColor = categoryColorMap[category];
    setTodos((prev) =>
      prev.map((todo) => (todo.id === todoId ? { ...todo, text, category, color: nextColor, updatedAt: Date.now() } : todo))
    );
    setEvents((prev) =>
      prev.map((event) =>
        event.sourceTodoId === todoId ? { ...event, title: text, color: nextColor, updatedAt: Date.now() } : event
      )
    );
  }, [workspaceMode, activeTeamId, teamPeerAccess, accountEmail, teamOwnerEmail]);

  const handleDeleteTodo = useCallback((todoId: string) => {
    if (
      workspaceMode === 'team' &&
      activeTeamId &&
      teamPeerAccess === 'peerReadAllWriteOwn' &&
      accountEmail &&
      teamOwnerEmail &&
      normCollabEmail(accountEmail) !== normCollabEmail(teamOwnerEmail)
    ) {
      const t = todosRef.current.find((x) => x.id === todoId);
      if (t && effectiveTodoOwnerEmail(t, teamOwnerEmail) !== normCollabEmail(accountEmail)) {
        return;
      }
    }
    const localTodo = todosRef.current.find((todo) => todo.id === todoId);
    const localTodoUpdatedAt = localTodo ? readTodoUpdatedAt(localTodo) : 0;
    const tombstoneAt = Math.max(Date.now(), localTodoUpdatedAt + 1);
    const deletedEventIds = eventsRef.current
      .filter((event) => event.sourceTodoId === todoId)
      .map((event) => event.id);
    setTodos((prev) => prev.filter((todo) => todo.id !== todoId));
    setTodoTombstones((prev) => ({ ...prev, [todoId]: tombstoneAt }));
    if (deletedEventIds.length > 0) {
      setEventTombstones((prev) => {
        const next = { ...prev };
        deletedEventIds.forEach((eventId) => {
          next[eventId] = tombstoneAt;
        });
        return next;
      });
    }
    setEvents((prev) => prev.filter((event) => event.sourceTodoId !== todoId));
  }, [workspaceMode, activeTeamId, teamPeerAccess, accountEmail, teamOwnerEmail]);

  const handleResetLocalData = useCallback(() => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('确定要清空本地数据并恢复默认数据吗？');
    if (!confirmed) return;

    window.localStorage.removeItem(STORAGE_KEY);
    setCurrentDate(new Date(2024, 9, 15));
    setViewType('month');
    const normalizedDefaults = normalizeTodoColorsByCategory(defaultTodos);
    setTodos(normalizedDefaults);
    setTodoTombstones({});
    setEvents(normalizeEventColorsBySourceTodo(defaultEvents, normalizedDefaults));
    setEventTombstones({});
    setNotesByDate({});
    setNoteOwnerByDate({});
    setNoteMetaByDate({});
    setNoteTombstonesByDate({});
    setShowMonthPicker(false);
  }, []);

  const handleExportData = useCallback(() => {
    if (typeof window === 'undefined') return;
    const payload = createPersistedPayload(
      todos,
      todoTombstones,
      events,
      eventTombstones,
      currentDate,
      viewType,
      notesByDate,
      noteOwnerByDate,
      noteMetaByDate,
      noteTombstonesByDate
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `todo-calendar-backup-${toDateKey(new Date())}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }, [todos, todoTombstones, events, eventTombstones, currentDate, viewType, notesByDate, noteOwnerByDate, noteMetaByDate, noteTombstonesByDate]);

  const handleImportData = useCallback(async (file: File) => {
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as PersistedData;

      const validViewType =
        parsed.viewType === 'today' ||
        parsed.viewType === 'week' ||
        parsed.viewType === 'month' ||
        parsed.viewType === 'year';
      const validDate = typeof parsed.currentDate === 'string' && !Number.isNaN(new Date(parsed.currentDate).getTime());
      const validTodos = Array.isArray(parsed.todos);
      const validEvents = Array.isArray(parsed.events);
      if (!validViewType || !validDate || !validTodos || !validEvents) {
        window.alert('导入失败：文件格式不正确。');
        return;
      }

      const normalizedTodos = normalizeTodoColorsByCategory(parsed.todos);
      setTodos(normalizedTodos);
      setTodoTombstones(parsed.todoTombstones ?? {});
      setEvents(normalizeEventColorsBySourceTodo(parsed.events, normalizedTodos));
      setEventTombstones(parsed.eventTombstones ?? {});
      setCurrentDate(new Date(parsed.currentDate));
      setViewType(parsed.viewType);
      setNotesByDate(parsed.notesByDate ?? {});
      setNoteOwnerByDate(parsed.noteOwnerByDate ?? {});
      setNoteMetaByDate(parsed.noteMetaByDate ?? {});
      setNoteTombstonesByDate(parsed.noteTombstonesByDate ?? {});
      setShowMonthPicker(false);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      window.alert('导入成功。');
    } catch {
      window.alert('导入失败：无法解析文件。');
    }
  }, []);

  const handleSaveNote = useCallback((dateKey: string, note: string) => {
    const normalizedMe = normCollabEmail(accountEmail);
    const normalizedOwner = normCollabEmail(teamOwnerEmail);
    const isTeamPeerRestricted =
      workspaceMode === 'team' &&
      !!activeTeamId &&
      teamPeerAccess !== 'bothPush' &&
      !!normalizedMe &&
      !!normalizedOwner &&
      normalizedMe !== normalizedOwner;
    if (isTeamPeerRestricted) {
      const noteOwner = normCollabEmail(noteOwnerByDate[dateKey] ?? teamOwnerEmail);
      if (noteOwner && noteOwner !== normalizedMe) {
        window.alert('这是队友笔记，当前权限下仅可查看，不能修改。');
        return;
      }
    }
    const now = Date.now();
    const finalOwner =
      workspaceMode === 'team' && normalizedMe
        ? normalizedMe
        : normCollabEmail(noteOwnerByDate[dateKey]);
    setNotesByDate((prev) => {
      const trimmed = note.trim();
      if (!trimmed) {
        const rest = { ...prev };
        delete rest[dateKey];
        return rest;
      }
      return { ...prev, [dateKey]: note };
    });
    setNoteOwnerByDate((prev) => {
      if (!note.trim()) {
        // 协作区删除本人笔记时保留 owner，避免切回个人云时无法识别本人删除墓碑。
        if (workspaceMode === 'team' && normalizedMe) {
          if (prev[dateKey] === normalizedMe) return prev;
          return { ...prev, [dateKey]: normalizedMe };
        }
        if (!(dateKey in prev)) return prev;
        const next = { ...prev };
        delete next[dateKey];
        return next;
      }
      if (!finalOwner) return prev;
      return { ...prev, [dateKey]: finalOwner };
    });
    setNoteMetaByDate((prev) => ({ ...prev, [dateKey]: now }));
    if (note.trim()) {
      setNoteTombstonesByDate((prev) => {
        if (!(dateKey in prev)) return prev;
        const next = { ...prev };
        delete next[dateKey];
        return next;
      });
    } else {
      setNoteTombstonesByDate((prev) => ({ ...prev, [dateKey]: now }));
    }
  }, [accountEmail, teamOwnerEmail, workspaceMode, activeTeamId, teamPeerAccess, noteOwnerByDate]);

  const handleTestNotification = useCallback(async () => {
    try {
      let granted = false;
      try {
        granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
      } catch {
        if (typeof Notification !== 'undefined') {
          granted = Notification.permission === 'granted';
          if (!granted) {
            const permission = await Notification.requestPermission();
            granted = permission === 'granted';
          }
        }
      }

      if (!granted) {
        window.alert('通知权限未开启，请先允许通知。');
        return;
      }

      try {
        await sendNotification({
          title: '通知测试',
          body: '如果你看到这条消息，提醒功能链路正常。',
        });
      } catch {
        if (typeof Notification !== 'undefined') {
          new Notification('通知测试', {
            body: '如果你看到这条消息，提醒功能链路正常。',
          });
        }
      }
    } catch {
      window.alert('测试通知发送失败，请检查系统通知设置。');
    }
  }, []);

  // Header label based on view
  const headerLabel = (() => {
    if (viewType === 'today') {
      return `${year}年${month}月${currentDate.getDate()}日`;
    }
    if (viewType === 'week') {
      const weekDays = getWeekDays(new Date(currentDate));
      const start = weekDays[0];
      const end = weekDays[6];
      return `${start.fullDate.slice(0, 4)}年${start.fullDate.slice(5, 7)}月${start.date}日 - ${end.fullDate.slice(5, 7)}月${end.date}日`;
    }
    if (viewType === 'year') {
      return `${year}年`;
    }
    return `${year}年${month}月`;
  })();

  // Month / year picker only for corresponding view
  const showMonthDropdown = viewType === 'month';
  const showYearDropdown = viewType === 'year';

  // Days for month view
  const days = getMonthDays(year, month);

  // Todo filtering based on view
  const getFilteredTodos = (): TodoItem[] => {
    const isInRange = (startDate: string, endDate: string, rangeStart: string, rangeEnd: string) =>
      !(endDate < rangeStart || startDate > rangeEnd);

    const getViewRange = () => {
      if (viewType === 'today') {
        const dayKey = toDateKey(currentDate);
        return { start: dayKey, end: dayKey };
      }

      if (viewType === 'week') {
        const weekDays = getWeekDays(new Date(currentDate));
        return { start: weekDays[0].fullDate, end: weekDays[6].fullDate };
      }

      if (viewType === 'year') {
        return { start: `${year}-01-01`, end: `${year}-12-31` };
      }

      const monthStart = toDateKey(new Date(year, month - 1, 1));
      const monthEnd = toDateKey(new Date(year, month, 0));
      return { start: monthStart, end: monthEnd };
    };

    const { start, end } = getViewRange();
    const todosWithEventsInRange = new Set(
      events
        .filter((event) => {
          const eventEnd = event.endDate || event.startDate;
          return !!event.sourceTodoId && isInRange(event.startDate, eventEnd, start, end);
        })
        .map((event) => event.sourceTodoId as string)
    );

    return todos.filter((todo) => {
      const scopeType = resolveTodoScopeType(todo);
      const byScope = (() => {
        if (scopeType === 'day') {
          return !!todo.date && todo.date >= start && todo.date <= end;
        }
        if (scopeType === 'week') {
          const weekStart = todo.scopeStart ?? todo.date;
          if (!weekStart) return false;
          const weekEnd = addDays(weekStart, 6);
          return isInRange(weekStart, weekEnd, start, end);
        }
        if (scopeType === 'year') {
          return todo.scopeYear === year;
        }
        // month
        const monthMatches = todo.month === month;
        const yearMatches = todo.scopeYear === undefined || todo.scopeYear === year;
        if (viewType === 'month') {
          return monthMatches && yearMatches;
        }
        if (viewType === 'year') {
          return todo.scopeYear === year;
        }
        return false;
      })();

      const byScheduledEvent = todosWithEventsInRange.has(todo.id);
      return byScope || byScheduledEvent;
    });
  };

  const filteredTodos = getFilteredTodos();
  const currentDateKey = toDateKey(currentDate);
  const normalizedMe = normCollabEmail(accountEmail);
  const currentNoteOwnerEmail = normCollabEmail(noteOwnerByDate[currentDateKey] ?? teamOwnerEmail);
  const canEditPeerNote =
    workspaceMode === 'team' && !!activeTeamId && teamPeerAccess === 'bothPush';
  const isPeerNoteForCurrentDate =
    workspaceMode === 'team' &&
    !!accountEmail &&
    !!teamOwnerEmail &&
    currentNoteOwnerEmail !== normalizedMe;

  const applyAccountSnapshot = useCallback((snapshot: unknown) => {
    if (!isPersistedDataLike(snapshot)) {
      throw new Error('云端快照格式无效，无法应用到本地');
    }

    const nextDate = new Date(snapshot.currentDate);
    if (Number.isNaN(nextDate.getTime())) {
      throw new Error('云端快照中的日期无效');
    }

    const merged = mergeTodoRecords(
      todosRef.current,
      todoTombstones,
      snapshot.todos,
      snapshot.todoTombstones ?? {}
    );
    const mergedEvents = mergeEventRecords(
      eventsRef.current,
      eventTombstones,
      snapshot.events,
      snapshot.eventTombstones ?? {}
    );
    const mergedNotes = mergeNoteRecords(
      notesByDate,
      noteOwnerByDate,
      noteMetaByDate,
      noteTombstonesByDate,
      snapshot.notesByDate ?? {},
      snapshot.noteOwnerByDate ?? {},
      snapshot.noteMetaByDate ?? {},
      snapshot.noteTombstonesByDate ?? {}
    );
    const normalizedTodos = normalizeTodoColorsByCategory(merged.todos);
    setTodos(normalizedTodos);
    setTodoTombstones(merged.tombstones);
    if (merged.fieldMergeCount > 0 || merged.conflictCount > 0) {
      const parts: string[] = [];
      if (merged.fieldMergeCount > 0) parts.push(`自动合并 ${merged.fieldMergeCount} 条`);
      if (merged.conflictCount > 0) parts.push(`冲突保留较新 ${merged.conflictCount} 条`);
      setTodoMergeHint(parts.join('，'));
    } else {
      setTodoMergeHint('');
    }
    if (mergedEvents.fieldMergeCount > 0 || mergedEvents.conflictCount > 0) {
      const parts: string[] = [];
      if (mergedEvents.fieldMergeCount > 0) parts.push(`事件自动合并 ${mergedEvents.fieldMergeCount} 条`);
      if (mergedEvents.conflictCount > 0) parts.push(`事件冲突保留较新 ${mergedEvents.conflictCount} 条`);
      setEventMergeHint(parts.join('，'));
    } else {
      setEventMergeHint('');
    }
    if (mergedNotes.mergeCount > 0) {
      setNoteMergeHint(`备注自动合并 ${mergedNotes.mergeCount} 条`);
    } else {
      setNoteMergeHint('');
    }
    setEvents(normalizeEventColorsBySourceTodo(mergedEvents.events, normalizedTodos));
    setEventTombstones(mergedEvents.tombstones);
    setCurrentDate(nextDate);
    setViewType(snapshot.viewType);
    setNotesByDate(mergedNotes.notesByDate);
    setNoteOwnerByDate(mergedNotes.noteOwnerByDate);
    setNoteMetaByDate(mergedNotes.noteMetaByDate);
    setNoteTombstonesByDate(mergedNotes.noteTombstonesByDate);
  }, [eventTombstones, noteMetaByDate, noteOwnerByDate, noteTombstonesByDate, notesByDate, todoTombstones]);

  /** 切回个人云时用：以个人云快照为准覆盖本地，避免与协作区内存状态合并导致队友数据残留进 user_snapshots */
  const applyPersonalSnapshotReplace = useCallback((snapshot: unknown) => {
    if (!isPersistedDataLike(snapshot)) {
      throw new Error('云端快照格式无效，无法应用到本地');
    }
    const nextDate = new Date(snapshot.currentDate);
    if (Number.isNaN(nextDate.getTime())) {
      throw new Error('云端快照中的日期无效');
    }
    const normalizedTodos = normalizeTodoColorsByCategory(snapshot.todos);
    const normalizedEvents = normalizeEventColorsBySourceTodo(snapshot.events, normalizedTodos);
    setTodos(normalizedTodos);
    setTodoTombstones(snapshot.todoTombstones ?? {});
    setEvents(normalizedEvents);
    setEventTombstones(snapshot.eventTombstones ?? {});
    setCurrentDate(nextDate);
    setViewType(snapshot.viewType);
    setNotesByDate(snapshot.notesByDate ?? {});
    setNoteOwnerByDate(snapshot.noteOwnerByDate ?? {});
    setNoteMetaByDate(snapshot.noteMetaByDate ?? {});
    setNoteTombstonesByDate(snapshot.noteTombstonesByDate ?? {});
    setTodoMergeHint('');
    setEventMergeHint('');
    setNoteMergeHint('');
  }, []);

  const applyTeamCloudSnapshot = useCallback(
    (teamId: string, snapshot: unknown, version: number) => {
      updateTeamBaseVersion(teamId, version);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(teamFirstPullDoneKey(teamId), '1');
      }
      if (snapshot != null && isPersistedDataLike(snapshot)) {
        try {
          teamServerBaselineRef.current = JSON.parse(JSON.stringify(snapshot)) as PersistedData;
        } catch {
          teamServerBaselineRef.current = null;
        }
        applyAccountSnapshot(snapshot);
      } else {
        teamServerBaselineRef.current = null;
      }
    },
    [applyAccountSnapshot, updateTeamBaseVersion]
  );

  const switchToTeamWorkspace = useCallback(
    async (teamId: string) => {
      if (!businessToken) throw new Error('请先登录');
      const tid = teamId.trim();
      if (!tid) throw new Error('teamId 无效');
      try {
        await pushSnapshot(businessToken, getAccountSnapshot());
      } catch (e) {
        if (!(e instanceof AccountSyncConflictError)) {
          console.warn('[workspace] 切到协作前个人云推送失败', e);
        }
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(WORKSPACE_MODE_KEY, 'team');
        window.localStorage.setItem(ACTIVE_TEAM_ID_KEY, tid);
      }
      setWorkspaceMode('team');
      setActiveTeamId(tid);
      const res = await authApi.teamPull(businessToken, tid);
      const ver = typeof res.data?.version === 'number' ? res.data.version : 0;
      setTeamPeerAccess(normalizeTeamPeerAccess(res.data?.peerAccess, res.data?.peerReadOnly));
      setTeamOwnerEmail(
        typeof res.data?.ownerEmail === 'string' ? res.data.ownerEmail.trim().toLowerCase() : null
      );
      applyTeamCloudSnapshot(tid, res.data?.snapshot ?? null, ver);
    },
    [applyTeamCloudSnapshot, businessToken, getAccountSnapshot, pushSnapshot]
  );

  const switchToPersonalWorkspace = useCallback(
    async (opts?: { skipTeamFlush?: boolean }) => {
    const wasTeam = workspaceMode === 'team';
    const capturedTeamOwnerEmail = teamOwnerEmail;
    const capturedTodos = todos;
    const capturedEvents = events;
    const capturedNotesByDate = notesByDate;
    const capturedNoteOwnerByDate = noteOwnerByDate;
    const capturedNoteMetaByDate = noteMetaByDate;
    const capturedNoteTombstonesByDate = noteTombstonesByDate;

    if (!opts?.skipTeamFlush && workspaceMode === 'team' && businessToken && activeTeamId) {
      const canFlushTeam =
        teamPeerAccess !== 'peerReadOnly' ||
        (accountEmail &&
          teamOwnerEmail &&
          accountEmail.trim().toLowerCase() === teamOwnerEmail.trim().toLowerCase());
      if (canFlushTeam) {
        try {
          const resPush = await authApi.teamPush(businessToken, activeTeamId, getTeamPushSnapshot(), {
            baseVersion: teamBaseVersionRef.current,
            deviceId,
            platform: 'web',
          });
          const v = resPush.data?.version;
          if (typeof v === 'number') updateTeamBaseVersion(activeTeamId, v);
        } catch (e) {
          if (e instanceof AccountSyncConflictError) {
            const ok = window.confirm(
              '协作空间云端版本已变，若切回个人，未与队友对齐的本地改动可能丢失。确定仍切回个人空间吗？'
            );
            if (!ok) return;
          } else {
            throw e;
          }
        }
      }
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_MODE_KEY, 'personal');
      window.localStorage.removeItem(ACTIVE_TEAM_ID_KEY);
    }
    setWorkspaceMode('personal');
    setActiveTeamId(null);
    setTeamBaseVersion(0);
    if (businessToken) {
      const res = await pullSnapshot(businessToken);
      const snap = res.data?.snapshot;
      if (snap != null && isPersistedDataLike(snap)) {
        const canMergeTeamMine =
          wasTeam &&
          !!accountEmail &&
          !!capturedTeamOwnerEmail &&
          normCollabEmail(capturedTeamOwnerEmail).length > 0;
        if (canMergeTeamMine) {
          const slice = buildMyCollaborationSliceForPersonalMerge(
            capturedTeamOwnerEmail,
            accountEmail,
            capturedTodos,
            capturedEvents,
            capturedNotesByDate,
            capturedNoteOwnerByDate,
            capturedNoteMetaByDate,
            capturedNoteTombstonesByDate
          );
          const mergedTodo = mergeTodoRecords(
            snap.todos,
            snap.todoTombstones ?? {},
            slice.myTodos,
            {}
          );
          const mergedEv = mergeEventRecords(
            snap.events,
            snap.eventTombstones ?? {},
            slice.myEvents,
            {}
          );
          const mergedNotes = mergeNoteRecords(
            snap.notesByDate ?? {},
            snap.noteOwnerByDate ?? {},
            snap.noteMetaByDate ?? {},
            snap.noteTombstonesByDate ?? {},
            slice.myNotesByDate,
            slice.myNoteOwnerByDate,
            slice.myNoteMetaByDate,
            slice.myNoteTombstonesByDate
          );
          let nextDate = new Date(snap.currentDate);
          if (Number.isNaN(nextDate.getTime())) {
            nextDate = new Date();
          }
          applyPersonalSnapshotReplace(
            createPersistedPayload(
              mergedTodo.todos,
              mergedTodo.tombstones,
              mergedEv.events,
              mergedEv.tombstones,
              nextDate,
              snap.viewType,
              mergedNotes.notesByDate,
              mergedNotes.noteOwnerByDate,
              mergedNotes.noteMetaByDate,
              mergedNotes.noteTombstonesByDate
            )
          );
        } else {
          applyPersonalSnapshotReplace(snap);
        }
      } else {
        applyPersonalSnapshotReplace(
          createPersistedPayload([], {}, [], {}, new Date(), 'month', {}, {}, {}, {})
        );
      }
      const pv = typeof res.data?.version === 'number' ? res.data.version : 0;
      updateBaseVersion(pv);
    }
  },
    [
    activeTeamId,
    applyPersonalSnapshotReplace,
    accountEmail,
    businessToken,
    deviceId,
    events,
    getTeamPushSnapshot,
    noteMetaByDate,
    noteOwnerByDate,
    noteTombstonesByDate,
    notesByDate,
    pullSnapshot,
    todos,
    updateBaseVersion,
    updateTeamBaseVersion,
    workspaceMode,
    teamPeerAccess,
    teamOwnerEmail,
  ]
  );

  const syncTeamWorkspaceMeta = useCallback((meta: { peerAccess: TeamPeerAccess; ownerEmail: string | null }) => {
    setTeamPeerAccess(meta.peerAccess);
    setTeamOwnerEmail(meta.ownerEmail ? meta.ownerEmail.trim().toLowerCase() : null);
  }, []);

  const handleAfterLogout = useCallback(
    (opts: { clearLocalCalendar: boolean }) => {
      if (typeof window === 'undefined' || !opts.clearLocalCalendar) return;

      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(FIRST_PULL_DONE_KEY);
      window.localStorage.removeItem(ACCOUNT_LAST_PULL_AT_KEY);
      window.localStorage.removeItem(ACCOUNT_LAST_PUSH_AT_KEY);
      updateBaseVersion(0);

      window.localStorage.setItem(WORKSPACE_MODE_KEY, 'personal');
      window.localStorage.removeItem(ACTIVE_TEAM_ID_KEY);
      removeLocalStorageKeysByPrefix(['todo-calendar-team-base-', 'todo-calendar-team-first-pull-']);

      teamServerBaselineRef.current = null;
      setWorkspaceMode('personal');
      setActiveTeamId(null);
      setTeamBaseVersion(0);
      setTeamPeerAccess('bothPush');
      setTeamOwnerEmail(null);

      setCurrentDate(new Date(2024, 9, 15));
      setViewType('month');
      const normalizedDefaults = normalizeTodoColorsByCategory(defaultTodos);
      setTodos(normalizedDefaults);
      setTodoTombstones({});
      setEvents(normalizeEventColorsBySourceTodo(defaultEvents, normalizedDefaults));
      setEventTombstones({});
      setNotesByDate({});
      setNoteOwnerByDate({});
      setNoteMetaByDate({});
      setNoteTombstonesByDate({});
      setShowMonthPicker(false);
      setTodoMergeHint('');
      setEventMergeHint('');
      setNoteMergeHint('');
      setAccountSyncRuntime('未登录');
    },
    [updateBaseVersion]
  );

  const onTeamPushedVersion = useCallback(
    (teamId: string, v: number) => {
      updateTeamBaseVersion(teamId, v);
    },
    [updateTeamBaseVersion]
  );

  const { theme, toggleTheme } = useAppTheme();

  return (
    <div className="h-screen w-screen bg-[var(--shell-bg)] flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        {/* Left: Navigation */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--shell-surface-hover)] transition-colors duration-200"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--shell-icon)]" />
            </button>
            <button
              onClick={handleNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--shell-surface-hover)] transition-colors duration-200"
            >
              <ChevronRight className="w-5 h-5 text-[var(--shell-icon)]" />
            </button>
          </div>
          <div className="relative">
            {showMonthDropdown ? (
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
                className="flex items-center gap-1 text-xl font-semibold text-[var(--shell-text-strong)] hover:text-[var(--shell-accent)] transition-colors"
              >
                {headerLabel}
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : showYearDropdown ? (
              <button
                type="button"
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
                className="flex items-center gap-1 text-xl font-semibold text-[var(--shell-text-strong)] hover:text-[var(--shell-accent)] transition-colors"
              >
                {headerLabel}
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <span className="text-xl font-semibold text-[var(--shell-text-strong)]">{headerLabel}</span>
            )}
            {showMonthPicker && showMonthDropdown && (
              <div className="absolute top-full left-0 mt-2 bg-[var(--shell-panel)] border border-[var(--shell-border-subtle)] rounded-xl shadow-xl z-50 p-3 w-64">
                <div className="text-sm font-medium text-[var(--shell-text-muted)] mb-2">{year}年</div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMonthSelect(m)}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${m === month
                          ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]'
                          : 'text-[var(--shell-text-strong)] hover:bg-[var(--shell-surface-hover)]'
                        }
                      `}
                    >
                      {m}月
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showYearPicker && showYearDropdown && (
              <div className="absolute top-full left-0 mt-2 bg-[var(--shell-panel)] border border-[var(--shell-border-subtle)] rounded-xl shadow-xl z-50 p-3 w-72 max-h-72 overflow-y-auto">
                <div className="text-sm font-medium text-[var(--shell-text-muted)] mb-2">选择年份</div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 24 }, (_, i) => year - 10 + i).map((yOpt) => (
                    <button
                      key={yOpt}
                      type="button"
                      onClick={() => handleYearSelect(yOpt)}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${yOpt === year
                          ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]'
                          : 'text-[var(--shell-text-strong)] hover:bg-[var(--shell-surface-hover)]'
                        }
                      `}
                    >
                      {yOpt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: View Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors duration-200"
            title={theme === 'dark' ? '切换为浅色暖色主题' : '切换为深色主题'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowGlobalSearch(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors duration-200 flex items-center gap-1"
            title="全局搜索（Ctrl+K / ⌘K）"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          <span
            className="text-xs text-[var(--shell-text-muted)] max-w-[min(28rem,40vw)] truncate"
            title={accountSyncRuntime}
          >
            {accountSyncRuntime}
          </span>
          {todoMergeHint ? <span className="text-xs text-[var(--shell-accent)]">{todoMergeHint}</span> : null}
          {eventMergeHint ? <span className="text-xs text-[var(--shell-accent)]">{eventMergeHint}</span> : null}
          {noteMergeHint ? <span className="text-xs text-[var(--shell-accent)]">{noteMergeHint}</span> : null}
          <button
            type="button"
            onClick={handleToday}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'today'
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)] bg-transparent'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }
            `}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMonthPicker(false);
              setShowYearPicker(false);
              setViewType('week');
            }}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'week'
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)] bg-transparent'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }
            `}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMonthPicker(false);
              setShowYearPicker(false);
              setViewType('month');
            }}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'month'
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)] bg-transparent'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }
            `}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMonthPicker(false);
              setShowYearPicker(false);
              setViewType('year');
            }}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'year'
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)] bg-transparent'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }
            `}
          >
            Year
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        <TodoSidebar
          todos={todos}
          viewType={viewType}
          currentDate={currentDate}
          filteredTodos={filteredTodos}
          onDragStart={handleDragStart}
          onAddTodo={(text, category) =>
            setTodos(prev => {
              const currentDateKey = toDateKey(currentDate);
              const currentWeekStart = getWeekDays(new Date(currentDate))[0].fullDate;
              const scopeType: TodoScopeType =
                viewType === 'today'
                  ? 'day'
                  : viewType === 'week'
                    ? 'week'
                    : viewType === 'year'
                      ? 'year'
                      : 'month';
              const collab =
                workspaceMode === 'team' && accountEmail ? normCollabEmail(accountEmail) : undefined;

              return [
                ...prev,
                {
                  id: Date.now().toString(),
                  text,
                  category,
                  color: categoryColorMap[category],
                  month,
                  date: scopeType === 'day' ? currentDateKey : undefined,
                  scopeType,
                  scopeStart: scopeType === 'week' ? currentWeekStart : undefined,
                  scopeYear: scopeType === 'month' || scopeType === 'year' ? year : undefined,
                  count: null,
                  updatedAt: Date.now(),
                  ...(collab !== undefined ? { collabOwnerEmail: collab } : {}),
                },
              ];
            })
          }
          onUpdateTodo={handleUpdateTodo}
          onDeleteTodo={handleDeleteTodo}
          onResetLocalData={handleResetLocalData}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onTestNotification={handleTestNotification}
          noteDateKey={currentDateKey}
          noteContent={notesByDate[currentDateKey] ?? ''}
          noteOwnerEmail={currentNoteOwnerEmail || null}
          isPeerNote={isPeerNoteForCurrentDate}
          canEditPeerNote={canEditPeerNote}
          onSaveNote={handleSaveNote}
          workspaceMode={workspaceMode}
          accountEmail={accountEmail}
          teamOwnerEmail={teamOwnerEmail}
          onOpenSettings={() => setShowAccountLogin(true)}
        />

        {viewType === 'month' && (
          <CalendarGrid
            days={days}
            events={events}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => {}}
            onToggleComplete={handleToggleComplete}
            onDayClick={handleDayCellClick}
            notesByDate={notesByDate}
            todos={todos}
            workspaceMode={workspaceMode}
            accountEmail={accountEmail}
            teamOwnerEmail={teamOwnerEmail}
          />
        )}

        {viewType === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onToggleComplete={handleToggleComplete}
            onDayClick={handleDayCellClick}
            notesByDate={notesByDate}
            todos={todos}
            workspaceMode={workspaceMode}
            accountEmail={accountEmail}
            teamOwnerEmail={teamOwnerEmail}
          />
        )}

        {viewType === 'today' && (
          <DayView
            currentDate={currentDate}
            events={events}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onToggleComplete={handleToggleComplete}
            onMoveEvent={handleMoveEvent}
            notesByDate={notesByDate}
            todos={todos}
            workspaceMode={workspaceMode}
            accountEmail={accountEmail}
            teamOwnerEmail={teamOwnerEmail}
          />
        )}

        {viewType === 'year' && (
          <YearView
            year={year}
            events={events}
            onPickMonth={(m) => {
              setCurrentDate(new Date(year, m - 1, 1));
              setViewType('month');
              setShowYearPicker(false);
              setShowMonthPicker(false);
            }}
          />
        )}
      </div>

      {/* Click outside to close month / year picker */}
      {(showMonthPicker || showYearPicker) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowMonthPicker(false);
            setShowYearPicker(false);
          }}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearchPanel
          events={events}
          todos={todos}
          notesByDate={notesByDate}
          workspaceMode={workspaceMode}
          accountEmail={accountEmail}
          teamOwnerEmail={teamOwnerEmail}
          noteOwnerByDate={noteOwnerByDate}
          onClose={() => setShowGlobalSearch(false)}
          onJumpToDate={handleSearchJumpToDate}
          onAddToTodayPlan={handleAddSearchResultToTodayPlan}
        />
      )}

      <AccountLoginModal
        open={showAccountLogin}
        onClose={() => setShowAccountLogin(false)}
        onPullSnapshot={applyAccountSnapshot}
        onPushSnapshot={getTeamPushSnapshot}
        onRuntimeStatusChange={setAccountSyncRuntime}
        workspaceMode={workspaceMode}
        activeTeamId={activeTeamId}
        teamBaseVersion={teamBaseVersion}
        onSwitchToTeamWorkspace={switchToTeamWorkspace}
        onSwitchToPersonalWorkspace={switchToPersonalWorkspace}
        onTeamCloudPulled={applyTeamCloudSnapshot}
        onTeamPushedVersion={onTeamPushedVersion}
        teamPeerAccess={teamPeerAccess}
        teamOwnerEmail={teamOwnerEmail}
        onTeamWorkspaceMeta={syncTeamWorkspaceMeta}
        onAfterLogout={handleAfterLogout}
      />
    </div>
  );
}
