import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Search, User } from 'lucide-react';
import TodoSidebar from '@/components/TodoSidebar';
import CalendarGrid from '@/components/CalendarGrid';
import WeekView from '@/components/WeekView';
import DayView from '@/components/DayView';
import GlobalSearchPanel from '@/features/search/GlobalSearchPanel';
import AccountLoginModal from '@/features/account/AccountLoginModal';
import type { ViewType, CalendarEvent, TodoItem, TodoCategory, TodoScopeType } from '@/types';
import { getMonthDays, getWeekDays } from '@/lib/calendar-utils';
import { useEventReminders } from '@/features/notifications/useEventReminders';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import './App.css';

// 2024年10月9日=周三, 10日=周四, 13日=周日
const defaultTodos: TodoItem[] = [
  { id: '1', text: '周三上午9点参加部门会议', color: '#F59E0B', category: 'work', month: 10, date: '2024-10-09', count: 1 },
  { id: '2', text: '周四下午5点前往金融中心参加培训课程', color: '#8B5CF6', category: 'study', month: 10, date: '2024-10-10', count: 1 },
  { id: '3', text: '购物清单：生日蛋糕、红酒、水果、百事可乐、牛排', color: '#FFFFFF', category: 'life', month: 10, count: 1 },
  { id: '4', text: '周日上午10点飞机飞往上海出差', color: '#FFFFFF', category: 'work', month: 10, date: '2024-10-13', count: 1 },
  { id: '5', text: '跑步3公里', color: '#10B981', category: 'health', month: 10, count: 5 },
  { id: '6', text: '阅读30分钟', color: '#3B82F6', category: 'study', month: 10, count: 7 },
  { id: '7', text: '喝水8杯', color: '#06B6D4', category: 'health', month: 10, count: 8 },
];

const defaultEvents: CalendarEvent[] = [
  { id: 'holiday-2024-10-01', title: '国庆节', color: '#3B82F6', startDate: '2024-10-01', endDate: '2024-10-01' },
  { id: 'event-1', title: '上海出差', color: '#F59E0B', startDate: '2024-10-08', endDate: '2024-10-10' },
  { id: 'event-2', title: '电话会议...', color: '#10B981', startDate: '2024-10-08', endDate: '2024-10-08', completed: true },
  { id: 'event-3', title: '同学聚会', color: '#8B5CF6', startDate: '2024-10-19', endDate: '2024-10-19' },
  { id: 'event-4', title: '妈妈生日', color: '#EC4899', startDate: '2024-10-31', endDate: '2024-10-31' },
];

const STORAGE_KEY = 'todo-calendar-local-v1';

interface PersistedData {
  todos: TodoItem[];
  events: CalendarEvent[];
  currentDate: string;
  viewType: ViewType;
  eventsByDate: Record<string, string[]>;
  notesByDate: Record<string, string>;
}

