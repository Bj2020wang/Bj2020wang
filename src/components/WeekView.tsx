import { useMemo } from 'react';
import { Smile } from 'lucide-react';
import type { CalendarEvent, TodoItem } from '@/types';
import { getWeekDays } from '@/lib/calendar-utils';

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
  onToggleComplete: _onToggleComplete,
  onDayClick,
  notesByDate,
  todos: _todos = [],
  workspaceMode: _workspaceMode = 'personal',
  accountEmail: _accountEmail = null,
  teamOwnerEmail: _teamOwnerEmail = null,
}: WeekViewProps) {
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
            <div className="text-base font-medium md:text-sm">{day.dayOfWeek}</div>
            <div className="flex items-center justify-center gap-1">
              <div className={`text-xl font-semibold md:text-lg ${day.isToday ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-strong)]'}`}>
                {day.date}
              </div>
              {notesByDate?.[day.fullDate]?.trim() && (
                <span className="rounded bg-[var(--shell-accent)] px-1 py-0.5 text-xs leading-none text-[var(--shell-accent-contrast)]">
                  记
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-px flex-1 bg-[var(--shell-grid)] border border-[var(--shell-grid)] rounded-lg overflow-hidden">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDate(day.fullDate);
          const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
          const regularEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-'));
          const hasTasks = regularEvents.length > 0;

          return (
            <div
              key={day.fullDate}
              className={`
                bg-[var(--shell-inset)] p-2 min-h-[100px] transition-colors duration-200
                ${day.isToday ? 'ring-1 ring-[var(--shell-accent)] ring-inset' : ''}
                hover:bg-[var(--shell-surface-hover)]
              `}
              onClick={() => onDayClick?.(day.fullDate)}
              onDrop={(e) => handleDrop(e, day.fullDate)}
              onDragOver={handleDragOver}
            >
              {hasTasks ? (
                <div
                  className="mb-1 flex justify-start"
                  title="当天有待办日程"
                  aria-label="当天有待办日程"
                >
                  <Smile
                    className="h-[1.1rem] w-[1.1rem] shrink-0 text-[var(--shell-accent)] md:h-4 md:w-4"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
              ) : null}

              {holidayEvent && (
                <div
                  className="mb-1 truncate rounded px-2 py-0.5 text-sm font-medium text-white md:text-xs"
                  style={{ backgroundColor: holidayEvent.color }}
                >
                  {holidayEvent.title}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
