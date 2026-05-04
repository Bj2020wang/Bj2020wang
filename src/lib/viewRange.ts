import type { ViewType } from '@/types';
import { formatDateKey, getWeekDays } from '@/lib/calendar-utils';

/**
 * 主日历当前视图对应的日期闭区间（YYYY-MM-DD）。
 * 与 `App.tsx` 中 `getFilteredTodos` 所用范围一致；统计等衍生视图应直接引用此函数，避免漂移。
 */
export function getCalendarViewRange(viewType: ViewType, currentDate: Date): { start: string; end: string } {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const dom = currentDate.getDate();

  if (viewType === 'today') {
    const dayKey = formatDateKey(year, month, dom);
    return { start: dayKey, end: dayKey };
  }

  if (viewType === 'week') {
    const anchor = new Date(year, month - 1, dom);
    const weekDays = getWeekDays(anchor);
    return { start: weekDays[0].fullDate, end: weekDays[6].fullDate };
  }

  if (viewType === 'year') {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  const monthStart = formatDateKey(year, month, 1);
  const monthEnd = formatDateKey(year, month, new Date(year, month, 0).getDate());
  return { start: monthStart, end: monthEnd };
}
