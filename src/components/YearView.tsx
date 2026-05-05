import type { CalendarEvent } from '@/types';

interface YearViewProps {
  year: number;
  events: CalendarEvent[];
  onPickMonth: (month1to12: number) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 事件与自然月区间是否有交集（含跨月长假） */
function eventTouchesMonth(event: CalendarEvent, year: number, month1to12: number): boolean {
  const monthStart = `${year}-${pad2(month1to12)}-01`;
  const lastDay = new Date(year, month1to12, 0).getDate();
  const monthEnd = `${year}-${pad2(month1to12)}-${pad2(lastDay)}`;
  const evEnd = event.endDate || event.startDate;
  return !(evEnd < monthStart || event.startDate > monthEnd);
}

/** 年度总览：按月汇总日程数量与完成情况（可扩展为清单统计） */
export default function YearView({ year, events, onPickMonth }: YearViewProps) {
  const cells = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const inMonth = events.filter((e) => eventTouchesMonth(e, year, m));
    const total = inMonth.length;
    const done = inMonth.filter((e) => e.completed).length;
    return { m, label: `${m}月`, total, done };
  });

  const yearDone = cells.reduce((s, c) => s + c.done, 0);
  const yearTotal = cells.reduce((s, c) => s + c.total, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] p-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 shrink-0">
        <h2 className="text-xl font-semibold text-[var(--shell-text-strong)] md:text-lg">{year}年 日程概览</h2>
        <p className="text-sm text-[var(--shell-text-muted)] md:text-xs">
          全年日程 {yearTotal} 条 · 已完成 {yearDone}
          {yearTotal > 0 ? `（${Math.round((yearDone / yearTotal) * 100)}%）` : ''}
        </p>
      </div>
      <p className="mb-3 shrink-0 text-sm text-[var(--shell-subtle)] md:text-xs">
        点击某个月进入月视图；后续可在此扩展「任务清单」年度统计。
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 min-h-0 overflow-y-auto">
        {cells.map(({ m, label, total, done }) => (
          <button
            key={m}
            type="button"
            onClick={() => onPickMonth(m)}
            className="text-left rounded-lg border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2.5 hover:bg-[var(--shell-list-hover)] hover:border-[var(--shell-accent)]/40 transition-colors"
          >
            <div className="text-base font-medium text-[var(--shell-text-strong)] md:text-sm">{label}</div>
            <div className="mt-1 text-sm text-[var(--shell-text-muted)] md:text-xs">
              日程 {total} 条
              {total > 0 ? ` · 完成 ${done}` : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
