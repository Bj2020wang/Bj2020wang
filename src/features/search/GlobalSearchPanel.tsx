import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Briefcase, Dumbbell, Heart, Search, X } from 'lucide-react';
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
/** 不限 | 按周（横向选周）| 按月（年 + 1–12 月）| 按年（选全年） */
type DateFilterMode = 'all' | 'week' | 'month' | 'year';

const WEEK_OFFSET_MIN = -26;
const WEEK_OFFSET_MAX = 26;

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  work: '工作',
  life: '生活',
  study: '学习',
  health: '健康',
};

const KIND_LABEL: Record<SearchResultKind, string> = {
  event: '日程',
  todo: '任务',
  note: '笔记',
};

const CATEGORY_STYLE: Record<
  TodoCategory,
  { label: string; icon: typeof Briefcase; chipClass: string }
> = {
  work: {
    label: '工作',
    icon: Briefcase,
    chipClass: 'bg-rose-500/15 text-rose-200 border-rose-500/35',
  },
  life: {
    label: '生活',
    icon: Heart,
    chipClass: 'bg-violet-500/15 text-violet-200 border-violet-500/35',
  },
  study: {
    label: '学习',
    icon: BookOpen,
    chipClass: 'bg-sky-500/15 text-sky-200 border-sky-500/35',
  },
  health: {
    label: '健康',
    icon: Dumbbell,
    chipClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35',
  },
};

const SAVED_QUERIES_KEY = 'global-search-saved-queries-v1';
const MAX_SAVED_QUERY_COUNT = 8;

/** 筛选区 / 结果区分隔：可拖动调节高度（按嵌入 / 弹层分别记忆） */
const FILTER_SPLIT_STORAGE_KEY = 'global-search-filter-pane-px-v1';
const FILTER_SPLIT_MIN_FILTER_PX = 100;
const FILTER_SPLIT_MIN_RESULTS_PX = 88;
const FILTER_SPLITTER_HIT_PX = 12;

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

function loadQueryStats(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(SAVED_QUERIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, number>>((acc, item) => {
        if (typeof item === 'string' && item.trim()) {
          acc[item.trim()] = 1;
        }
        return acc;
      }, {});
    }

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const normalized: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!key.trim()) continue;
        const count = Number(value);
        normalized[key] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
      }
      return normalized;
    }
    return {};
  } catch {
    return {};
  }
}

