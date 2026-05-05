import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripHorizontal, Search, X } from 'lucide-react';
import type { CalendarEvent, TodoCategory, TodoItem } from '@/types';
import { isPeerEventInTeam, isPeerTodoInTeam, normCollabEmail } from '@/lib/teamCollab';

interface GlobalSearchPanelProps {
  events: CalendarEvent[];
  todos: TodoItem[];
  notesByDate: Record<string, string>;
  onClose: () => void;
  onJumpToDate: (dateStr: string) => void;
  /** 嵌入左侧 Todo 栏：不占满屏，由父级提供尺寸 */
  embedded?: boolean;
  /** 协作云下用于「只看我的 / 含队友」 */
  workspaceMode?: 'personal' | 'team';
  accountEmail?: string | null;
  teamOwnerEmail?: string | null;
  noteOwnerByDate?: Record<string, string>;
}

function SearchPanelShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] shadow-lg">
        {children}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex h-[min(92dvh,52rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] shadow-2xl sm:h-[min(88vh,44rem)] sm:max-w-xl sm:rounded-2xl">
        {children}
      </div>
    </div>
  );
}

type SearchResultKind = 'event' | 'todo' | 'note';

interface SearchResultItem {
  id: string;
  kind: SearchResultKind;
  title: string;
  detail?: string;
  date: string | null;
  time?: string;
  completed: boolean;
  category?: TodoCategory;
}

type CompletionFilter = 'all' | 'incomplete' | 'complete';
/** 不限 | 周（横向选周）| 月（年 + 1–12 月）| 年（选全年） */
type DateFilterMode = 'all' | 'week' | 'month' | 'year';

const WEEK_OFFSET_MIN = -26;
const WEEK_OFFSET_MAX = 26;

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  work: '工作',
  life: '生活',
  study: '学习',
  health: '健康',
};

/** 筛选区 / 结果区分隔：可拖动调节高度（按嵌入 / 弹层分别记忆） */
const FILTER_SPLIT_STORAGE_KEY = 'global-search-filter-pane-px-v1';
const FILTER_SPLIT_MIN_FILTER_PX = 100;
const FILTER_SPLIT_MIN_RESULTS_PX = 88;
/** 桌面弹层：细条即可；embedded（移动端整页搜索）需留出布局占位 */
const FILTER_SPLITTER_HIT_PX_DESKTOP = 12;
const FILTER_SPLITTER_HIT_PX_EMBEDDED = 52;
/** 移动端嵌入搜索：两侧按钮单次调节幅度（px） */
const EMBEDDED_SPLIT_NUDGE_PX = 56;

