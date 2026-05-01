import { useMemo } from 'react';
import { Check, ThumbsUp } from 'lucide-react';
import type { DayInfo, CalendarEvent, TodoItem } from '@/types';
import { isPeerEventInTeam } from '@/lib/teamCollab';
import { WEEKDAYS, assignEventsToDays } from '@/lib/calendar-utils';

interface CalendarGridProps {
  days: DayInfo[];
  events: CalendarEvent[];
  onDrop: (dateStr: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onToggleComplete?: (eventId: string) => void;
  onDayClick?: (dateStr: string) => void;
  notesByDate?: Record<string, string>;
  todos?: TodoItem[];
  workspaceMode?: 'personal' | 'team';
  accountEmail?: string | null;
  teamOwnerEmail?: string | null;
}

export default function CalendarGrid({
  days,
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
}: CalendarGridProps) {
  const todoMap = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const daysWithEvents = useMemo(() => {
    return assignEventsToDays(days, events);
  }, [days, events]);

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    onDrop(dateStr);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(e);
  };

  // Maximum number of event tags to display per cell
  const MAX_EVENT_TAGS = 2;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--shell-panel)] rounded-xl p-4">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-0 mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-[var(--shell-subtle)] py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px flex-1 bg-[var(--shell-grid)] border border-[var(--shell-grid)] rounded-lg overflow-hidden">
        {daysWithEvents.map((day, index) => {
          const dayEvents = day.events;
          const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
          const regularEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-'));

          // Limit displayed events
          const visibleEvents = regularEvents.slice(0, MAX_EVENT_TAGS);
          const overflowCount = regularEvents.length - MAX_EVENT_TAGS;

          return (
            <div
              key={index}
              className={`
                relative bg-[var(--shell-inset)] p-2 min-h-[100px] transition-colors duration-200
                ${day.isCurrentMonth ? '' : 'opacity-50'}
                ${day.isToday ? 'ring-1 ring-[var(--shell-accent)] ring-inset' : ''}
                hover:bg-[var(--shell-surface-hover)]
              `}
              onClick={() => onDayClick?.(day.fullDate)}
              onDrop={(e) => handleDrop(e, day.fullDate)}
              onDragOver={handleDragOver}
            >
              {/* Date Number & Lunar */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-1">
                  <span
                    className={`
                      text-base font-medium
                      ${day.isCurrentMonth ? 'text-[var(--shell-text-strong)]' : 'text-[var(--shell-faint)]'}
                    `}
                  >
                    {day.date}
                  </span>
                  {notesByDate?.[day.fullDate]?.trim() && (
                    <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]">
                      记
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {day.isRestDay && (
                    <span className="text-xs text-[#10B981]">休</span>
                  )}
                  {day.isWorkDay && (
                    <span className="text-xs text-[var(--shell-subtle)]">班</span>
                  )}
                  <span className="text-xs text-[var(--shell-subtle)]">{day.lunarDate}</span>
                </div>
              </div>

              {/* Holiday Tag */}
              {holidayEvent && (
                <div
                  className="text-xs font-medium text-white px-2 py-0.5 rounded mb-1 truncate"
                  style={{ backgroundColor: holidayEvent.color }}
                >
                  {holidayEvent.title}
                </div>
              )}

              {/* Event Tags */}
              <div className="flex flex-col gap-1">
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleComplete?.(event.id);
                    }}
                    className={`
                      group text-[13px] font-medium text-white px-2 py-0.5 rounded truncate
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

                {/* Overflow indicator */}
                {overflowCount > 0 && (
                  <div className="text-xs text-[var(--shell-subtle)] px-1 pt-0.5">
                    ......
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
