import { useMemo, useRef, useState } from 'react';
import { Check, GripVertical } from 'lucide-react';
import type { CalendarEvent } from '@/types';
import { getLunarDate, formatDateKey } from '@/lib/calendar-utils';
import { WEEKDAYS } from '@/lib/calendar-utils';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDrop: (dateStr: string, time?: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onToggleComplete: (eventId: string) => void;
  onMoveEvent: (eventId: string, newTime?: string) => void;
  notesByDate?: Record<string, string>;
}

// Generate time slots from 08:00 to 23:30, every 30 minutes
function generateTimeSlots() {
  const slots = [];
  for (let h = 8; h <= 23; h++) {
    slots.push({ hour: h, minute: 0, label: `${String(h).padStart(2, '0')}:00` });
    slots.push({ hour: h, minute: 30, label: `${String(h).padStart(2, '0')}:30` });
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();
const SLOT_HEIGHT = 28; // px per 30min slot

type TimePosition = { top: number; height: number };

function calcTimePosition(startTime: string, endTime?: string): TimePosition {
  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h - 8) * 60 + m;
  };
  const startMin = parse(startTime);
  const endMin = endTime ? parse(endTime) : startMin + 60;
  return {
    top: (startMin / 30) * SLOT_HEIGHT,
    height: Math.max(((endMin - startMin) / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.8),
  };
}

export default function DayView({ currentDate, events, onDrop, onDragOver, onToggleComplete, onMoveEvent, notesByDate }: DayViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const day = currentDate.getDate();
  const dateStr = formatDateKey(year, month, day);
  const dayOfWeek = WEEKDAYS[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1];
  const lunarDate = getLunarDate(currentDate);

  const today = new Date();
  const todayStr = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const isToday = dateStr === todayStr;

  const dayEvents = useMemo(() => {
    return events.filter(event => {
      if (event.endDate) {
        return dateStr >= event.startDate && dateStr <= event.endDate;
      }
      return dateStr === event.startDate;
    });
  }, [events, dateStr]);
  const hasNote = !!notesByDate?.[dateStr]?.trim();

  const holidayEvent = dayEvents.find((e) => e.id.startsWith('holiday-'));
  const timedEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-') && e.startTime);
  const untimedEvents = dayEvents.filter((e) => !e.id.startsWith('holiday-') && !e.startTime);

  const timeGridRef = useRef<HTMLDivElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  // ---- Handle dragging existing events on timeline ----
  const handleEventDragStart = (e: React.DragEvent, eventId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('action', 'move-event');
    e.dataTransfer.setData('eventId', eventId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingEventId(eventId);
  };

  const handleEventDragEnd = () => {
    setDraggingEventId(null);
    setDragOverSlot(null);
  };

  // ---- Handle dropping on timeline ----
  const calcSlotFromY = (clientY: number): number | null => {
    if (!timeGridRef.current) return null;
    const rect = timeGridRef.current.getBoundingClientRect();
    const y = clientY - rect.top + timeGridRef.current.scrollTop;
    return Math.max(0, Math.min(Math.floor(y / SLOT_HEIGHT), TIME_SLOTS.length - 1));
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(e);
    const slot = calcSlotFromY(e.clientY);
    if (slot !== null) setDragOverSlot(slot);
  };

  const handleTimelineDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const slot = calcSlotFromY(e.clientY);
    if (slot === null) {
      setDragOverSlot(null);
      return;
    }

    const action = e.dataTransfer.getData('action');
    const targetSlot = TIME_SLOTS[slot];
    const timeStr = `${String(targetSlot.hour).padStart(2, '0')}:${String(targetSlot.minute).padStart(2, '0')}`;

    if (action === 'move-event') {
      // Moving existing event on timeline
      const eventId = e.dataTransfer.getData('eventId');
      if (eventId) onMoveEvent(eventId, timeStr);
    } else {
      // New task from sidebar
      onDrop(dateStr, timeStr);
    }

    setDragOverSlot(null);
    setDraggingEventId(null);
  };

  const handleUntimedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const action = e.dataTransfer.getData('action');
    if (action === 'move-event') {
      const eventId = e.dataTransfer.getData('eventId');
      if (eventId) onMoveEvent(eventId, undefined);
    } else {
      // New task from sidebar: create an untimed event for current day.
      onDrop(dateStr);
    }
    setDragOverSlot(null);
    setDraggingEventId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--shell-panel)] rounded-xl p-4 overflow-hidden">
      {/* Day header */}
      <div className={`text-center py-2 mb-2 ${isToday ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-strong)]'}`}>
        <div className="text-sm text-[var(--shell-subtle)]">{year}年{month}月 · 星期{dayOfWeek}</div>
        <div className="flex items-center justify-center gap-2">
          <div className={`text-3xl font-bold ${isToday ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-strong)]'}`}>{day}</div>
          {hasNote && (
            <span className="text-xs leading-none px-1.5 py-1 rounded bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)]">有笔记</span>
          )}
        </div>
        <div className="text-sm text-[var(--shell-subtle)]">农历{lunarDate}</div>
      </div>

      {/* Untimed events */}
      <div
        className="mb-3 space-y-1 flex-shrink-0 rounded-lg border border-dashed border-[var(--shell-border-subtle)] p-2"
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver(e);
        }}
        onDrop={handleUntimedDrop}
        title="可将时间轴任务拖到此处，暂存为无时间任务"
      >
        {holidayEvent && (
          <div
            className="text-sm font-medium text-white px-3 py-1 rounded inline-block"
            style={{ backgroundColor: holidayEvent.color }}
          >
            {holidayEvent.title}
          </div>
        )}
        {untimedEvents.map((event) => (
          <div
            key={event.id}
            draggable
            onDragStart={(e) => handleEventDragStart(e, event.id)}
            onDragEnd={handleEventDragEnd}
            onClick={() => onToggleComplete(event.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all
              ${event.completed ? 'opacity-50 line-through' : 'opacity-100'} hover:bg-[var(--shell-surface-hover)]`}
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: event.color }} />
            <span className="text-[var(--shell-text-strong)] text-sm flex-1">{event.title}</span>
            {event.completed && <Check className="w-4 h-4 text-[#10B981]" strokeWidth={3} />}
          </div>
        ))}
        {untimedEvents.length === 0 && (
          <div className="px-1 py-1 text-xs text-[var(--shell-subtle)]">
            无明确时间任务（可从时间轴拖拽到此）
          </div>
        )}
      </div>

      {/* Time grid */}
      <div
        ref={timeGridRef}
        className="flex-1 overflow-y-auto relative min-h-0"
        onDragOver={handleTimelineDragOver}
        onDragLeave={handleTimelineDragLeave}
        onDrop={handleTimelineDrop}
      >
        {/* Timed events overlay layer */}
        <div className="absolute left-[52px] right-0 top-0 bottom-0 z-10">
          {timedEvents.map((event) => {
            const pos = calcTimePosition(event.startTime!, event.endTime);
            const isDragging = draggingEventId === event.id;

            return (
              <div
                key={event.id}
                draggable
                onDragStart={(e) => handleEventDragStart(e, event.id)}
                onDragEnd={handleEventDragEnd}
                className="absolute left-1 right-1 cursor-grab active:cursor-grabbing"
                style={{ top: pos.top, height: pos.height }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(event.id);
                  }}
                  className={`
                    h-full px-2 py-0.5 rounded text-[13px] font-medium text-white
                    transition-all duration-200 flex items-center justify-between gap-1
                    ${event.completed ? 'opacity-50 line-through' : 'opacity-100'}
                    ${isDragging ? 'opacity-40 scale-[0.98]' : ''}
                    hover:brightness-110 hover:shadow-lg hover:shadow-black/20
                    select-none
                  `}
                  style={{ backgroundColor: event.color }}
                  title={`${event.title} ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}（拖拽调整时间）`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <GripVertical className="w-3 h-3 opacity-60 flex-shrink-0" />
                    <span className="truncate">{event.title}</span>
                  </div>
                  <span className="text-[10px] opacity-70 flex-shrink-0">{event.startTime}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drop target highlight line */}
        {dragOverSlot !== null && (
          <div
            className="absolute left-[52px] right-0 z-20 pointer-events-none"
            style={{ top: dragOverSlot * SLOT_HEIGHT }}
          >
            <div className="h-0.5 bg-[var(--shell-accent)] shadow-[0_0_6px_var(--shell-accent-glow)]" />
          </div>
        )}

        {/* Time slot rows */}
        <div className="relative">
          {TIME_SLOTS.map((slot, index) => {
            const isHourMark = slot.minute === 0;
            const isDragTarget = dragOverSlot === index;

            return (
              <div
                key={slot.label}
                className={`
                  flex items-start relative
                  transition-colors duration-150
                  ${isDragTarget ? 'bg-[var(--shell-accent-soft)]' : ''}
                `}
                style={{ height: SLOT_HEIGHT }}
              >
                {/* Time label */}
                <div className="w-12 text-right pr-2 flex-shrink-0 pt-0.5">
                  <span className={`text-xs ${isHourMark ? 'text-[var(--shell-text-muted)]' : 'text-[var(--shell-faint)]'}`}>
                    {slot.label}
                  </span>
                </div>

                {/* Grid line */}
                <div
                  className={`flex-1 ${isHourMark ? 'border-t border-[var(--shell-border-subtle)]' : 'border-t border-dashed border-[var(--shell-border-subtle)] opacity-40'}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