function loadFilterPaneHeight(embedded: boolean): number {
  const fallback = embedded ? 168 : 224;
  try {
    const raw = window.localStorage.getItem(FILTER_SPLIT_STORAGE_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as { embedded?: unknown; modal?: unknown };
    const v = embedded ? o.embedded : o.modal;
    if (typeof v === 'number' && Number.isFinite(v) && v >= FILTER_SPLIT_MIN_FILTER_PX) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveFilterPaneHeight(embedded: boolean, px: number) {
  try {
    const raw = window.localStorage.getItem(FILTER_SPLIT_STORAGE_KEY);
    const o: { embedded?: number; modal?: number } = raw ? JSON.parse(raw) : {};
    if (embedded) o.embedded = px;
    else o.modal = px;
    window.localStorage.setItem(FILTER_SPLIT_STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** 周一开始的一周；weekOffset=0 为「本周」 */
function getWeekBoundsFromOffset(weekOffset: number, now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(y, m, d + mondayOffset);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function getMonthBounds(year: number, month1to12: number): { start: string; end: string } {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function getYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function computeSearchRangeBounds(
  mode: DateFilterMode,
  weekOffset: number,
  monthYear: { year: number; month: number },
  filterYear: number
): { start: string; end: string } | null {
  if (mode === 'all') return null;
  if (mode === 'week') return getWeekBoundsFromOffset(weekOffset);
  if (mode === 'month') return getMonthBounds(monthYear.year, monthYear.month);
  return getYearBounds(filterYear);
}

function formatWeekScrollLabel(weekOffset: number, now = new Date()): string {
  const { start, end } = getWeekBoundsFromOffset(weekOffset, now);
  if (weekOffset === 0) return '本周';
  if (weekOffset === -1) return '上周';
  if (weekOffset === 1) return '下周';
  const sm = start.slice(5).replace('-', '/');
  const em = end.slice(5).replace('-', '/');
  return `${sm}～${em}`;
}

function buildYearOptions(now = new Date()): number[] {
  const cy = now.getFullYear();
  const years: number[] = [];
  for (let y = cy - 15; y <= cy + 8; y++) years.push(y);
  return years;
}

function dateKeyInRange(dateKey: string | null, bounds: { start: string; end: string } | null): boolean {
  if (!bounds) return true;
  if (!dateKey) return false;
  return dateKey >= bounds.start && dateKey <= bounds.end;
}

function linkedEventsForTodo(todoId: string, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.sourceTodoId === todoId);
}

function todoCalendarCompleted(todoId: string, events: CalendarEvent[]): boolean {
  const linked = linkedEventsForTodo(todoId, events);
  if (linked.length === 0) return false;
  return linked.every((e) => e.completed);
}

function todoPrimaryDateAndTime(
  todo: TodoItem,
  events: CalendarEvent[]
): { dateKey: string | null; time?: string } {
  if (todo.date) return { dateKey: todo.date, time: linkedEventsForTodo(todo.id, events)[0]?.startTime };
  const linked = linkedEventsForTodo(todo.id, events);
  if (linked.length === 0) return { dateKey: null };
  const sorted = [...linked].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const first = sorted[0];
  return { dateKey: first.startDate, time: first.startTime };
}

function noteExcerpt(body: string, maxLen = 72): string {
  const line = body.trim().split(/\r?\n/)[0] ?? '';
  const t = line.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

/** 单行展示：围绕首次命中关键词截取，便于与全局高亮一致 */
function formatSearchResultDateTime(item: SearchResultItem): string {
  if (!item.date) return '未排期';
  return item.time ? `${item.date} ${item.time}` : item.date;
}

function noteSnippetAroundKeyword(body: string, keyword: string, maxLen = 96): string {
  const q = keyword.trim();
  if (!q) return noteExcerpt(body, maxLen);
  const flat = body.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const lowerFlat = flat.toLowerCase();
  const idx = lowerFlat.indexOf(q.toLowerCase());
  if (idx < 0) return noteExcerpt(body, maxLen);

  const margin = 36;
  const start = Math.max(0, idx - margin);
  let end = Math.min(flat.length, idx + q.length + margin);
  if (end - start > maxLen) {
    end = Math.min(flat.length, start + maxLen);
  }
  let snippet = flat.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < flat.length) snippet = `${snippet}…`;
  return snippet;
}

export default function GlobalSearchPanel({
  events,
  todos,
  notesByDate,
  onClose,
  onJumpToDate,
  embedded = false,
  workspaceMode = 'personal',
  accountEmail = null,
  teamOwnerEmail = null,
  noteOwnerByDate = {},
}: GlobalSearchPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [collabResultScope, setCollabResultScope] = useState<'all' | 'mine'>('all');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthPicker, setMonthPicker] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [yearPicker, setYearPicker] = useState(() => new Date().getFullYear());
  const [includeEvents, setIncludeEvents] = useState(true);
  const [includeTodos, setIncludeTodos] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [todoCategoryFilter, setTodoCategoryFilter] = useState<'all' | TodoCategory>('all');
  const [filterPaneHeightPx, setFilterPaneHeightPx] = useState(() => loadFilterPaneHeight(embedded));

  const searchInputRef = useRef<HTMLInputElement>(null);
  const splitRootRef = useRef<HTMLDivElement>(null);
  const weekStripRef = useRef<HTMLDivElement>(null);
  const monthStripRef = useRef<HTMLDivElement>(null);
  const monthYearStripRef = useRef<HTMLDivElement>(null);
  const yearStripRef = useRef<HTMLDivElement>(null);

  const splitterHitPx = embedded ? FILTER_SPLITTER_HIT_PX_EMBEDDED : FILTER_SPLITTER_HIT_PX_DESKTOP;

  const rangeBounds = useMemo(
    () => computeSearchRangeBounds(dateFilterMode, weekOffset, monthPicker, yearPicker),
    [dateFilterMode, weekOffset, monthPicker, yearPicker]
  );

  const weekOffsetOptions = useMemo(() => {
    const list: number[] = [];
    for (let o = WEEK_OFFSET_MIN; o <= WEEK_OFFSET_MAX; o++) list.push(o);
    return list;
  }, []);

  const yearOptions = useMemo(() => buildYearOptions(), []);

  const dateFilterSummary = useMemo(() => {
    const now = new Date();
    if (dateFilterMode === 'all') return '不限';
    if (dateFilterMode === 'week') {
      const { start, end } = getWeekBoundsFromOffset(weekOffset, now);
      const tag =
        weekOffset === 0 ? '本周' : weekOffset === -1 ? '上周' : weekOffset === 1 ? '下周' : formatWeekScrollLabel(weekOffset, now);
      return `${tag}（${start}～${end}）`;
    }
    if (dateFilterMode === 'month') return `${monthPicker.year}年${monthPicker.month}月`;
    return `${yearPicker}年`;
  }, [dateFilterMode, weekOffset, monthPicker.year, monthPicker.month, yearPicker]);

  const searchContextLabel = useMemo(() => {
    if (dateFilterMode === 'month') return `${monthPicker.year}年${monthPicker.month}月`;
    return dateFilterSummary;
  }, [dateFilterMode, dateFilterSummary, monthPicker.year, monthPicker.month]);

  const searchPlaceholder = useMemo(() => {
    if (dateFilterMode === 'month') return `在${monthPicker.year}年${monthPicker.month}月中搜索…`;
    if (dateFilterMode === 'week') {
      const now = new Date();
      const tag =
        weekOffset === 0 ? '本周' : weekOffset === -1 ? '上周' : weekOffset === 1 ? '下周' : formatWeekScrollLabel(weekOffset, now);
      return `在${tag}中搜索…`;
    }
    if (dateFilterMode === 'year') return `在${yearPicker}年中搜索…`;
    return '搜索日程、任务与笔记…';
  }, [dateFilterMode, monthPicker.year, monthPicker.month, weekOffset, yearPicker]);

  useEffect(() => {
    setFilterPaneHeightPx(loadFilterPaneHeight(embedded));
  }, [embedded]);

  useEffect(() => {
    const root = splitRootRef.current;
    if (!root) return;
    const clamp = () => {
      const total = root.getBoundingClientRect().height;
      const maxFilter = Math.max(
        FILTER_SPLIT_MIN_FILTER_PX,
        total - FILTER_SPLIT_MIN_RESULTS_PX - splitterHitPx
      );
      setFilterPaneHeightPx((h) =>
        Math.min(Math.max(h, FILTER_SPLIT_MIN_FILTER_PX), maxFilter)
      );
    };
    const ro = new ResizeObserver(clamp);
    ro.observe(root);
    clamp();
    return () => ro.disconnect();
  }, [splitterHitPx]);

  useEffect(() => {
    if (dateFilterMode !== 'week' || !weekStripRef.current) return;
    const el = weekStripRef.current.querySelector('[data-week-selected="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dateFilterMode, weekOffset]);

  useEffect(() => {
    if (dateFilterMode !== 'month' || !monthYearStripRef.current) return;
    const el = monthYearStripRef.current.querySelector('[data-month-year-selected="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dateFilterMode, monthPicker.year]);

  useEffect(() => {
    if (dateFilterMode !== 'month' || !monthStripRef.current) return;
    const el = monthStripRef.current.querySelector('[data-month-selected="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dateFilterMode, monthPicker.month]);

  useEffect(() => {
    if (dateFilterMode !== 'year' || !yearStripRef.current) return;
    const el = yearStripRef.current.querySelector('[data-year-selected="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dateFilterMode, yearPicker]);

  const showCollabSearchFilters =
    workspaceMode === 'team' && !!normCollabEmail(accountEmail) && !!normCollabEmail(teamOwnerEmail);

  const renderHighlightedTitle = (title: string) => {
    const q = keyword.trim();
    if (!q) return title;

    const matcher = new RegExp(`(${escapeRegExp(q)})`, 'ig');
    const parts = title.split(matcher);
    if (parts.length <= 1) return title;

    return (
      <>
        {parts.map((part, index) => {
          if (part.toLowerCase() === q.toLowerCase()) {
            return (
              <mark key={`${part}-${index}`} className="rounded px-0.5 bg-[var(--shell-mark-bg)] text-[var(--shell-mark-text)]">
                {part}
              </mark>
            );
          }
          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </>
    );
  };

  const results = useMemo<SearchResultItem[]>(() => {
    const completionOk = (completed: boolean, kind: SearchResultKind): boolean => {
      if (kind === 'note') return true;
      if (completionFilter === 'all') return true;
      if (completionFilter === 'incomplete') return !completed;
      return completed;
    };

    const q = keyword.trim().toLowerCase();
    const kwOriginal = keyword.trim();
    if (!q) return [];

    const todoById = new Map(todos.map((t) => [t.id, t]));
    const scopeForFilter = workspaceMode === 'team' ? collabResultScope : 'all';
    const mineOnly =
      workspaceMode === 'team' &&
      scopeForFilter === 'mine' &&
      !!normCollabEmail(accountEmail) &&
      !!normCollabEmail(teamOwnerEmail ?? '');

    const out: SearchResultItem[] = [];
    const eventIdsAdded = new Set<string>();

    if (includeEvents) {
      for (const event of events) {
        if (!event.title.toLowerCase().includes(q)) continue;
        const completed = !!event.completed;
        if (!completionOk(completed, 'event')) continue;
        if (!dateKeyInRange(event.startDate, rangeBounds)) continue;
        if (mineOnly && isPeerEventInTeam(workspaceMode, accountEmail, teamOwnerEmail, event, todoById)) continue;
        out.push({
          id: `event-${event.id}`,
          kind: 'event',
          title: event.title,
          date: event.startDate,
          time: event.startTime,
          completed,
        });
        eventIdsAdded.add(event.id);
      }
    }

    if (includeTodos) {
      for (const todo of todos) {
        if (!todo.text.toLowerCase().includes(q)) continue;
        if (todoCategoryFilter !== 'all' && todo.category !== todoCategoryFilter) continue;

        const linked = linkedEventsForTodo(todo.id, events);
        const duplicateOfEventRow = linked.some((e) => eventIdsAdded.has(e.id) && e.title.toLowerCase().includes(q));
        if (duplicateOfEventRow) continue;

        const completed = todoCalendarCompleted(todo.id, events);
        if (!completionOk(completed, 'todo')) continue;

        const { dateKey, time } = todoPrimaryDateAndTime(todo, events);
        if (!dateKeyInRange(dateKey, rangeBounds)) continue;
        if (mineOnly && isPeerTodoInTeam(workspaceMode, accountEmail, teamOwnerEmail, todo)) continue;

        out.push({
          id: `todo-${todo.id}`,
          kind: 'todo',
          title: todo.text,
          detail: `${CATEGORY_LABEL[todo.category]}${dateKey ? '' : ' · 未排期'}`,
          date: dateKey,
          time,
          completed,
          category: todo.category,
        });
      }
    }

    if (includeNotes) {
      for (const [dateKey, raw] of Object.entries(notesByDate)) {
        if (!raw || !raw.toLowerCase().includes(q)) continue;
        if (!dateKeyInRange(dateKey, rangeBounds)) continue;
        if (mineOnly && teamOwnerEmail) {
          const noteOwner = normCollabEmail(noteOwnerByDate[dateKey] ?? teamOwnerEmail);
          if (noteOwner !== normCollabEmail(accountEmail)) continue;
        }
        out.push({
          id: `note-${dateKey}`,
          kind: 'note',
          title: noteSnippetAroundKeyword(raw, kwOriginal),
          detail: '当日笔记',
          date: dateKey,
          completed: false,
        });
      }
    }

    return out.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const rank = (k: SearchResultKind) => (k === 'event' ? 0 : k === 'todo' ? 1 : 2);
      if (a.kind !== b.kind) return rank(a.kind) - rank(b.kind);
      const ta = a.time ?? '99:99';
      const tb = b.time ?? '99:99';
      return ta < tb ? 1 : -1;
    });
  }, [
    events,
    todos,
    notesByDate,
    keyword,
    completionFilter,
    rangeBounds,
    includeEvents,
    includeTodos,
    includeNotes,
    todoCategoryFilter,
    workspaceMode,
    accountEmail,
    teamOwnerEmail,
    noteOwnerByDate,
    collabResultScope,
  ]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const chipBtn = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors md:text-xs ${
      active
        ? 'border-2 border-[var(--shell-accent)] text-[var(--shell-accent)] bg-[var(--shell-accent)]/12'
        : 'border border-[var(--shell-border-subtle)] text-[var(--shell-text-muted)] bg-[var(--shell-input-deep)]/80 hover:bg-[var(--shell-surface-hover)] hover:border-[var(--shell-border)]'
    }`;

  /** 任务分类：更窄的内边距，便于一行排布（窄屏可横滑） */
  const categoryChipBtn = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium transition-colors md:px-2.5 md:text-xs ${
      active
        ? 'border-2 border-[var(--shell-accent)] text-[var(--shell-accent)] bg-[var(--shell-accent)]/12'
        : 'border border-[var(--shell-border-subtle)] text-[var(--shell-text-muted)] bg-[var(--shell-input-deep)]/80 hover:bg-[var(--shell-surface-hover)] hover:border-[var(--shell-border)]'
    }`;

  const scrollRowClass =
    'flex gap-1 overflow-x-auto pb-1 pt-0.5 snap-x snap-mandatory scrollbar-thin [scrollbar-color:rgba(128,128,128,0.35)_transparent]';

  const setDateMode = (next: DateFilterMode) => {
    setDateFilterMode((prev) => {
      if (prev === next) return prev;
      const n = new Date();
      queueMicrotask(() => {
        if (next === 'week') setWeekOffset(0);
        if (next === 'month') setMonthPicker({ year: n.getFullYear(), month: n.getMonth() + 1 });
        if (next === 'year') setYearPicker(n.getFullYear());
      });
      return next;
    });
  };

  const stripChip = (active: boolean) =>
    `shrink-0 snap-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors md:text-xs ${
      active
        ? 'border-2 border-[var(--shell-accent)] text-[var(--shell-accent)] bg-[var(--shell-accent)]/12'
        : 'border border-[var(--shell-border-subtle)] text-[var(--shell-text-muted)] bg-[var(--shell-input-deep)]/80 hover:bg-[var(--shell-surface-hover)]'
    }`;

  const handleSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const root = splitRootRef.current;
      if (!root) return;
      const startY = e.clientY;
      const startH = filterPaneHeightPx;
      let currentH = startH;

      const maxFilterForTotal = (total: number) =>
        Math.max(FILTER_SPLIT_MIN_FILTER_PX, total - FILTER_SPLIT_MIN_RESULTS_PX - splitterHitPx);

      const onMove = (ev: PointerEvent) => {
        const total = root.getBoundingClientRect().height;
        const maxFilter = maxFilterForTotal(total);
        const dy = ev.clientY - startY;
        currentH = Math.min(maxFilter, Math.max(FILTER_SPLIT_MIN_FILTER_PX, startH + dy));
        setFilterPaneHeightPx(currentH);
      };

      const finish = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* released */
        }
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        document.body.style.removeProperty('touch-action');
        saveFilterPaneHeight(embedded, currentH);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
    },
    [embedded, filterPaneHeightPx, splitterHitPx]
  );

  const nudgeFilterHeight = useCallback(
    (delta: number) => {
      const root = splitRootRef.current;
      if (!root) return;
      const total = root.getBoundingClientRect().height;
      const maxFilter = Math.max(
        FILTER_SPLIT_MIN_FILTER_PX,
        total - FILTER_SPLIT_MIN_RESULTS_PX - splitterHitPx
      );
      setFilterPaneHeightPx((h) => {
        const next = Math.min(maxFilter, Math.max(FILTER_SPLIT_MIN_FILTER_PX, h + delta));
        saveFilterPaneHeight(embedded, next);
        return next;
      });
    },
    [embedded, splitterHitPx]
  );

  const filterInnerClass = embedded
    ? 'min-h-0 shrink-0 space-y-3 overflow-y-auto px-5 py-3'
    : 'min-h-0 shrink-0 space-y-3 overflow-y-auto px-5 py-4';

  return (
    <SearchPanelShell embedded={embedded}>
        <div className="flex shrink-0 items-start justify-between px-5 pb-2 pt-5">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--shell-text-strong)] md:text-2xl">搜索</h2>
            <p className="mt-1 text-base text-[var(--shell-text-muted)] md:text-sm">{searchContextLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] hover:text-[var(--shell-text-strong)]"
            title="关闭（Esc）"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div ref={splitRootRef} className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={filterInnerClass} style={{ height: filterPaneHeightPx }}>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shell-subtle)]"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-2xl border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)] py-3 pl-11 pr-4 text-base text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--shell-accent)]/25 md:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'complete', 'incomplete'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCompletionFilter(key)}
                className={chipBtn(completionFilter === key)}
              >
                {key === 'all' ? '全部' : key === 'complete' ? '已完成' : '未完成'}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] scrollbar-thin [scrollbar-color:rgba(128,128,128,0.35)_transparent]">
            <span className="shrink-0 text-sm text-[var(--shell-subtle)]">日期</span>
            {(['all', 'week', 'month', 'year'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateMode(key)}
                className={`shrink-0 whitespace-nowrap ${chipBtn(dateFilterMode === key)}`}
              >
                {key === 'all' ? '不限' : key === 'week' ? '周' : key === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>

          {dateFilterMode === 'week' && (
            <div className="space-y-1">
              <div className="text-sm text-[var(--shell-subtle)]">选择一周（横向滑动）· 周一至周日</div>
              <div ref={weekStripRef} className={scrollRowClass}>
                {weekOffsetOptions.map((o) => (
                  <button
                    key={o}
                    type="button"
                    data-week-selected={o === weekOffset ? 'true' : undefined}
                    onClick={() => setWeekOffset(o)}
                    className={stripChip(weekOffset === o)}
                  >
                    {formatWeekScrollLabel(o)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {dateFilterMode === 'month' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="text-sm text-[var(--shell-subtle)]">年份（横向滑动）</div>
                <div ref={monthYearStripRef} className={scrollRowClass}>
                  {yearOptions.map((y) => (
                    <button
                      key={y}
                      type="button"
                      data-month-year-selected={y === monthPicker.year ? 'true' : undefined}
                      onClick={() => setMonthPicker((prev) => ({ ...prev, year: y }))}
                      className={stripChip(monthPicker.year === y)}
                    >
                      {y}年
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-[var(--shell-subtle)]">月份（1–12 月）</div>
                <div ref={monthStripRef} className={scrollRowClass}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                    <button
                      key={mo}
                      type="button"
                      data-month-selected={mo === monthPicker.month ? 'true' : undefined}
                      onClick={() => setMonthPicker((prev) => ({ ...prev, month: mo }))}
                      className={stripChip(monthPicker.month === mo)}
                    >
                      {mo}月
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {dateFilterMode === 'year' && (
            <div className="space-y-1">
              <div className="text-sm text-[var(--shell-subtle)]">选择年份（横向滑动）</div>
              <div ref={yearStripRef} className={scrollRowClass}>
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-year-selected={y === yearPicker ? 'true' : undefined}
                    onClick={() => setYearPicker(y)}
                    className={stripChip(yearPicker === y)}
                  >
                    {y}年
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm text-[var(--shell-subtle)]">类型</span>
            <button type="button" onClick={() => setIncludeEvents((v) => !v)} className={chipBtn(includeEvents)}>
              日程
            </button>
            <button type="button" onClick={() => setIncludeTodos((v) => !v)} className={chipBtn(includeTodos)}>
              任务
            </button>
            <button type="button" onClick={() => setIncludeNotes((v) => !v)} className={chipBtn(includeNotes)}>
              笔记
            </button>
          </div>

          {showCollabSearchFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-sm text-[var(--shell-subtle)]">协作</span>
              <button
                type="button"
                onClick={() => setCollabResultScope('all')}
                className={chipBtn(collabResultScope === 'all')}
              >
                含队友
              </button>
              <button
                type="button"
                onClick={() => setCollabResultScope('mine')}
                className={chipBtn(collabResultScope === 'mine')}
              >
                只看我的
              </button>
            </div>
          )}

          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] scrollbar-thin [scrollbar-color:rgba(128,128,128,0.35)_transparent]">
            <span className="shrink-0 text-sm text-[var(--shell-subtle)]">任务</span>
            <button
              type="button"
              onClick={() => setTodoCategoryFilter('all')}
              className={categoryChipBtn(todoCategoryFilter === 'all')}
            >
              全部
            </button>
            {(Object.keys(CATEGORY_LABEL) as TodoCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setTodoCategoryFilter(cat)}
                className={categoryChipBtn(todoCategoryFilter === cat)}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>

        {embedded ? (
          <div
            role="group"
            tabIndex={0}
            aria-label={`筛选区高度约 ${Math.round(filterPaneHeightPx)} 像素；两侧按钮大步调整，中间横条可拖动`}
            className="relative z-10 flex shrink-0 items-center gap-2 border-y border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]/35"
            style={{ minHeight: splitterHitPx }}
            onKeyDown={(e) => {
              const step = 28;
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                nudgeFilterHeight(step);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                nudgeFilterHeight(-step);
              }
            }}
          >
            <button
              type="button"
              className="touch-manipulation flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] transition-colors active:bg-[var(--shell-surface-hover)]"
              aria-label="扩大下方结果列表区域"
              onClick={() => nudgeFilterHeight(-EMBEDDED_SPLIT_NUDGE_PX)}
            >
              <ChevronDown className="h-7 w-7" strokeWidth={2} aria-hidden />
            </button>
            <div
              className="flex h-[22px] min-h-[22px] min-w-0 flex-1 cursor-grab touch-none items-center justify-center self-center rounded-lg bg-[var(--shell-surface-hover)]/40 py-0 active:cursor-grabbing active:bg-[var(--shell-surface-hover)]/65"
              onPointerDown={handleSplitPointerDown}
            >
              <GripHorizontal className="h-4 w-10 text-[var(--shell-subtle)]" strokeWidth={2} aria-hidden />
            </div>
            <button
              type="button"
              className="touch-manipulation flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] transition-colors active:bg-[var(--shell-surface-hover)]"
              aria-label="扩大上方筛选条件区域"
              onClick={() => nudgeFilterHeight(EMBEDDED_SPLIT_NUDGE_PX)}
            >
              <ChevronUp className="h-7 w-7" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-valuemin={FILTER_SPLIT_MIN_FILTER_PX}
            aria-valuemax={900}
            aria-valuenow={Math.round(filterPaneHeightPx)}
            tabIndex={0}
            aria-label="拖动调节筛选区与结果区高度，上下方向键微调"
            className="group relative z-10 flex shrink-0 cursor-row-resize items-center justify-center border-y border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] outline-none hover:bg-[var(--shell-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]/35"
            style={{ height: splitterHitPx }}
            onPointerDown={handleSplitPointerDown}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                nudgeFilterHeight(-12);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                nudgeFilterHeight(12);
              }
            }}
          >
            <span
              className="pointer-events-none h-1 w-12 rounded-full bg-[var(--shell-border-subtle)] opacity-70 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">
          {!keyword.trim() && (
            <p className="py-10 text-center text-base text-[var(--shell-subtle)] md:text-sm">输入关键词搜索日程、任务与笔记</p>
          )}
          {!!keyword.trim() && results.length === 0 && (
            <p className="py-10 text-center text-base text-[var(--shell-subtle)] md:text-sm">没有命中结果，试试别的关键词或筛选</p>
          )}
          {!!keyword.trim() && results.length > 0 && (
            <p className="mb-3 text-base font-medium text-[var(--shell-text-strong)] md:text-sm">找到 {results.length} 个结果</p>
          )}
          <div className="space-y-2">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.date) onJumpToDate(item.date);
                }}
                disabled={!item.date}
                className={`flex w-full items-baseline justify-between gap-3 rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)]/40 px-3 py-2.5 text-left transition-colors ${
                  item.date ? 'hover:border-[var(--shell-accent)]/40 hover:bg-[var(--shell-list-hover)]' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-base font-medium leading-snug text-[var(--shell-text-strong)] md:text-sm">
                  {renderHighlightedTitle(item.title)}
                </span>
                <span className="shrink-0 tabular-nums text-sm text-[var(--shell-text-muted)] md:text-xs">
                  {formatSearchResultDateTime(item)}
                </span>
              </button>
            ))}
          </div>
        </div>
        </div>
    </SearchPanelShell>
  );
}
