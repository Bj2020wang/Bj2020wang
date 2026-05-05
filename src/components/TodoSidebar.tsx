import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Plus, Settings, Pencil, Trash2, ThumbsUp, Sun, Moon } from 'lucide-react';
import type { TodoItem, ViewType, TodoCategory, CalendarEvent } from '@/types';
import type { AppTheme } from '@/features/theme/useAppTheme';
import { isPeerTodoInTeam } from '@/lib/teamCollab';
import { getWeekDays, formatDateKey } from '@/lib/calendar-utils';
import { formatTodoScopeLabel } from '@/lib/todoScope';
import { todoParseDatetimeLocal, todoToDatetimeLocalValue } from '@/lib/todo-datetime-local';
import { pickPrimaryTodoTimedEvent } from '@/lib/todoCalendarLink';

interface TodoSidebarProps {
  todos: TodoItem[];
  viewType: ViewType;
  currentDate: Date;
  filteredTodos: TodoItem[];
  onDragStart: (todo: TodoItem) => void;
  /** 点击分类圆圈切换「已完成」（划线） */
  onToggleTodoComplete: (id: string) => void;
  /** 可选 `scheduleDate`（YYYY-MM-DD，默认今天）与 `startTime`（HH:mm）→ 创建定时日程 */
  onAddTodo: (
    text: string,
    category: TodoCategory,
    options?: { startTime?: string; scheduleDate?: string }
  ) => void;
  onUpdateTodo: (
    id: string,
    text: string,
    category: TodoCategory,
    options?: { wantSchedule?: boolean; startTime?: string; scheduleDate?: string }
  ) => void;
  /** 用于编辑时回显/更新关联日程 */
  events?: CalendarEvent[];
  onDeleteTodo: (id: string) => void;
  onResetLocalData: () => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onTestNotification: () => void;
  noteDateKey: string;
  noteContent: string;
  noteOwnerEmail?: string | null;
  isPeerNote?: boolean;
  canEditPeerNote?: boolean;
  onSaveNote: (dateKey: string, note: string) => void;
  /** 协作区：用于在队友任务前显示标记，降低误删风险 */
  workspaceMode?: 'personal' | 'team';
  accountEmail?: string | null;
  teamOwnerEmail?: string | null;
  /** 打开设置（登录 / 同步 / 协作） */
  onOpenSettings?: () => void;
  /** 仅移动端：设置菜单内切换深浅主题；桌面端不传，主题仍在顶栏 */
  appTheme?: AppTheme;
  onToggleAppTheme?: () => void;
  /** sidebar：桌面左侧窄栏；mobile：PWA 全宽主栏 */
  layout?: 'sidebar' | 'mobile';
}

const CATEGORY_OPTIONS: { value: TodoCategory; label: string }[] = [
  { value: 'work', label: '工作' },
  { value: 'life', label: '生活' },
  { value: 'study', label: '学习' },
  { value: 'health', label: '健康' },
];

