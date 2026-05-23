import { useMemo } from 'react';
import { Smile } from 'lucide-react';
import type { DayInfo, CalendarEvent } from '@/types';
import { WEEKDAYS, assignEventsToDays } from '@/lib/calendar-utils';

interface CalendarGridProps {
  days: DayInfo[];
  events: CalendarEvent[];
  onDrop: (dateStr: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDayClick?: (dateStr: string) => void;
  notesByDate?: Record<string, string>;
}

export default function CalendarGrid({
  days,
  events,
  onDrop,
  onDragOver,
  onDayClick,
  notesByDate,
}: CalendarGridProps) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--shell-panel)] rounded-xl p-4">
      {/* Weekday Headers */}
      <div className="mb-2 grid shrink-0 grid-cols-7 gap-0">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-base font-medium text-[var(--shell-subtle)] md:text-sm"
          >
            {day}
          </div>
        ))}
      </div>

      {/* 月格子可能高于可用高度（尤其移动端），单独纵向滚动以免末行被裁切 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="grid grid-cols-7 gap-px rounded-lg border border-[var(--shell-grid)] bg-[var(--shell-grid)] overflow-hidden">
        {daysWithEvents.map((day, index) => {
          const dayEvents = day.events;
          const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
          const regularEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-'));
          const hasTasks = regularEvents.length > 0;

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
              {/* 公历日期 + 休/班 */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-1">
                  <span
                    className={`
                      text-lg font-medium md:text-base
                      ${day.isCurrentMonth ? 'text-[var(--shell-text-strong)]' : 'text-[var(--shell-faint)]'}
                    `}
                  >
                    {day.date}
                  </span>
                  {notesByDate?.[day.fullDate]?.trim() && (
                    <span className="rounded bg-[var(--shell-accent)] px-1 py-0.5 text-xs leading-none text-[var(--shell-accent-contrast)]">
                      记
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {day.isRestDay && (
                    <span className="text-sm text-[#10B981] md:text-xs">休</span>
                  )}
                  {day.isWorkDay && (
                    <span className="text-sm text-[var(--shell-subtle)] md:text-xs">班</span>
                  )}
                </div>
              </div>

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

              {/* Holiday Tag */}
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
    </div>
  );
}
