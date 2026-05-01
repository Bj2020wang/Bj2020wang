import type { CalendarEvent, TodoItem, ViewType } from '@/types';

export type TeamPeerAccess = 'bothPush' | 'peerReadOnly' | 'peerReadAllWriteOwn';

/** 与 App 持久化快照一致的最小形状（用于协作推送合并） */
export interface TeamPersistedSnapshot {
  todos: TodoItem[];
  todoTombstones?: Record<string, number>;
  events: CalendarEvent[];
  eventTombstones?: Record<string, number>;
  currentDate: string;
  viewType: ViewType;
  notesByDate: Record<string, string>;
  noteOwnerByDate?: Record<string, string>;
  noteMetaByDate?: Record<string, number>;
  noteTombstonesByDate?: Record<string, number>;
  eventsByDate?: Record<string, string[]>;
  updatedAt?: number;
}

export function normCollabEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function normalizeTeamPeerAccess(peerAccess: unknown, peerReadOnly?: boolean): TeamPeerAccess {
  const p = typeof peerAccess === 'string' ? peerAccess.trim() : '';
  if (p === 'bothPush' || p === 'peerReadOnly' || p === 'peerReadAllWriteOwn') return p;
  if (peerReadOnly === true) return 'peerReadOnly';
  return 'bothPush';
}

/** 未标 collabOwnerEmail 的 Todo 视为创建者（owner）的任务 */
export function effectiveTodoOwnerEmail(todo: TodoItem, teamOwnerEmail: string): string {
  const o = todo.collabOwnerEmail;
  if (typeof o === 'string' && normCollabEmail(o)) return normCollabEmail(o);
  return normCollabEmail(teamOwnerEmail);
}

export function effectiveEventOwnerEmail(
  event: CalendarEvent,
  todoById: Map<string, TodoItem>,
  teamOwnerEmail: string
): string {
  if (event.sourceTodoId) {
    const t = todoById.get(event.sourceTodoId);
    if (t) return effectiveTodoOwnerEmail(t, teamOwnerEmail);
  }
  const o = event.collabOwnerEmail;
  if (typeof o === 'string' && normCollabEmail(o)) return normCollabEmail(o);
  return normCollabEmail(teamOwnerEmail);
}

/** 协作区内：该项归属队友（非当前登录邮箱）时用于 UI 区分，避免与本人任务混淆 */
export function isPeerTodoInTeam(
  workspaceMode: 'personal' | 'team',
  accountEmail: string | null | undefined,
  teamOwnerEmail: string | null | undefined,
  todo: TodoItem
): boolean {
  if (workspaceMode !== 'team' || !teamOwnerEmail || !accountEmail) return false;
  return effectiveTodoOwnerEmail(todo, teamOwnerEmail) !== normCollabEmail(accountEmail);
}