function persistQueryStats(stats: Record<string, number>) {
  window.localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(stats));
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
  const [queryStats, setQueryStats] = useState<Record<string, number>>(() => loadQueryStats());
  const [filterPaneHeightPx, setFilterPaneHeightPx] = useState(() => loadFilterPaneHeight(embedded));

  const searchInputRef = useRef<HTMLInputElement>(null);
  const splitRootRef = useRef<HTMLDivElement>(null);
  const weekStripRef = useRef<HTMLDivElement>(null);
  const monthStripRef = useRef<HTMLDivElement>(null);
  const monthYearStripRef = useRef<HTMLDivElement>(null);
  const yearStripRef = useRef<HTMLDivElement>(null);

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
        total - FILTER_SPLIT_MIN_RESULTS_PX - FILTER_SPLITTER_HIT_PX
      );
      setFilterPaneHeightPx((h) =>
        Math.min(Math.max(h, FILTER_SPLIT_MIN_FILTER_PX), maxFilter)
      );
    };
    const ro = new ResizeObserver(clamp);
    ro.observe(root);
    clamp();
    return () => ro.disconnect();
  }, []);

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

  const kindCounts = useMemo(() => {
    let event = 0;
    let todo = 0;
    let note = 0;
    for (const r of results) {
      if (r.kind === 'event') event += 1;
      else if (r.kind === 'todo') todo += 1;
      else note += 1;
    }
    return { event, todo, note };
  }, [results]);

  const resultStats = useMemo(() => {
    const schedulable = results.filter((item) => item.kind !== 'note');
    const total = schedulable.length;
    const incomplete = schedulable.filter((item) => !item.completed).length;
    const withTime = schedulable.filter((item) => !!item.time).length;
    const completed = total - incomplete;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total: results.length, schedulableTotal: total, incomplete, withTime, completionRate, notes: kindCounts.note };
  }, [results, kindCounts.note]);

  const monthlyDistribution = useMemo(() => {
    const monthCountMap: Record<string, number> = {};
    for (const item of results) {
      if (!item.date) continue;
      const monthKey = item.date.slice(0, 7);
      monthCountMap[monthKey] = (monthCountMap[monthKey] ?? 0) + 1;
    }
    return Object.entries(monthCountMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [results]);

  const topQueries = useMemo(() => {
    return Object.entries(queryStats)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], 'zh-CN');
      })
      .slice(0, MAX_SAVED_QUERY_COUNT)
      .map(([query]) => query);
  }, [queryStats]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const q = keyword.trim();
    if (!q) return;

    const timer = window.setTimeout(() => {
      setQueryStats((prev) => {
        const next: Record<string, number> = { ...prev, [q]: (prev[q] ?? 0) + 1 };
        persistQueryStats(next);
        return next;
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const completionLabel =
    completionFilter === 'all' ? '全部' : completionFilter === 'incomplete' ? '未完成' : '已完成';

  const handleExportCsv = () => {
    if (!keyword.trim() || results.length === 0) {
      window.alert('当前没有可导出的搜索结果，请先输入关键词并确保有命中结果。');
      return;
    }

    const escapeCsv = (value: string) => {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const now = new Date();
    const exportTime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const currentKeyword = keyword.trim();

    const rows = [
      ['类型', '标题', '日期', '时间', '完成状态', '关键词', '导出时间'],
      ...results.map((item) => [
        KIND_LABEL[item.kind],
        item.title,
        item.date ?? '—',
        item.time ?? '—',
        item.kind === 'note' ? '—' : item.completed ? '已完成' : '未完成',
        currentKeyword,
        exportTime,
      ]),
    ];
    const csvContent = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
    link.href = url;
    link.download = `global-search-${stamp}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportBriefTxt = () => {
    const q = keyword.trim();
    if (!q || results.length === 0) {
      window.alert('当前没有可导出的简报内容，请先输入关键词并确保有命中结果。');
      return;
    }

    const now = new Date();
    const exportTime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const monthlyText = monthlyDistribution.length
      ? monthlyDistribution.map(([month, count]) => `${month}: ${count}`).join('\n')
      : '暂无';
    const detailsText = results
      .map(
        (item, index) =>
          `${index + 1}. [${KIND_LABEL[item.kind]}] ${item.date ?? '未排期'} ${item.time ?? ''} | ${item.title} | ${
            item.kind === 'note' ? '笔记' : item.completed ? '已完成' : '未完成'
          }`
      )
      .join('\n');

    const brief = [
      `关键词查询简报`,
      `查询关键词：${q}`,
      `导出时间：${exportTime}`,
      `完成状态（日程/任务）：${completionLabel}`,
      `日期范围：${dateFilterSummary}`,
      `类型：日程${includeEvents ? '✓' : '×'} 任务${includeTodos ? '✓' : '×'} 笔记${includeNotes ? '✓' : '×'}`,
      `任务分类：${todoCategoryFilter === 'all' ? '全部' : CATEGORY_LABEL[todoCategoryFilter]}`,
      ...(showCollabSearchFilters
        ? [`协作结果：${collabResultScope === 'mine' ? '只看我的' : '含队友'}`]
        : []),
      ``,
      `一、命中分布`,
      `- 日程：${kindCounts.event} · 任务：${kindCounts.todo} · 笔记：${kindCounts.note}`,
      ``,
      `二、日程/任务统计`,
      `- 日程+任务条数：${resultStats.schedulableTotal}`,
      `- 未完成：${resultStats.incomplete}`,
      `- 完成率：${resultStats.completionRate}%`,
      `- 有具体时间：${resultStats.withTime}`,
      ``,
      `三、按月命中分布（最近 6 个月）`,
      monthlyText,
      ``,
      `四、结果明细（按时间倒序）`,
      detailsText,
      ``,
    ].join('\n');

    const blob = new Blob([`\uFEFF${brief}`], { type: 'text/plain;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
    link.href = url;
    link.download = `global-search-brief-${stamp}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleRemoveQuery = (query: string) => {
    setQueryStats((prev) => {
      const next = { ...prev };
      delete next[query];
      persistQueryStats(next);
      return next;
    });
  };

  const handleClearQueries = () => {
    const confirmed = window.confirm('确定清空所有常用关键词吗？');
    if (!confirmed) return;
    setQueryStats({});
    persistQueryStats({});
  };

  const chipBtn = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
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
    `shrink-0 snap-center whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
      active
        ? 'border-2 border-[var(--shell-accent)] text-[var(--shell-accent)] bg-[var(--shell-accent)]/12'
        : 'border border-[var(--shell-border-subtle)] text-[var(--shell-text-muted)] bg-[var(--shell-input-deep)]/80 hover:bg-[var(--shell-surface-hover)]'
    }`;

  const handleSplitMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const root = splitRootRef.current;
      if (!root) return;
      const startY = e.clientY;
      const startH = filterPaneHeightPx;
      let currentH = startH;

      const onMove = (ev: MouseEvent) => {
        const total = root.getBoundingClientRect().height;
        const maxFilter = Math.max(
          FILTER_SPLIT_MIN_FILTER_PX,
          total - FILTER_SPLIT_MIN_RESULTS_PX - FILTER_SPLITTER_HIT_PX
        );
        const dy = ev.clientY - startY;
        currentH = Math.min(maxFilter, Math.max(FILTER_SPLIT_MIN_FILTER_PX, startH + dy));
        setFilterPaneHeightPx(currentH);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        saveFilterPaneHeight(embedded, currentH);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [embedded, filterPaneHeightPx]
  );

  const nudgeFilterHeight = useCallback(
    (delta: number) => {
      const root = splitRootRef.current;
      if (!root) return;
      const total = root.getBoundingClientRect().height;
      const maxFilter = Math.max(
        FILTER_SPLIT_MIN_FILTER_PX,
        total - FILTER_SPLIT_MIN_RESULTS_PX - FILTER_SPLITTER_HIT_PX
      );
      setFilterPaneHeightPx((h) => {
        const next = Math.min(maxFilter, Math.max(FILTER_SPLIT_MIN_FILTER_PX, h + delta));
        saveFilterPaneHeight(embedded, next);
        return next;
      });
    },
    [embedded]
  );

  const filterInnerClass = embedded
    ? 'min-h-0 shrink-0 space-y-3 overflow-y-auto px-5 py-3'
    : 'min-h-0 shrink-0 space-y-3 overflow-y-auto px-5 py-4';

  return (
    <SearchPanelShell embedded={embedded}>
        <div className="flex shrink-0 items-start justify-between px-5 pb-2 pt-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--shell-text-strong)]">搜索</h2>
            <p className="mt-1 text-sm text-[var(--shell-text-muted)]">{searchContextLabel}</p>
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
              className="w-full rounded-2xl border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)] py-3 pl-11 pr-4 text-sm text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--shell-accent)]/25"
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-[11px] text-[var(--shell-subtle)]">日期</span>
            {(['all', 'week', 'month', 'year'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateMode(key)}
                className={chipBtn(dateFilterMode === key)}
              >
                {key === 'all' ? '不限' : key === 'week' ? '按周' : key === 'month' ? '按月' : '按年'}
              </button>
            ))}
          </div>

          {dateFilterMode === 'week' && (
            <div className="space-y-1">
              <div className="text-[11px] text-[var(--shell-subtle)]">选择一周（横向滑动）· 周一至周日</div>
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
                <div className="text-[11px] text-[var(--shell-subtle)]">年份（横向滑动）</div>
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
                <div className="text-[11px] text-[var(--shell-subtle)]">月份（1–12 月）</div>
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
              <div className="text-[11px] text-[var(--shell-subtle)]">选择年份（横向滑动）</div>
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
            <span className="shrink-0 text-[11px] text-[var(--shell-subtle)]">类型</span>
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
              <span className="shrink-0 text-[11px] text-[var(--shell-subtle)]">协作</span>
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

          <div className="space-y-2">
            <span className="text-[11px] text-[var(--shell-subtle)]">任务分类</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTodoCategoryFilter('all')}
                className={chipBtn(todoCategoryFilter === 'all')}
              >
                全部分类
              </button>
              {(Object.keys(CATEGORY_LABEL) as TodoCategory[]).map((cat) => {
                const meta = CATEGORY_STYLE[cat];
                const Icon = meta.icon;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTodoCategoryFilter(cat)}
                    className={`inline-flex items-center gap-1.5 ${chipBtn(todoCategoryFilter === cat)}`}
                  >
                    <Icon className="h-3.5 w-3.5 opacity-90" strokeWidth={2} aria-hidden />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-full border border-[var(--shell-border-subtle)] px-3 py-2 text-xs text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)]"
            >
              导出 CSV
            </button>
            <button
              type="button"
              onClick={handleExportBriefTxt}
              className="rounded-full border border-[var(--shell-border-subtle)] px-3 py-2 text-xs text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)]"
            >
              导出简报
            </button>
          </div>

          {topQueries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {topQueries.map((query) => (
                <span
                  key={query}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)]"
                >
                  <button
                    onClick={() => setKeyword(query)}
                    className="hover:text-[var(--shell-text-strong)] transition-colors"
                    title="点击搜索该关键词"
                  >
                    {query}
                  </button>
                  <button
                    onClick={() => handleRemoveQuery(query)}
                    className="text-[var(--shell-subtle)] hover:text-[#EF4444] transition-colors"
                    title="删除该关键词"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={handleClearQueries}
                className="px-2 py-1 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors"
              >
                清空常用
              </button>
            </div>
          )}
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={FILTER_SPLIT_MIN_FILTER_PX}
          aria-valuemax={900}
          aria-valuenow={Math.round(filterPaneHeightPx)}
          tabIndex={0}
          aria-label="拖动调节筛选区与结果区高度，上下方向键微调"
          className="group relative z-10 flex shrink-0 cursor-row-resize items-center justify-center border-y border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] outline-none hover:bg-[var(--shell-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]/35"
          style={{ height: FILTER_SPLITTER_HIT_PX }}
          onMouseDown={handleSplitMouseDown}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">
          {!keyword.trim() && (
            <p className="py-10 text-center text-sm text-[var(--shell-subtle)]">输入关键词搜索日程、任务与笔记</p>
          )}
          {!!keyword.trim() && results.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--shell-subtle)]">没有命中结果，试试别的关键词或筛选</p>
          )}
          {!!keyword.trim() && results.length > 0 && (
            <p className="mb-3 text-sm font-medium text-[var(--shell-text-strong)]">找到 {results.length} 个结果</p>
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
                <span className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-[var(--shell-text-strong)]">
                  {renderHighlightedTitle(item.title)}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-[var(--shell-text-muted)]">
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
