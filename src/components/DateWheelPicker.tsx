import { useMemo } from 'react';

interface DateWheelPickerProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** 为 false 时不显示「清空」（用于顶栏跳转日期等场景） */
  showClear?: boolean;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function DateWheelPicker({
  label,
  value,
  onChange,
  showClear = true,
}: DateWheelPickerProps) {
  const [yearPart, monthPart, dayPart] = value ? value.split('-') : ['', '', ''];
  const selectedYear = Number(yearPart) || new Date().getFullYear();
  const selectedMonth = Number(monthPart) || 1;
  const selectedDay = Number(dayPart) || 1;

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = current - 10; y <= current + 5; y += 1) arr.push(y);
    return arr;
  }, []);

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const applyDate = (year: number, month: number, day: number) => {
    const safeDay = Math.min(day, getDaysInMonth(year, month));
    onChange(`${year}-${pad2(month)}-${pad2(safeDay)}`);
  };

  return (
    <div className="rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-bg)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-[var(--shell-subtle)]">{label}</div>
        {showClear ? (
          <button
            onClick={() => onChange('')}
            className="text-xs text-[var(--shell-accent)] hover:underline"
            type="button"
          >
            清空
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <select
          value={yearPart || String(selectedYear)}
          onChange={(e) => applyDate(Number(e.target.value), selectedMonth, selectedDay)}
          className="h-32 overflow-y-auto rounded-md bg-[var(--shell-panel)] border border-[var(--shell-border)] text-[var(--shell-text-strong)] text-sm px-2 py-1"
          size={5}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}年
            </option>
          ))}
        </select>
        <select
          value={monthPart || pad2(selectedMonth)}
          onChange={(e) => applyDate(selectedYear, Number(e.target.value), selectedDay)}
          className="h-32 overflow-y-auto rounded-md bg-[var(--shell-panel)] border border-[var(--shell-border)] text-[var(--shell-text-strong)] text-sm px-2 py-1"
          size={5}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <option key={month} value={pad2(month)}>
              {month}月
            </option>
          ))}
        </select>
        <select
          value={dayPart || pad2(selectedDay)}
          onChange={(e) => applyDate(selectedYear, selectedMonth, Number(e.target.value))}
          className="h-32 overflow-y-auto rounded-md bg-[var(--shell-panel)] border border-[var(--shell-border)] text-[var(--shell-text-strong)] text-sm px-2 py-1"
          size={5}
        >
          {days.map((day) => (
            <option key={day} value={pad2(day)}>
              {day}日
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