/** 日程块：节假日等系统事件不标队友；其余按归属邮箱判断 */
export function isPeerEventInTeam(
  workspaceMode: 'personal' | 'team',
  accountEmail: string | null | undefined,
  teamOwnerEmail: string | null | undefined,
  event: CalendarEvent,
  todoById: Map<string, TodoItem>
): boolean {
  if (event.id.startsWith('holiday-')) return false;
  if (workspaceMode !== 'team' || !teamOwnerEmail || !accountEmail) return false;
  return effectiveEventOwnerEmail(event, todoById, teamOwnerEmail) !== normCollabEmail(accountEmail);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function buildEventsByDate(events: CalendarEvent[]): Record<string, string[]> {
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
}

/**
 * 队友在 peerReadAllWriteOwn 下组装推送快照：非本人 Todo/事件/笔记与基线一致。
 */
export function buildWriteOwnTeamSnapshot(
  local: TeamPersistedSnapshot,
  baseline: TeamPersistedSnapshot,
  writerEmail: string,
  teamOwnerEmail: string
): TeamPersistedSnapshot {
  const w = normCollabEmail(writerEmail);

  const baseTodos = Array.isArray(baseline.todos) ? baseline.todos : [];
  const locTodos = Array.isArray(local.todos) ? local.todos : [];
  const baseTodoMap = new Map(baseTodos.map((t) => [t.id, t]));
  const locTodoMap = new Map(locTodos.map((t) => [t.id, t]));
  const baseTombs =
    baseline.todoTombstones && typeof baseline.todoTombstones === 'object' ? baseline.todoTombstones : {};
  const locTombs = local.todoTombstones && typeof local.todoTombstones === 'object' ? local.todoTombstones : {};

  const allTodoIds = new Set<string>([...baseTodoMap.keys(), ...locTodoMap.keys()]);
  const mergedTombs: Record<string, number> = {};
  const mergedTodoList: TodoItem[] = [];

  for (const id of allTodoIds) {
    const baseT = baseTodoMap.get(id);
    const locT = locTodoMap.get(id);
    const ownerForId = baseT
      ? effectiveTodoOwnerEmail(baseT, teamOwnerEmail)
      : locT
        ? effectiveTodoOwnerEmail(locT, teamOwnerEmail)
        : w;

    if (ownerForId === w) {
      if (locT) mergedTodoList.push(locT);
      const lt = locTombs[id];
      if (typeof lt === 'number' && Number.isFinite(lt)) mergedTombs[id] = lt;
    } else {
      if (baseT) mergedTodoList.push(baseT);
      const bt = baseTombs[id];
      if (typeof bt === 'number' && Number.isFinite(bt)) mergedTombs[id] = bt;
    }
  }

  const tombKeys = new Set(Object.keys(mergedTombs));
  const todosOut = mergedTodoList.filter((t) => !tombKeys.has(t.id));

  const todoByIdForEvents = new Map<string, TodoItem>();
  todosOut.forEach((t) => todoByIdForEvents.set(t.id, t));

  const baseEvMap = new Map((Array.isArray(baseline.events) ? baseline.events : []).map((e) => [e.id, e]));
  const locEvMap = new Map((Array.isArray(local.events) ? local.events : []).map((e) => [e.id, e]));
  const baseEvTombs =
    baseline.eventTombstones && typeof baseline.eventTombstones === 'object' ? baseline.eventTombstones : {};
  const locEvTombs = local.eventTombstones && typeof local.eventTombstones === 'object' ? local.eventTombstones : {};

  const resolveTodo = (id: string): TodoItem | undefined => baseTodoMap.get(id) ?? locTodoMap.get(id);

  const eventOwner = (e: CalendarEvent): string => {
    if (e.sourceTodoId) {
      const t = resolveTodo(e.sourceTodoId);
      if (t) return effectiveTodoOwnerEmail(t, teamOwnerEmail);
    }
    return effectiveEventOwnerEmail(e, todoByIdForEvents, teamOwnerEmail);
  };

  const allEventIds = new Set<string>([...baseEvMap.keys(), ...locEvMap.keys()]);
  const mergedEvTombs: Record<string, number> = {};
  const mergedEvents: CalendarEvent[] = [];

  for (const id of allEventIds) {
    const baseE = baseEvMap.get(id);
    const locE = locEvMap.get(id);
    const ev = locE ?? baseE;
    if (!ev) continue;
    const o = eventOwner(ev);

    if (o === w) {
      const lt = locEvTombs[id];
      if (typeof lt === 'number' && Number.isFinite(lt) && !locE) {
        mergedEvTombs[id] = lt;
      } else if (locE) {
        mergedEvents.push(locE);
      } else if (baseE) {
        mergedEvents.push(baseE);
      }
    } else {
      if (baseE) mergedEvents.push(baseE);
      const bt = baseEvTombs[id];
      if (typeof bt === 'number' && Number.isFinite(bt)) mergedEvTombs[id] = bt;
    }
  }

  const evTombKeys = new Set(Object.keys(mergedEvTombs));
  const eventsOut = mergedEvents.filter((e) => !evTombKeys.has(e.id));

  const baseNotes = baseline.notesByDate && typeof baseline.notesByDate === 'object' ? baseline.notesByDate : {};
  const locNotes = local.notesByDate && typeof local.notesByDate === 'object' ? local.notesByDate : {};
  const baseNoteOwners =
    baseline.noteOwnerByDate && typeof baseline.noteOwnerByDate === 'object' ? baseline.noteOwnerByDate : {};
  const locNoteOwners =
    local.noteOwnerByDate && typeof local.noteOwnerByDate === 'object' ? local.noteOwnerByDate : {};
  const baseNoteMeta =
    baseline.noteMetaByDate && typeof baseline.noteMetaByDate === 'object' ? baseline.noteMetaByDate : {};
  const locNoteMeta = local.noteMetaByDate && typeof local.noteMetaByDate === 'object' ? local.noteMetaByDate : {};
  const baseNoteTombs =
    baseline.noteTombstonesByDate && typeof baseline.noteTombstonesByDate === 'object'
      ? baseline.noteTombstonesByDate
      : {};
  const locNoteTombs =
    local.noteTombstonesByDate && typeof local.noteTombstonesByDate === 'object'
      ? local.noteTombstonesByDate
      : {};
  const allNoteDates = new Set<string>([
    ...Object.keys(baseNotes),
    ...Object.keys(locNotes),
    ...Object.keys(baseNoteOwners),
    ...Object.keys(locNoteOwners),
    ...Object.keys(baseNoteMeta),
    ...Object.keys(locNoteMeta),
    ...Object.keys(baseNoteTombs),
    ...Object.keys(locNoteTombs),
  ]);
  const notesOut: Record<string, string> = {};
  const noteOwnerOut: Record<string, string> = {};
  const noteMetaOut: Record<string, number> = {};
  const noteTombOut: Record<string, number> = {};

  for (const dateKey of allNoteDates) {
    const baseOwner = normCollabEmail(baseNoteOwners[dateKey] ?? teamOwnerEmail);
    const locOwner = normCollabEmail(locNoteOwners[dateKey] ?? baseOwner);
    const ownerForDate = baseOwner || locOwner || normCollabEmail(teamOwnerEmail);
    const chooseLocal = ownerForDate === w;
    const chosenText = chooseLocal ? locNotes[dateKey] ?? '' : baseNotes[dateKey] ?? '';
    const chosenMeta = chooseLocal ? locNoteMeta[dateKey] : baseNoteMeta[dateKey];
    const chosenTomb = chooseLocal ? locNoteTombs[dateKey] : baseNoteTombs[dateKey];

    if (typeof chosenMeta === 'number' && Number.isFinite(chosenMeta)) noteMetaOut[dateKey] = chosenMeta;
    if (typeof chosenTomb === 'number' && Number.isFinite(chosenTomb)) noteTombOut[dateKey] = chosenTomb;
    if (typeof chosenText === 'string' && chosenText.trim()) notesOut[dateKey] = chosenText;
    if (ownerForDate) noteOwnerOut[dateKey] = ownerForDate;
  }

  return {
    todos: todosOut,
    todoTombstones: mergedTombs,
    events: eventsOut,
    eventTombstones: mergedEvTombs,
    currentDate: local.currentDate,
    viewType: local.viewType,
    eventsByDate: buildEventsByDate(eventsOut),
    notesByDate: notesOut,
    noteOwnerByDate: noteOwnerOut,
    noteMetaByDate: noteMetaOut,
    noteTombstonesByDate: noteTombOut,
    updatedAt: Date.now(),
  };
}