function isPersistedDataLike(value: unknown): value is PersistedData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PersistedData>;
  if (!Array.isArray(data.todos) || !Array.isArray(data.events)) return false;
  if (typeof data.currentDate !== 'string') return false;
  if (!data.viewType || !['today', 'week', 'month'].includes(data.viewType)) return false;
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
    if (!parsed.viewType || !['today', 'week', 'month'].includes(parsed.viewType)) return null;
    if (parsed.notesByDate && typeof parsed.notesByDate !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const categoryColorMap: Record<TodoCategory, string> = {
  work: '#3B82F6',
  life: '#EC4899',
  study: '#8B5CF6',
  health: '#10B981',
};

const inferCategoryFromColor = (color: string): TodoCategory => {
  if (color === '#10B981' || color === '#06B6D4') return 'health';
  if (color === '#8B5CF6') return 'study';
  if (color === '#EC4899') return 'life';
  return 'work';
};

const createPersistedPayload = (
  todos: TodoItem[],
  events: CalendarEvent[],
  currentDate: Date,
  viewType: ViewType,
  notesByDate: Record<string, string>
): PersistedData => ({
  todos,
  events,
  currentDate: currentDate.toISOString(),
  viewType,
  eventsByDate: buildEventsByDate(events),
  notesByDate,
});

export default function App() {
  const [persisted] = useState<PersistedData | null>(() => loadPersistedData());
  const [currentDate, setCurrentDate] = useState(
    persisted?.currentDate ? new Date(persisted.currentDate) : new Date(2024, 9, 15)
  ); // Oct 15, 2024
  const [viewType, setViewType] = useState<ViewType>(persisted?.viewType ?? 'month');
  const [todos, setTodos] = useState<TodoItem[]>(persisted?.todos ?? defaultTodos);
  const [events, setEvents] = useState<CalendarEvent[]>(persisted?.events ?? defaultEvents);
  const [notesByDate, setNotesByDate] = useState<Record<string, string>>(persisted?.notesByDate ?? {});
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showAccountLogin, setShowAccountLogin] = useState(false);
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
    const payload = createPersistedPayload(todos, events, currentDate, viewType, notesByDate);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [todos, events, currentDate, viewType, notesByDate]);

  // Navigation: prev/next based on current view
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewType === 'week') {
      d.setDate(d.getDate() - 7);
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
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
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
      const newEvent: CalendarEvent = {
        id: `event-${Date.now()}`,
        title: todo.text,
        color: todo.color === '#FFFFFF' ? '#9CA3AF' : todo.color,
        startDate: dateStr,
        sourceTodoId: todo.id,
        startTime: time || undefined,
        endTime: time ? getEndTime(time) : undefined,
        reminderMinutes: time ? [50, 45, 40, 35, 30, 25, 20, 15, 10, 5] : undefined,
      };
      setEvents(prev => [...prev, newEvent]);

      // If a day-scope todo is rescheduled by drag-and-drop, move its owner date
      // so it appears only in the target day list.
      if (todo.scopeType === 'day') {
        setTodos(prev =>
          prev.map(t =>
            t.id === todo.id ? { ...t, date: dateStr } : t
          )
        );
      }

      // Increase repeat counter when a todo is scheduled on calendar.
      setTodos(prev =>
        prev.map(t =>
          t.id === todo.id ? { ...t, count: (t.count ?? 0) + 1 } : t
        )
      );

      draggedTodoRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Set or clear event time on day timeline.
  const handleMoveEvent = useCallback((eventId: string, newTime?: string) => {
    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        if (!newTime) {
          return { ...ev, startTime: undefined, endTime: undefined };
        }
        const [h, m] = newTime.split(':').map(Number);
        const endH = h + 1;
        const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        return { ...ev, startTime: newTime, endTime };
      })
    );
  }, []);

  const handleToggleComplete = useCallback((eventId: string) => {
    const event = eventsRef.current.find(ev => ev.id === eventId);
    if (!event) return;

    const newCompleted = !event.completed;
    const todoId = event.sourceTodoId;

    setEvents(prev =>
      prev.map(ev =>
        ev.id === eventId ? { ...ev, completed: newCompleted } : ev
      )
    );

    if (todoId) {
      if (newCompleted) {
        // Task completed: decrease counter.
        setTodos(prev =>
          prev.map(t =>
            t.id === todoId ? { ...t, count: Math.max(0, (t.count ?? 0) - 1) } : t
          )
        );
      } else {
        // Task un-completed: increase counter.
        setTodos(prev => {
          const existing = prev.find(t => t.id === todoId);
          if (existing) {
            return prev.map(t =>
              t.id === todoId ? { ...t, count: (t.count ?? 0) + 1 } : t
            );
          }
          return [...prev, {
            id: todoId,
            text: event.title,
            color: event.color === '#9CA3AF' ? '#FFFFFF' : event.color,
            category: inferCategoryFromColor(event.color),
            month: monthRef.current,
            count: 1,
          }];
        });
      }
    }
  }, []);

  const handleMonthSelect = (selectedMonth: number) => {
    setCurrentDate(new Date(year, selectedMonth - 1, 1));
    setShowMonthPicker(false);
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
      },
    ]);
    setCurrentDate(today);
    setViewType('today');
  }, []);

  const handleUpdateTodo = useCallback((todoId: string, text: string, category: TodoCategory) => {
    const nextColor = categoryColorMap[category];
    setTodos((prev) =>
      prev.map((todo) => (todo.id === todoId ? { ...todo, text, category, color: nextColor } : todo))
    );
    setEvents((prev) =>
      prev.map((event) =>
        event.sourceTodoId === todoId ? { ...event, title: text, color: nextColor } : event
      )
    );
  }, []);

  const handleDeleteTodo = useCallback((todoId: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== todoId));
    setEvents((prev) => prev.filter((event) => event.sourceTodoId !== todoId));
  }, []);

  const handleResetLocalData = useCallback(() => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('确定要清空本地数据并恢复默认数据吗？');
    if (!confirmed) return;

    window.localStorage.removeItem(STORAGE_KEY);
    setCurrentDate(new Date(2024, 9, 15));
    setViewType('month');
    setTodos(defaultTodos);
    setEvents(defaultEvents);
    setNotesByDate({});
    setShowMonthPicker(false);
  }, []);

  const handleExportData = useCallback(() => {
    if (typeof window === 'undefined') return;
    const payload = createPersistedPayload(todos, events, currentDate, viewType, notesByDate);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `todo-calendar-backup-${toDateKey(new Date())}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }, [todos, events, currentDate, viewType, notesByDate]);

  const handleImportData = useCallback(async (file: File) => {
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as PersistedData;

      const validViewType = parsed.viewType === 'today' || parsed.viewType === 'week' || parsed.viewType === 'month';
      const validDate = typeof parsed.currentDate === 'string' && !Number.isNaN(new Date(parsed.currentDate).getTime());
      const validTodos = Array.isArray(parsed.todos);
      const validEvents = Array.isArray(parsed.events);
      if (!validViewType || !validDate || !validTodos || !validEvents) {
        window.alert('导入失败：文件格式不正确。');
        return;
      }

      setTodos(parsed.todos);
      setEvents(parsed.events);
      setCurrentDate(new Date(parsed.currentDate));
      setViewType(parsed.viewType);
      setNotesByDate(parsed.notesByDate ?? {});
      setShowMonthPicker(false);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      window.alert('导入成功。');
    } catch {
      window.alert('导入失败：无法解析文件。');
    }
  }, []);

  const handleSaveNote = useCallback((dateKey: string, note: string) => {
    setNotesByDate((prev) => {
      const trimmed = note.trim();
      if (!trimmed) {
        const rest = { ...prev };
        delete rest[dateKey];
        return rest;
      }
      return { ...prev, [dateKey]: note };
    });
  }, []);

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
    return `${year}年${month}月`;
  })();

  // Month picker only for month view
  const showMonthDropdown = viewType === 'month';

  // Days for month view
  const days = getMonthDays(year, month);

  // Todo filtering based on view
  const getFilteredTodos = (): TodoItem[] => {
    const isInRange = (startDate: string, endDate: string, rangeStart: string, rangeEnd: string) =>
      !(endDate < rangeStart || startDate > rangeEnd);

    const resolveTodoScope = (todo: TodoItem): TodoScopeType => {
      if (todo.scopeType) return todo.scopeType;
      // Backward compatible fallback for old local data.
      if (todo.date) return 'day';
      return 'month';
    };

    const getViewRange = () => {
      if (viewType === 'today') {
        const dayKey = toDateKey(currentDate);
        return { start: dayKey, end: dayKey };
      }

      if (viewType === 'week') {
        const weekDays = getWeekDays(new Date(currentDate));
        return { start: weekDays[0].fullDate, end: weekDays[6].fullDate };
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
      const scopeType = resolveTodoScope(todo);
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
        // month scope todos only show in month list.
        return viewType === 'month' && todo.month === month;
      })();

      const byScheduledEvent = todosWithEventsInRange.has(todo.id);
      return byScope || byScheduledEvent;
    });
  };

  const filteredTodos = getFilteredTodos();

  const getAccountSnapshot = useCallback((): PersistedData => {
    return createPersistedPayload(todos, events, currentDate, viewType, notesByDate);
  }, [todos, events, currentDate, viewType, notesByDate]);

  const applyAccountSnapshot = useCallback((snapshot: unknown) => {
    if (!isPersistedDataLike(snapshot)) {
      throw new Error('云端快照格式无效，无法应用到本地');
    }

    const nextDate = new Date(snapshot.currentDate);
    if (Number.isNaN(nextDate.getTime())) {
      throw new Error('云端快照中的日期无效');
    }

    setTodos(snapshot.todos);
    setEvents(snapshot.events);
    setCurrentDate(nextDate);
    setViewType(snapshot.viewType);
    setNotesByDate(snapshot.notesByDate);
  }, []);

  return (
    <div className="h-screen w-screen bg-[#1A1A1F] flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        {/* Left: Navigation */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A2A32] transition-colors duration-200"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={handleNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A2A32] transition-colors duration-200"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="relative">
            {showMonthDropdown ? (
              <button
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="flex items-center gap-1 text-xl font-semibold text-white hover:text-[#D4A853] transition-colors"
              >
                {headerLabel}
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <span className="text-xl font-semibold text-white">{headerLabel}</span>
            )}
            {showMonthPicker && showMonthDropdown && (
              <div className="absolute top-full left-0 mt-2 bg-[#212128] border border-[#2E2E36] rounded-xl shadow-xl z-50 p-3 w-64">
                <div className="text-sm font-medium text-[#9CA3AF] mb-2">{year}年</div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <button
                      key={m}
                      onClick={() => handleMonthSelect(m)}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${m === month
                          ? 'bg-[#D4A853] text-black'
                          : 'text-white hover:bg-[#2A2A32]'
                        }
                      `}
                    >
                      {m}月
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
            onClick={() => setShowGlobalSearch(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32] transition-colors duration-200 flex items-center gap-1"
            title="全局关键词搜索"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          <button
            type="button"
            onClick={() => setShowAccountLogin(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32] transition-colors duration-200 flex items-center gap-1"
            title="账号登录与云端同步（演示）"
          >
            <User className="w-4 h-4" />
            账号
          </button>
          <button
            onClick={handleToday}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'today'
                ? 'border-[#D4A853] text-[#D4A853] bg-transparent'
                : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
              }
            `}
          >
            Today
          </button>
          <button
            onClick={() => setViewType('week')}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'week'
                ? 'border-[#D4A853] text-[#D4A853] bg-transparent'
                : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
              }
            `}
          >
            Week
          </button>
          <button
            onClick={() => setViewType('month')}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-200
              ${viewType === 'month'
                ? 'border-[#D4A853] text-[#D4A853] bg-transparent'
                : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
              }
            `}
          >
            Month
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
                viewType === 'today' ? 'day' : viewType === 'week' ? 'week' : 'month';

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
                  count: null,
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
          noteDateKey={toDateKey(currentDate)}
          noteContent={notesByDate[toDateKey(currentDate)] ?? ''}
          onSaveNote={handleSaveNote}
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
          />
        )}
      </div>

      {/* Click outside to close month picker */}
      {showMonthPicker && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMonthPicker(false)}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearchPanel
          events={events}
          onClose={() => setShowGlobalSearch(false)}
          onJumpToDate={handleSearchJumpToDate}
          onAddToTodayPlan={handleAddSearchResultToTodayPlan}
        />
      )}

      {showAccountLogin && (
        <AccountLoginModal
          onClose={() => setShowAccountLogin(false)}
          onPullSnapshot={applyAccountSnapshot}
          onPushSnapshot={getAccountSnapshot}
        />
      )}
    </div>
  );
}
