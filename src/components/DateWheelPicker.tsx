import { useMemo } from 'react';

interface DateWheelPickerProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function DateWheelPicker({ label, value, onChange }: DateWheelPickerProps) {
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
    <div className="rounded-lg border border-[#2E2E36] bg-[#111115] p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[#9CA3AF]">{label}</div>
        <button
          onClick={() => onChange('')}
          className="text-xs text-[#D4A853] hover:underline"
          type="button"
        >
          清空
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={yearPart || String(selectedYear)}
          onChange={(e) => applyDate(Number(e.target.value), selectedMonth, selectedDay)}
          className="h-28 overflow-y-auto rounded-md bg-[#1A1A1F] border border-[#2E2E36] text-white text-xs px-1"
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
          className="h-28 overflow-y-auto rounded-md bg-[#1A1A1F] border border-[#2E2E36] text-white text-xs px-1"
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
          className="h-28 overflow-y-auto rounded-md bg-[#1A1A1F] border border-[#2E2E36] text-white text-xs px-1"
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
