import { useMemo, type ReactNode } from 'react';
import { BarChart3, CheckCircle2, Clock, Target, TrendingUp, X } from 'lucide-react';
import type { CalendarEvent, TodoCategory, TodoItem, ViewType } from '@/types';
import { formatDateKey, getWeekDays } from '@/lib/calendar-utils';
import { getCalendarViewRange } from '@/lib/viewRange';

interface StatisticsOverviewPanelProps {
  /** 与侧栏一致：当前视图下的任务子集 */
  filteredTodos: TodoItem[];
  events: CalendarEvent[];
  viewType: ViewType;
  currentDate: Date;
  onClose: () => void;
}

function linkedEventsForTodo(todoId: string, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.sourceTodoId === todoId);
}

function rangesIntersect(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(aEnd < bStart || aStart > bEnd);
}

function filterEventsInRange(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string
): CalendarEvent[] {
  return events.filter((ev) => {
    const evEnd = ev.endDate ?? ev.startDate;
    return rangesIntersect(ev.startDate, evEnd, rangeStart, rangeEnd);
  });
}

function computeScopedMetrics(
  filteredTodos: TodoItem[],
  eventsScoped: CalendarEvent[],
  allEvents: CalendarEvent[]
) {
  const todoTotal = filteredTodos.length;
  const eventTotal = eventsScoped.length;

  let completedCount = 0;
  for (const e of eventsScoped) {
    if (e.completed) completedCount += 1;
  }
  for (const t of filteredTodos) {
    const linked = linkedEventsForTodo(t.id, allEvents);
    if (linked.length === 0 && t.count !== null && t.count === 0) {
      completedCount += 1;
    }
  }

  let schedulableTotal = eventsScoped.length;
  for (const t of filteredTodos) {
    if (linkedEventsForTodo(t.id, allEvents).length === 0) schedulableTotal += 1;
  }

  const completionRate =
    schedulableTotal === 0 ? 0 : Math.round((completedCount / schedulableTotal) * 100);

  const categoryOrder = ['work', 'life', 'study', 'health'] as const satisfies readonly TodoCategory[];
  const categoryCounts: Record<TodoCategory, number> = {
    work: 0,
    life: 0,
    study: 0,
    health: 0,
  };
  for (const t of filteredTodos) {
    categoryCounts[t.category] += 1;
  }
  const maxCategory = Math.max(1, ...categoryOrder.map((k) => categoryCounts[k]));

  return {
    todoTotal,
    eventTotal,
    completedCount,
    completionRate,
    categoryOrder,
    categoryCounts,
    maxCategory,
  };
}

const CATEGORY_META: Record<
  TodoCategory,
  { label: string; barClass: string }
> = {
  work: { label: '工作', barClass: 'bg-emerald-500' },
  life: { label: '生活', barClass: 'bg-violet-500' },
  study: { label: '学习', barClass: 'bg-amber-400' },
  health: { label: '健康', barClass: 'bg-pink-500' },
};

function eventTouchesDay(ev: CalendarEvent, dayKey: string): boolean {
  const end = ev.endDate ?? ev.startDate;
  return dayKey >= ev.startDate && dayKey <= end;
}

type TrendBucket = { label: string; key: string; count: number };

function buildTrend(
  viewType: ViewType,
  currentDate: Date,
  eventsScoped: CalendarEvent[]
): { buckets: TrendBucket[]; title: string; hint: string } {
  const completedInScope = eventsScoped.filter((e) => e.completed);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const dom = currentDate.getDate();

  if (viewType === 'today') {
    const dayKey = formatDateKey(year, month, dom);
    const count = completedInScope.filter((e) => eventTouchesDay(e, dayKey)).length;
    return {
      buckets: [{ label: '当日', key: dayKey, count }],
      title: '当日完成',
      hint: `与 Today 视图一致：统计 ${dayKey} 当日已完成的日程数。`,
    };
  }

  if (viewType === 'week') {
    const anchor = new Date(year, month - 1, dom);
    const days = getWeekDays(anchor);
    const buckets = days.map((d) => ({
      label: d.dayOfWeek,
      key: d.fullDate,
      count: completedInScope.filter((e) => eventTouchesDay(e, d.fullDate)).length,
    }));
    return {
      buckets,
      title: '本周完成趋势',
      hint: `与 Week 视图一致：自然周 ${days[0].fullDate}～${days[6].fullDate}，每日已完成日程数。`,
    };
  }

  if (viewType === 'month') {
    const lastDay = new Date(year, month, 0).getDate();
    const buckets: TrendBucket[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = formatDateKey(year, month, d);
      buckets.push({
        label: `${d}`,
        key,
        count: completedInScope.filter((e) => eventTouchesDay(e, key)).length,
      });
    }
    return {
      buckets,
      title: '本月每日完成',
      hint: `与 Month 视图一致：${year}年${month}月 每日已完成日程数。`,
    };
  }

  const buckets: TrendBucket[] = [];
  for (let m = 1; m <= 12; m++) {
    const ms = formatDateKey(year, m, 1);
    const me = formatDateKey(year, m, new Date(year, m, 0).getDate());
    const count = completedInScope.filter((e) => {
      const evEnd = e.endDate ?? e.startDate;
      return rangesIntersect(e.startDate, evEnd, ms, me);
    }).length;
    buckets.push({ label: `${m}月`, key: `y-${year}-${m}`, count });
  }
  return {
    buckets,
    title: '本年度按月完成',
    hint: `与 Year 视图一致：${year} 年各自然月内已完成日程条数（跨月日程在所属月份各计一次）。`,
  };
}

