import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { CalendarEvent } from '@/types';
import { getWeekDays } from '@/lib/calendar-utils';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDrop: (dateStr: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onToggleComplete: (eventId: string) => void;
  onDayClick?: (dateStr: string) => void;
  notesByDate?: Record<string, string>;
}

export default function WeekView({ currentDate, events, onDrop, onDragOver, onToggleComplete, onDayClick, notesByDate }: WeekViewProps) {
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
    <div className="flex-1 flex flex-col h-full bg-[#212128] rounded-xl p-4 overflow-hidden">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px mb-2">
        {weekDays.map((day) => (
          <div
            key={day.fullDate}
            className={`text-center py-2 cursor-pointer rounded-md transition-colors ${day.isToday ? 'text-[#D4A853]' : 'text-[#6B7280]'} hover:bg-[#2A2A32]`}
            onClick={() => onDayClick?.(day.fullDate)}
          >
            <div className="text-sm font-medium">{day.dayOfWeek}</div>
            <div className="flex items-center justify-center gap-1">
              <div className={`text-lg font-semibold ${day.isToday ? 'text-[#D4A853]' : 'text-white'}`}>
                {day.date}
              </div>
              {notesByDate?.[day.fullDate]?.trim() && (
                <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-[#D4A853] text-black">
                  记
                </span>
              )}
            </div>
            <div className="text-xs text-[#6B7280]">{day.lunarDate}</div>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-px flex-1 bg-[#2E2E36] border border-[#2E2E36] rounded-lg overflow-hidden">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDate(day.fullDate);
          const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
          const regularEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-'));

          return (
            <div
              key={day.fullDate}
              className={`
                bg-[#1E1E24] p-2 min-h-[120px] transition-colors duration-200
                ${day.isToday ? 'ring-1 ring-[#D4A853] ring-inset' : ''}
                hover:bg-[#2A2A32]
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
                    title={event.completed ? '点击取消完成' : '点击标记完成'}
                  >
                    <span className="truncate">{event.title}</span>
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
