import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateKey } from '@/lib/calendar-utils';

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateKeyToday(): string {
  const n = new Date();
  return formatDateKey(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function timeNowHHmm(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

function shiftMonth(year: number, month: number, delta: number): { y: number; m: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

type GridCell = {
  fullDate: string;
  inMonth: boolean;
  day: number;
  isToday: boolean;
};

function buildMonthGrid(year: number, month: number): GridCell[] {
  const calMonthIndex = month - 1;
  const todayStr = dateKeyToday();
  const cells: GridCell[] = [];
  const first = new Date(year, calMonthIndex, 1);
  const pad = first.getDay();
  const prevLast = new Date(year, calMonthIndex, 0);
  const prevMonthDays = prevLast.getDate();

  for (let i = 0; i < pad; i++) {
    const d = prevMonthDays - pad + 1 + i;
    const dt = new Date(year, calMonthIndex - 1, d);
    const fullDate = formatDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    cells.push({
      fullDate,
      inMonth: false,
      day: dt.getDate(),
      isToday: fullDate === todayStr,
    });
  }

  const lastDay = new Date(year, calMonthIndex + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const fullDate = formatDateKey(year, month, d);
    cells.push({
      fullDate,
      inMonth: true,
      day: d,
      isToday: fullDate === todayStr,
    });
  }

  let k = 1;
  while (cells.length < 42) {
    const dt = new Date(year, calMonthIndex + 1, k);
    const fullDate = formatDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    cells.push({
      fullDate,
      inMonth: false,
      day: dt.getDate(),
      isToday: fullDate === todayStr,
    });
    k++;
  }

  return cells;
}

export interface TodoSchedulePickerModalProps {
  open: boolean;
  initialDateKey: string;
  initialTime: string;
  onClose: () => void;
  onConfirm: (dateKey: string, timeHHmm: string) => void;
  /** 关闭定时（不设日程时间） */
  onClearSchedule: () => void;
}

export function TodoSchedulePickerModal({
  open,
  initialDateKey,
  initialTime,
  onClose,
  onConfirm,
  onClearSchedule,
}: TodoSchedulePickerModalProps) {
  const [viewYear, setViewYear] = useState(() => {
    const p = parseDateKey(initialDateKey);
    return p?.y ?? new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseDateKey(initialDateKey);
    return p?.m ?? new Date().getMonth() + 1;
  });
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [selectedTime, setSelectedTime] = useState(initialTime);

  useEffect(() => {
    if (!open) return;
    const safeDate = parseDateKey(initialDateKey) ? initialDateKey : dateKeyToday();
    const p = parseDateKey(safeDate)!;
    setViewYear(p.y);
    setViewMonth(p.m);
    setSelectedDateKey(safeDate);
    setSelectedTime(initialTime);
  }, [open, initialDateKey, initialTime]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goPrevMonth = useCallback(() => {
    const { y, m } = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(y);
    setViewMonth(m);
  }, [viewYear, viewMonth]);

  const goNextMonth = useCallback(() => {
    const { y, m } = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(y);
    setViewMonth(m);
  }, [viewYear, viewMonth]);

  const restoreTodayNow = useCallback(() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = n.getMonth() + 1;
    setViewYear(y);
    setViewMonth(m);
    setSelectedDateKey(dateKeyToday());
    setSelectedTime(timeNowHHmm());
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-4 pb-5 pt-8 sm:items-center sm:pb-8 sm:pt-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 质感对齐系统时间选择器：磨砂玻璃 + 柔和多层阴影 + 顶沿高光 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="选择日程日期与时间"
        className="relative flex w-full max-w-[min(100%,17.75rem)] flex-col overflow-hidden rounded-[1.125rem] border border-white/65 bg-white/78 text-neutral-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),inset_0_2px_5px_rgba(255,255,255,0.45),0_24px_48px_-12px_rgba(0,0,0,0.28),0_12px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur-2xl backdrop-saturate-150 sm:max-w-[18.25rem]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

        <div className="relative flex shrink-0 items-center justify-between px-3 pb-1 pt-2.5">
          <div className="flex items-center gap-0.5 text-[0.9375rem] font-semibold tracking-tight text-neutral-900">
            <span>
              {viewYear}年{viewMonth}月
            </span>
            <ChevronDown className="h-4 w-4 text-[var(--shell-accent)] opacity-90" aria-hidden strokeWidth={2.25} />
          </div>
          <div className="flex items-center gap-0">
            <button
              type="button"
              onClick={goPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--shell-accent)] transition-colors active:scale-95 active:bg-black/[0.06] hover:bg-black/[0.04]"
              aria-label="上一月"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={goNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--shell-accent)] transition-colors active:scale-95 active:bg-black/[0.06] hover:bg-black/[0.04]"
              aria-label="下一月"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* 月历区：略凹陷的「托盘」，接近滚轮选择器背后的承载层 */}
        <div className="relative mx-2 mb-1.5 rounded-[0.875rem] bg-gradient-to-b from-neutral-100/55 to-neutral-200/35 p-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.85),inset_0_-1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05]">
          <div className="grid grid-cols-7 gap-y-0.5 pb-1 text-center text-[0.625rem] leading-tight text-neutral-500">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-0.5 font-medium">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {grid.map((cell, idx) => {
              const selected = cell.fullDate === selectedDateKey;
              return (
                <button
                  key={`${cell.fullDate}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedDateKey(cell.fullDate);
                    const p = parseDateKey(cell.fullDate);
                    if (p) {
                      setViewYear(p.y);
                      setViewMonth(p.m);
                    }
                  }}
                  className={`relative mx-auto flex h-8 w-8 max-w-full items-center justify-center rounded-full text-xs font-medium transition-[transform,box-shadow,background-color,color] active:scale-90 ${
                    selected
                      ? 'bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)] shadow-[0_2px_10px_var(--shell-accent-glow),0_1px_3px_rgba(0,0,0,0.12)]'
                      : cell.inMonth
                        ? 'text-neutral-800 hover:bg-white/70 active:bg-white/90'
                        : 'text-neutral-400 hover:bg-white/40 active:bg-white/55'
                  } ${cell.isToday && !selected ? 'ring-[1.5px] ring-[var(--shell-accent)]/40 ring-offset-1 ring-offset-transparent' : ''}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* 时间行：与系统时间胶囊类似的嵌套块 */}
        <div className="relative mx-2 mb-1.5 flex items-center justify-between rounded-[0.875rem] bg-gradient-to-b from-white/90 to-neutral-100/70 px-3 py-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06]">
          <span className="text-sm font-medium text-neutral-800">时间</span>
          <label className="cursor-pointer rounded-[999px] bg-white/90 px-3.5 py-1 text-sm tabular-nums text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] active:scale-[0.98]">
            <span>{selectedTime}</span>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="sr-only"
            />
          </label>
        </div>

        <div className="relative flex items-center justify-between gap-2 border-t border-black/[0.06] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={restoreTodayNow}
            className="rounded-[0.625rem] bg-white/75 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07] transition-colors active:scale-[0.98] hover:bg-white/95"
          >
            还原
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onClearSchedule();
                onClose();
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline active:opacity-70"
            >
              不设时间
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm(selectedDateKey, selectedTime);
                onClose();
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--shell-accent)] text-[var(--shell-accent-contrast)] shadow-[0_2px_12px_var(--shell-accent-glow),0_2px_6px_rgba(0,0,0,0.15)] transition-transform active:scale-95 hover:bg-[var(--shell-accent-hover)]"
              aria-label="确定"
            >
              <Check className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