function dateKeyToday(): string {
  const n = new Date();
  return formatDateKey(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export default function TodoSidebar({
  viewType,
  currentDate,
  filteredTodos,
  onDragStart,
  onToggleTodoComplete,
  onAddTodo,
  onUpdateTodo,
  events = [],
  onDeleteTodo,
  onResetLocalData,
  onExportData,
  onImportData,
  onTestNotification,
  noteDateKey,
  noteContent,
  noteOwnerEmail = null,
  isPeerNote = false,
  canEditPeerNote = false,
  onSaveNote,
  workspaceMode = 'personal',
  accountEmail = null,
  teamOwnerEmail = null,
  onOpenSettings,
  appTheme,
  onToggleAppTheme,
  layout = 'sidebar',
}: TodoSidebarProps) {
  const showThemeInSettingsMenu = appTheme !== undefined && onToggleAppTheme !== undefined;
  const [newTodoText, setNewTodoText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState<TodoCategory>('work');
  const [editingWantTime, setEditingWantTime] = useState(false);
  const [editingScheduleDate, setEditingScheduleDate] = useState(() => dateKeyToday());
  const [editingStartTime, setEditingStartTime] = useState('09:00');
  const [newTodoCategory, setNewTodoCategory] = useState<TodoCategory>('work');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TodoCategory>('all');
  const [newTodoWantTime, setNewTodoWantTime] = useState(false);
  const [newTodoScheduleDate, setNewTodoScheduleDate] = useState(() => dateKeyToday());
  const [newTodoStartTime, setNewTodoStartTime] = useState('09:00');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [noteDraft, setNoteDraft] = useState(noteContent);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => setNoteDraft(noteContent));
  }, [noteContent, noteDateKey]);

  const handleDragStart = (e: React.DragEvent, todo: TodoItem) => {
    e.dataTransfer.setData('text/plain', todo.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(todo);
  };

  const resetNewTodoSchedule = () => {
    setNewTodoWantTime(false);
    setNewTodoScheduleDate(dateKeyToday());
    setNewTodoStartTime('09:00');
  };

  const addTodo = () => {
    if (newTodoText.trim()) {
      onAddTodo(newTodoText.trim(), newTodoCategory, {
        startTime: newTodoWantTime ? newTodoStartTime : undefined,
        scheduleDate: newTodoWantTime ? newTodoScheduleDate : undefined,
      });
      setNewTodoText('');
      resetNewTodoSchedule();
      setIsAdding(false);
    }
  };

  const startEditTodo = (todo: TodoItem) => {
    setIsAdding(false);
    const primary = pickPrimaryTodoTimedEvent(events, todo);
    const hasTimed = !!primary?.startTime;
    setEditingWantTime(hasTimed);
    setEditingScheduleDate(primary?.startDate ?? dateKeyToday());
    setEditingStartTime(primary?.startTime ?? '09:00');
    setEditingTodoId(todo.id);
    setEditingText(todo.text);
    setEditingCategory(todo.category);
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
    setEditingText('');
    setEditingCategory('work');
    setEditingWantTime(false);
    setEditingScheduleDate(dateKeyToday());
    setEditingStartTime('09:00');
  };

  const saveEditTodo = () => {
    if (!editingTodoId) return;
    const nextText = editingText.trim();
    if (!nextText) return;
    if (editingWantTime) {
      if (!/^\d{2}:\d{2}$/.test(editingStartTime.trim())) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editingScheduleDate)) return;
    }
    onUpdateTodo(editingTodoId, nextText, editingCategory, {
      wantSchedule: editingWantTime,
      startTime: editingWantTime ? editingStartTime : undefined,
      scheduleDate: editingWantTime ? editingScheduleDate : undefined,
    });
    cancelEditTodo();
  };

  const confirmDeleteTodo = (todo: TodoItem) => {
    const isPeer = isPeerTodoInTeam(workspaceMode, accountEmail, teamOwnerEmail, todo);
    const confirmed = window.confirm(
      isPeer
        ? `这是队友的任务（侧栏已用点赞图标标记），删除会影响协作数据，请再次确认。\n\n确定删除「${todo.text}」吗？\n关联的日历事件也会一并删除。`
        : `确定删除任务「${todo.text}」吗？\n关联的日历事件也会一并删除。`
    );
    if (!confirmed) return;
    onDeleteTodo(todo.id);
  };

  /** 标题下灰字：按日历 Today / Week / Month / Year 提示当前日期范围 */
  const getSubtitle = (): string => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const weekdayStr = ['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()];

    if (viewType === 'year') {
      return `${y}年 · 本年度范围内的任务`;
    }
    if (viewType === 'month') {
      return `${y}年${m}月`;
    }
    if (viewType === 'week') {
      const weekDays = getWeekDays(new Date(currentDate));
      const start = weekDays[0];
      const end = weekDays[6];
      const sm = Number(start.fullDate.slice(5, 7));
      const em = Number(end.fullDate.slice(5, 7));
      const sy = Number(start.fullDate.slice(0, 4));
      const ey = Number(end.fullDate.slice(0, 4));
      if (sy === ey) {
        return `${sy}年 · ${sm}月${start.date}日—${em}月${end.date}日`;
      }
      return `${sy}年${sm}月${start.date}日—${ey}年${em}月${end.date}日`;
    }
    const dateStr = formatDateKey(y, m, day);
    const today = new Date();
    const todayStr = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (dateStr === todayStr) {
      return `${y}年${m}月${day}日 星期${weekdayStr} · 今天`;
    }
    return `${y}年${m}月${day}日 星期${weekdayStr}`;
  };

  const getEmptyText = (): string => {
    if (viewType === 'year') return `${currentDate.getFullYear()}年暂无匹配的待办任务`;
    if (viewType === 'month') return `${currentDate.getMonth() + 1}月暂无待办任务`;
    if (viewType === 'week') return '本周暂无待办任务';
    return '今日暂无待办任务';
  };

  const visibleTodos =
    categoryFilter === 'all'
      ? filteredTodos
      : filteredTodos.filter((todo) => todo.category === categoryFilter);
  const noteReadOnly = isPeerNote && !canEditPeerNote;
  const isMobileLayout = layout === 'mobile';

  const rootLayout =
    layout === 'mobile'
      ? 'w-full min-w-0 flex-1 min-h-0 rounded-none border-0 p-3 sm:p-4'
      : 'w-[320px] flex-shrink-0 rounded-xl p-4';

  return (
    <div className={`flex flex-col h-full bg-[var(--shell-panel)] ${rootLayout}`}>
      {/* 导入文件：设置菜单触发，须始终挂载（PWA 不展示底部说明区时仍可用） */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportData(file);
          e.currentTarget.value = '';
        }}
      />

      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-[var(--shell-text-strong)] md:text-2xl">Todo</h1>
          <p className="mt-1 text-sm leading-snug text-[var(--shell-subtle)] md:text-xs">{getSubtitle()}</p>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetNewTodoSchedule();
              setIsAdding((prev) => {
                const next = !prev;
                if (next) cancelEditTodo();
                return next;
              });
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--shell-surface-hover)] transition-colors duration-200"
          >
            <Plus className="w-5 h-5 text-[var(--shell-icon)]" />
          </button>
          <button
            onClick={() => setShowActionsMenu((prev) => !prev)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--shell-surface-hover)] transition-colors duration-200"
            title="设置：账号与同步、导入导出等"
          >
            <Settings className="w-5 h-5 text-[var(--shell-icon)]" />
          </button>
          {showActionsMenu && (
            <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-menu-bg)] p-1 shadow-xl">
              {showThemeInSettingsMenu ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggleAppTheme?.();
                    setShowActionsMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--shell-text-strong)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
                  title={appTheme === 'dark' ? '切换为浅色暖色主题' : '切换为深色主题'}
                >
                  {appTheme === 'dark' ? (
                    <Sun className="h-4 w-4 shrink-0 text-[var(--shell-icon)]" aria-hidden />
                  ) : (
                    <Moon className="h-4 w-4 shrink-0 text-[var(--shell-icon)]" aria-hidden />
                  )}
                  {appTheme === 'dark' ? '浅色暖色主题' : '深色主题'}
                </button>
              ) : null}
              {onOpenSettings ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSettings();
                    setShowActionsMenu(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--shell-text-strong)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
                >
                  账号与同步…
                </button>
              ) : null}
              <button
                onClick={() => {
                  onExportData();
                  setShowActionsMenu(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
              >
                导出数据
              </button>
              <button
                onClick={() => {
                  importInputRef.current?.click();
                  setShowActionsMenu(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
              >
                导入数据
              </button>
              <button
                onClick={() => {
                  onTestNotification();
                  setShowActionsMenu(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
              >
                测试通知
              </button>
              <button
                onClick={() => {
                  onResetLocalData();
                  setShowActionsMenu(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[#EF4444] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
              >
                清空本地 / 恢复默认
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 分类筛选：仅桌面侧栏；移动端省略以保持简洁 */}
      {!isMobileLayout ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`rounded-md border px-2 py-1 text-sm transition-colors md:text-xs ${
              categoryFilter === 'all'
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
            }`}
          >
            全部
          </button>
          {CATEGORY_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategoryFilter(item.value)}
              className={`rounded-md border px-2 py-1 text-sm transition-colors md:text-xs ${
                categoryFilter === item.value
                  ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
                  : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Add Todo Input */}
      {isAdding && (
        <div className="mb-4">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="输入新任务..."
            className="w-full rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
            autoFocus
          />
          {isMobileLayout && newTodoWantTime ? (
            <div className="mt-2 rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)]/50 px-3 py-2">
              <label className="mb-1 block text-xs text-[var(--shell-text-muted)]" htmlFor="new-todo-datetime-local">
                日期与时间（系统原生，点按选择）
              </label>
              <input
                id="new-todo-datetime-local"
                type="datetime-local"
                value={todoToDatetimeLocalValue(newTodoScheduleDate, newTodoStartTime)}
                onChange={(e) => {
                  const parsed = todoParseDatetimeLocal(e.target.value);
                  if (parsed) {
                    setNewTodoScheduleDate(parsed.dateKey);
                    setNewTodoStartTime(parsed.time);
                  }
                }}
                className="min-h-11 w-full rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none"
              />
              <p className="mt-1.5 text-xs leading-snug text-[var(--shell-subtle)]">
                点按输入框使用系统选择器；与顶部 Today/Week/Month/Year 无关。关闭定时请再点下方时钟。
              </p>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={newTodoCategory}
              onChange={(e) => setNewTodoCategory(e.target.value as TodoCategory)}
              className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-sm text-[var(--shell-text-muted)] focus:outline-none md:text-xs"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addTodo}
              className="rounded-md bg-[var(--shell-accent)] px-3 py-1 text-sm font-medium text-[var(--shell-accent-contrast)] transition-colors hover:bg-[var(--shell-accent-hover)] md:text-xs"
            >
              添加
            </button>
            <button
              type="button"
              onClick={() => {
                resetNewTodoSchedule();
                setIsAdding(false);
              }}
              className="rounded-md bg-[var(--shell-btn-secondary-bg)] px-3 py-1 text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-btn-secondary-hover)] md:text-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => setNewTodoWantTime((v) => !v)}
              aria-pressed={newTodoWantTime}
              title={
                newTodoWantTime
                  ? '已开启定时：点击关闭（添加时不写日程时间）'
                  : isMobileLayout
                    ? '点击开启定时：在上方选用日期与时间（系统原生）'
                    : '点击设置日期与起始时刻（默认今天，可自行修改）'
              }
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors md:h-7 md:w-7 ${
                newTodoWantTime
                  ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)]/12 text-[var(--shell-accent)]'
                  : 'border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
              }`}
            >
              <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {newTodoWantTime && !isMobileLayout ? (
            <div className="mt-2 space-y-2 rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)]/50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-[var(--shell-text-muted)] md:text-xs" htmlFor="new-todo-schedule-date">
                  日期
                </label>
                <input
                  id="new-todo-schedule-date"
                  type="date"
                  value={newTodoScheduleDate}
                  onChange={(e) => setNewTodoScheduleDate(e.target.value)}
                  className="min-h-10 rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-[var(--shell-text-muted)] md:text-xs" htmlFor="new-todo-start-time">
                  起始时刻
                </label>
                <input
                  id="new-todo-start-time"
                  type="time"
                  value={newTodoStartTime}
                  onChange={(e) => setNewTodoStartTime(e.target.value)}
                  className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
                />
              </div>
              <p className="text-xs leading-snug text-[var(--shell-subtle)]">
                默认「今天」，与顶部 Today/Week/Month/Year 无关；日程落在所选日期的该时刻。
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Todo List - filtered by view */}
      <div className="flex-1 overflow-y-auto">
        {visibleTodos.length === 0 && (
          <p className="py-8 text-center text-base text-[var(--shell-subtle)] md:text-sm">
            {isMobileLayout ? '暂无待办任务' : getEmptyText()}
          </p>
        )}
        {visibleTodos.map((todo) => (
          (() => {
            const count = todo.count ?? 0;
            const isEmptyCount = todo.count === null;
            const canDrag = isEmptyCount || count > 0;
            const isMuted = !canDrag && !isEmptyCount;
            const isPeer = isPeerTodoInTeam(workspaceMode, accountEmail, teamOwnerEmail, todo);
            const lineMuted = (todo.completed ?? false) || isMuted;
            return (
          <div
            key={todo.id}
            draggable={editingTodoId !== todo.id && canDrag}
            onDragStart={(e) => editingTodoId !== todo.id && canDrag && handleDragStart(e, todo)}
            className={
              editingTodoId === todo.id
                ? 'mb-4 w-full'
                : `
              flex items-center gap-2 mb-3 group transition-opacity
              ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}
              ${isMuted ? 'opacity-40' : ''}
            `
            }
            title={isPeer && editingTodoId !== todo.id ? '队友的任务（请谨慎修改或删除）' : undefined}
          >
            {editingTodoId === todo.id ? (
              <div className="w-full">
                {isPeer ? (
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                    <ThumbsUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                    <span>队友任务（请谨慎修改）</span>
                  </div>
                ) : null}
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditTodo();
                    if (e.key === 'Escape') cancelEditTodo();
                  }}
                  placeholder="编辑任务…"
                  className="w-full rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
                  autoFocus
                />
                {isMobileLayout && editingWantTime ? (
                  <div className="mt-2 rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)]/50 px-3 py-2">
                    <label className="mb-1 block text-xs text-[var(--shell-text-muted)]" htmlFor="edit-todo-datetime-local">
                      日期与时间（系统原生，点按选择）
                    </label>
                    <input
                      id="edit-todo-datetime-local"
                      type="datetime-local"
                      value={todoToDatetimeLocalValue(editingScheduleDate, editingStartTime)}
                      onChange={(e) => {
                        const parsed = todoParseDatetimeLocal(e.target.value);
                        if (parsed) {
                          setEditingScheduleDate(parsed.dateKey);
                          setEditingStartTime(parsed.time);
                        }
                      }}
                      className="min-h-11 w-full rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none"
                    />
                    <p className="mt-1.5 text-xs leading-snug text-[var(--shell-subtle)]">
                      点按输入框使用系统选择器；关闭定时请再点下方时钟。
                    </p>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={editingCategory}
                    onChange={(e) => setEditingCategory(e.target.value as TodoCategory)}
                    className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-sm text-[var(--shell-text-muted)] focus:outline-none md:text-xs"
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveEditTodo}
                    className="rounded-md bg-[var(--shell-accent)] px-3 py-1 text-sm font-medium text-[var(--shell-accent-contrast)] transition-colors hover:bg-[var(--shell-accent-hover)] md:text-xs"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditTodo}
                    className="rounded-md bg-[var(--shell-btn-secondary-bg)] px-3 py-1 text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-btn-secondary-hover)] md:text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingWantTime((v) => !v)}
                    aria-pressed={editingWantTime}
                    title={
                      editingWantTime
                        ? '已开启定时：点击关闭（保存后日历不再保留该任务的定时日程）'
                        : isMobileLayout
                          ? '点击开启定时：在上方选用日期与时间（系统原生）'
                          : '点击设置日期与起始时刻（默认今天，可自行修改）'
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors md:h-7 md:w-7 ${
                      editingWantTime
                        ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)]/12 text-[var(--shell-accent)]'
                        : 'border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
                    }`}
                  >
                    <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                {!isMobileLayout && editingWantTime ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-bg)]/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-[var(--shell-text-muted)] md:text-xs" htmlFor="edit-todo-schedule-date">
                        日期
                      </label>
                      <input
                        id="edit-todo-schedule-date"
                        type="date"
                        value={editingScheduleDate}
                        onChange={(e) => setEditingScheduleDate(e.target.value)}
                        className="min-h-10 rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-[var(--shell-text-muted)] md:text-xs" htmlFor="edit-todo-start-time">
                        起始时刻
                      </label>
                      <input
                        id="edit-todo-start-time"
                        type="time"
                        value={editingStartTime}
                        onChange={(e) => setEditingStartTime(e.target.value)}
                        className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-2 py-1 text-base text-[var(--shell-text-strong)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
                      />
                    </div>
                    <p className="text-xs leading-snug text-[var(--shell-subtle)]">
                      默认「今天」，与顶部 Today/Week/Month/Year 无关；保存后更新日历上的该定时日程。
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {isPeer ? (
                  <ThumbsUp
                    className="mt-2 h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400"
                    strokeWidth={2.25}
                    aria-label="队友任务"
                  />
                ) : null}
                <button
                  type="button"
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTodoComplete(todo.id);
                  }}
                  title={(todo.completed ?? false) ? '标记为未完成' : '标记为已完成'}
                  aria-pressed={todo.completed ?? false}
                  className={`box-border flex h-6 w-6 shrink-0 items-center justify-center rounded-full border p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--shell-panel)] md:h-5 md:w-5 ${
                    todo.completed ?? false ? 'border-transparent' : 'bg-transparent'
                  }`}
                  style={
                    todo.completed ?? false
                      ? { backgroundColor: todo.color, borderColor: todo.color }
                      : {
                          borderColor: canDrag || isEmptyCount ? todo.color : 'var(--shell-faint)',
                        }
                  }
                >
                  {todo.completed ?? false ? (
                    <Check className="h-3 w-3 text-white md:h-2.5 md:w-2.5" strokeWidth={3.25} aria-hidden />
                  ) : null}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {!isMobileLayout ? (
                    <span className="text-sm tabular-nums leading-tight text-[var(--shell-subtle)] md:text-xs">
                      {formatTodoScopeLabel(todo, currentDate)}
                    </span>
                  ) : null}
                  <span
                    className={`text-lg leading-relaxed md:text-base ${lineMuted ? 'text-[var(--shell-subtle)] line-through' : 'text-[var(--shell-text-strong)]'}`}
                  >
                    {todo.text}
                  </span>
                </div>
                <span
                  className={`
              rounded-full px-2 py-0.5 text-sm font-bold flex-shrink-0 md:text-xs
              ${isEmptyCount
                ? 'bg-[var(--shell-disabled-bg)] text-transparent'
                : count > 1
                  ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]'
                  : count === 1
                    ? 'bg-[var(--shell-disabled-bg)] text-[var(--shell-text-muted)]'
                    : 'bg-[var(--shell-disabled-bg)] text-[var(--shell-faint)]'
              }
            `}
                >
                  {isEmptyCount ? 'x' : `x${count}`}
                </span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEditTodo(todo)}
                    className="rounded p-1 hover:bg-[var(--shell-surface-hover)]"
                    title="编辑任务"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--shell-text-muted)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDeleteTodo(todo)}
                    className="rounded p-1 hover:bg-[var(--shell-surface-hover)]"
                    title="删除任务"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#EF4444]" />
                  </button>
                </div>
              </>
            )}
          </div>
            );
          })()
        ))}
      </div>

      {/* Footer Tip（仅桌面：说明文字占高，PWA 省略） */}
      {!isMobileLayout ? (
        <div className="mt-4 border-t border-[var(--shell-border-subtle)] pt-4">
          <p className="text-base text-[var(--shell-subtle)] md:text-sm">
            每条上方为所属时间范围；仅与当前视图时间段匹配的任务会列出（另有日历安排的也会显示）。左侧彩色圆圈点一下标记完成（划线），可从该行其它区域拖到日历。
          </p>
        </div>
      ) : null}

      {/* 笔记：桌面照常；PWA 默认折叠，避免占半屏 */}
      {isMobileLayout ? (
        <details className="mt-3 border-t border-[var(--shell-border-subtle)] pt-3">
          <summary className="cursor-pointer list-none text-base font-medium text-[var(--shell-text-strong)] [&::-webkit-details-marker]:hidden">
            笔记 · {noteDateKey}
          </summary>
          <div className="mt-3">
            {isPeerNote ? (
              <div className="mb-2 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-300">
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                <span>
                  队友笔记{noteOwnerEmail ? `：${noteOwnerEmail}` : ''}（即使有编辑权限也请慎重修改）
                </span>
              </div>
            ) : null}
            <textarea
              rows={6}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="写下今天的工作日记、笔记或感悟..."
              disabled={noteReadOnly}
              className="min-h-[184px] w-full resize-y rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onSaveNote(noteDateKey, noteDraft)}
                disabled={noteReadOnly}
                className="flex-1 rounded-md bg-[var(--shell-accent)] px-3 py-2 text-sm font-medium text-[var(--shell-accent-contrast)] transition-colors hover:bg-[var(--shell-accent-hover)]"
              >
                保存笔记
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteDraft('');
                  onSaveNote(noteDateKey, '');
                }}
                className="flex-1 rounded-md border border-[var(--shell-border)] px-3 py-2 text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)]"
              >
                清空笔记
              </button>
            </div>
          </div>
        </details>
      ) : (
        <div className="mt-4 border-t border-[var(--shell-border-subtle)] pt-4">
          <div className="mb-2 text-base font-medium text-[var(--shell-text-strong)] md:text-sm">笔记（{noteDateKey}）</div>
          {isPeerNote ? (
            <div className="mb-2 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-300 md:text-xs">
              <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              <span>
                队友笔记{noteOwnerEmail ? `：${noteOwnerEmail}` : ''}（即使有编辑权限也请慎重修改）
              </span>
            </div>
          ) : null}
          <textarea
            rows={6}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="写下今天的工作日记、笔记或感悟..."
            disabled={noteReadOnly}
            className="min-h-[184px] w-full resize-y rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] px-3 py-2 text-base text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:border-[var(--shell-accent)] focus:outline-none md:text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSaveNote(noteDateKey, noteDraft)}
              disabled={noteReadOnly}
              className="flex-1 rounded-md bg-[var(--shell-accent)] px-3 py-2 text-sm font-medium text-[var(--shell-accent-contrast)] transition-colors hover:bg-[var(--shell-accent-hover)] md:text-xs"
            >
              保存笔记
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteDraft('');
                onSaveNote(noteDateKey, '');
              }}
              className="flex-1 rounded-md border border-[var(--shell-border)] px-3 py-2 text-sm text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] md:text-xs"
            >
              清空笔记
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
