import { useMemo } from 'react';
import { Check, ThumbsUp } from 'lucide-react';
import type { CalendarEvent, TodoItem } from '@/types';
import { getWeekDays } from '@/lib/calendar-utils';
import { isPeerEventInTeam } from '@/lib/teamCollab';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDrop: (dateStr: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onToggleComplete: (eventId: string) => void;
  onDayClick?: (dateStr: string) => void;
  notesByDate?: Record<string, string>;
  todos?: TodoItem[];
  workspaceMode?: 'personal' | 'team';
  accountEmail?: string | null;
  teamOwnerEmail?: string | null;
}

export default function WeekView({
  currentDate,
  events,
  onDrop,
  onDragOver,
  onToggleComplete,
  onDayClick,
  notesByDate,
  todos = [],
  workspaceMode = 'personal',
  accountEmail = null,
  teamOwnerEmail = null,
}: WeekViewProps) {
  const todoMap = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const weekDays = useMemo(() => {
    return getWeekDays(new Date(currentDate));
  }, [currentDate]);

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    onDrop(dateStr);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(e);
  };

  const getEventsForDate = (dateStr: string) => {
    return events.filter(event => {
      if (event.endDate) {
        return dateStr >= event.startDate && dateStr <= event.endDate;
      }
      return dateStr === event.startDate;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--shell-panel)] rounded-xl p-4 overflow-hidden">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px mb-2">
        {weekDays.map((day) => (
          <div
            key={day.fullDate}
            className={`text-center py-2 cursor-pointer rounded-md transition-colors ${day.isToday ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-subtle)]'} hover:bg-[var(--shell-surface-hover)]`}
            onClick={() => onDayClick?.(day.fullDate)}
          >
            <div className="text-sm font-medium">{day.dayOfWeek}</div>
            <div className="flex items-center justify-center gap-1">
              <div className={`text-lg font-semibold ${day.isToday ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-strong)]'}`}>
                {day.date}
              </div>
              {notesByDate?.[day.fullDate]?.trim() && (
                <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]">
                  记
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--shell-subtle)]">{day.lunarDate}</div>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-px flex-1 bg-[var(--shell-grid)] border border-[var(--shell-grid)] rounded-lg overflow-hidden">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDate(day.fullDate);
          const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
          const regularEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-'));

          return (
            <div
              key={day.fullDate}
              className={`
                bg-[var(--shell-inset)] p-2 min-h-[120px] transition-colors duration-200
                ${day.isToday ? 'ring-1 ring-[var(--shell-accent)] ring-inset' : ''}
                hover:bg-[var(--shell-surface-hover)]
              `}
              onClick={() => onDayClick?.(day.fullDate)}
              onDrop={(e) => handleDrop(e, day.fullDate)}
              onDragOver={handleDragOver}
            >
              {/* Holiday */}
              {holidayEvent && (
                <div
                  className="text-xs font-medium text-white px-2 py-0.5 rounded mb-1 truncate"
                  style={{ backgroundColor: holidayEvent.color }}
                >
                  {holidayEvent.title}
                </div>
              )}

              {/* Events */}
              <div className="flex flex-col gap-1">
                {regularEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleComplete(event.id);
                    }}
                    className={`
                      text-[13px] font-medium text-white px-2 py-0.5 rounded truncate
                      cursor-pointer transition-all duration-200 flex items-center justify-between gap-1
                      ${event.completed ? 'opacity-50 line-through' : 'opacity-100'}
                      hover:brightness-110
                    `}
                    style={{ backgroundColor: event.color }}
                    title={
                      isPeerEventInTeam(workspaceMode, accountEmail, teamOwnerEmail, event, todoMap)
                        ? '队友的日程（请谨慎操作）'
                        : event.completed
                          ? '点击取消完成'
                          : '点击标记完成'
                    }
                  >
                    <span className="flex min-w-0 items-center gap-0.5">
                      {isPeerEventInTeam(workspaceMode, accountEmail, teamOwnerEmail, event, todoMap) ? (
                        <ThumbsUp className="h-3 w-3 shrink-0 text-white/90" strokeWidth={2.25} aria-hidden />
                      ) : null}
                      <span className="truncate">{event.title}</span>
                    </span>
                    {event.completed && (
                      <Check className="w-3.5 h-3.5 text-white flex-shrink-0" strokeWidth={3} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