function scopeSubtitle(viewType: ViewType, currentDate: Date): string {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  if (viewType === 'today') return `当前范围：Today · ${y}年${m}月${d}日`;
  if (viewType === 'month') return `当前范围：Month · ${y}年${m}月`;
  if (viewType === 'year') return `当前范围：Year · ${y}年`;
  const r = getCalendarViewRange('week', currentDate);
  return `当前范围：Week · ${r.start}～${r.end}`;
}

export default function StatisticsOverviewPanel({
  filteredTodos,
  events,
  viewType,
  currentDate,
  onClose,
}: StatisticsOverviewPanelProps) {
  const range = useMemo(() => getCalendarViewRange(viewType, currentDate), [viewType, currentDate]);

  const eventsScoped = useMemo(
    () => filterEventsInRange(events, range.start, range.end),
    [events, range.start, range.end]
  );

  const metrics = useMemo(
    () => computeScopedMetrics(filteredTodos, eventsScoped, events),
    [filteredTodos, eventsScoped, events]
  );

  const trend = useMemo(
    () => buildTrend(viewType, currentDate, eventsScoped),
    [viewType, currentDate, eventsScoped]
  );

  const maxTrend = Math.max(1, ...trend.buckets.map((x) => x.count));

  const trendScroll = viewType === 'month';

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] shadow-lg">
      <div className="flex shrink-0 flex-col gap-1 border-b border-[var(--shell-border-subtle)] px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <BarChart3 className="h-7 w-7 shrink-0 text-[var(--shell-accent)]" strokeWidth={2} aria-hidden />
            <h2 className="text-xl font-semibold tracking-tight text-[var(--shell-text-strong)]">统计概览</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] text-[var(--shell-text-muted)] transition-colors hover:bg-[var(--shell-surface-hover)] hover:text-[var(--shell-text-strong)]"
            title="关闭（Esc）"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <p className="pr-12 text-xs text-[var(--shell-text-muted)]">{scopeSubtitle(viewType, currentDate)}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard icon={<Target className="h-5 w-5 text-sky-400" />} label="待办总数" value={metrics.todoTotal} />
          <SummaryCard icon={<Clock className="h-5 w-5 text-amber-400" />} label="日程总数" value={metrics.eventTotal} />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            label="已完成"
            value={metrics.completedCount}
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-[var(--shell-accent)]" />}
            label="完成率"
            value={`${metrics.completionRate}%`}
          />
        </div>

        <section className="rounded-2xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)]/35 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--shell-text-strong)]">任务分类分布</h3>
          <p className="mb-3 text-[11px] leading-snug text-[var(--shell-text-muted)]">
            仅统计当前视图范围内、侧栏展示的待办分类。
          </p>
          <div className="space-y-3">
            {metrics.categoryOrder.map((cat) => {
              const count = metrics.categoryCounts[cat];
              const meta = CATEGORY_META[cat];
              const pct = Math.round((count / metrics.maxCategory) * 100);
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--shell-text-muted)]">{meta.label}</span>
                    <span className="tabular-nums font-medium text-[var(--shell-text-strong)]">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--shell-bg)]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${meta.barClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)]/35 p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--shell-text-strong)]">{trend.title}</h3>
          <p className="mb-3 text-[11px] leading-snug text-[var(--shell-text-muted)]">{trend.hint}</p>
          <div
            className={
              trendScroll
                ? 'flex max-h-32 items-end gap-1 overflow-x-auto pb-1 pt-1'
                : viewType === 'today'
                  ? 'flex h-28 items-end justify-center gap-2'
                  : 'flex h-28 items-end justify-between gap-1.5'
            }
          >
            {trend.buckets.map((b) => (
              <div
                key={b.key}
                className={
                  trendScroll
                    ? 'flex w-8 shrink-0 flex-col items-center gap-1'
                    : viewType === 'today'
                      ? 'flex w-16 flex-col items-center gap-1'
                      : 'flex min-w-0 flex-1 flex-col items-center gap-1'
                }
              >
                <div className="flex h-[5.5rem] w-full items-end justify-center">
                  <div
                    className="w-full max-w-[2rem] rounded-t-md bg-[var(--shell-accent)]/85 transition-[height] duration-300"
                    style={{ height: `${Math.max(8, (b.count / maxTrend) * 100)}%` }}
                    title={`${b.label}：${b.count} 项`}
                  />
                </div>
                <span className="truncate text-[10px] text-[var(--shell-text-muted)]">{b.label}</span>
                <span className="tabular-nums text-[11px] font-medium text-[var(--shell-text-strong)]">{b.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)]/45 p-3.5">
      <div className="mb-2 flex items-center gap-2 opacity-90">{icon}</div>
      <p className="text-[11px] font-medium text-[var(--shell-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--shell-text-strong)]">{value}</p>
    </div>
  );
}
