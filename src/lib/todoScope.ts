import type { TodoItem, TodoScopeType } from '@/types';

function addDaysToDateKey(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function resolveTodoScopeType(todo: TodoItem): TodoScopeType {
  if (todo.scopeType) return todo.scopeType;
  if (todo.date) return 'day';
  return 'month';
}

/** 侧栏展示：任务所属时间范围（与当前视图筛选口径一致） */
export function formatTodoScopeLabel(todo: TodoItem, anchorDate?: Date): string {
  const st = resolveTodoScopeType(todo);
  if (st === 'day' && todo.date) {
    const [y, m, d] = todo.date.split('-').map(Number);
    const showYear = anchorDate ? y !== anchorDate.getFullYear() : false;
    return showYear ? `${y}年${m}月${d}日` : `${m}月${d}日`;
  }
  if (st === 'week') {
    const ws = todo.scopeStart ?? todo.date;
    if (!ws) return '当周';
    const we = addDaysToDateKey(ws, 6);
    const [, m1, d1] = ws.split('-');
    const [, m2, d2] = we.split('-');
    return `${Number(m1)}/${Number(d1)}–${Number(m2)}/${Number(d2)}`;
  }
  if (st === 'year') {
    return todo.scopeYear !== undefined ? `${todo.scopeYear}年` : '本年';
  }
  const y = todo.scopeYear;
  return y !== undefined ? `${y}年${todo.month}月` : `${todo.month}月`;
}
