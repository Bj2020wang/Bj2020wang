import type { CalendarEvent, TodoItem } from '@/types';

function readEventUpdatedAt(e: CalendarEvent): number {
  return typeof e.updatedAt === 'number' && Number.isFinite(e.updatedAt) ? e.updatedAt : 0;
}

/** 侧栏编辑日程时优先对应的「主」定时事件（与其它拖拽副本区分）。 */
export function pickPrimaryTodoTimedEvent(events: CalendarEvent[], todo: TodoItem): CalendarEvent | undefined {
  const timed = events.filter((e) => e.sourceTodoId === todo.id && e.startTime);
  if (timed.length === 0) return undefined;
  if (todo.scopeType === 'day' && todo.date) {
    const m = timed.find((e) => e.startDate === todo.date);
    if (m) return m;
  }
  return [...timed].sort((a, b) => readEventUpdatedAt(b) - readEventUpdatedAt(a))[0];
}
