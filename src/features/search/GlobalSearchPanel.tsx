import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent } from '@/types';

interface GlobalSearchPanelProps {
  events: CalendarEvent[];
  onClose: () => void;
  onJumpToDate: (dateStr: string) => void;
  onAddToTodayPlan: (title: string) => void;
}

interface SearchResultItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  completed: boolean;
}

const SAVED_QUERIES_KEY = 'global-search-saved-queries-v1';
const MAX_SAVED_QUERY_COUNT = 8;

function loadQueryStats(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(SAVED_QUERIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      // Backward compatibility: migrate old string list to count map.
      return parsed.reduce<Record<string, number>>((acc, item) => {
        if (typeof item === 'string' && item.trim()) {
          acc[item.trim()] = 1;
        }
        return acc;
      }, {});
    }

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const normalized: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!key.trim()) continue;
        const count = Number(value);
        normalized[key] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
      }
      return normalized;
    }
    return {};
  } catch {
    return {};
  }
}

function persistQueryStats(stats: Record<string, number>) {
  window.localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(stats));
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function GlobalSearchPanel({ events, onClose, onJumpToDate, onAddToTodayPlan }: GlobalSearchPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [queryStats, setQueryStats] = useState<Record<string, number>>(() => loadQueryStats());

  const renderHighlightedTitle = (title: string) => {
    const q = keyword.trim();
    if (!q) return title;

    const matcher = new RegExp(`(${escapeRegExp(q)})`, 'ig');
    const parts = title.split(matcher);
    if (parts.length <= 1) return title;

    return (
      <>
        {parts.map((part, index) => {
          if (part.toLowerCase() === q.toLowerCase()) {
            return (
              <mark key={`${part}-${index}`} className="rounded px-0.5 bg-[var(--shell-mark-bg)] text-[var(--shell-mark-text)]">
                {part}
              </mark>
            );
          }
          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </>
    );
  };

  const results = useMemo<SearchResultItem[]>(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return [];

    const matched = events.filter((event) => {
      const titleMatched = event.title.toLowerCase().includes(q);
      if (!titleMatched) return false;
      if (showIncompleteOnly && event.completed) return false;
      return true;
    });

    return matched
      .map((event) => ({
        id: event.id,
        title: event.title,
        date: event.startDate,
        time: event.startTime,
        completed: !!event.completed,
      }))
      .sort((a, b) => {
        const aKey = `${a.date} ${a.time ?? '99:99'}`;
        const bKey = `${b.date} ${b.time ?? '99:99'}`;
        return aKey < bKey ? 1 : -1;
      });
  }, [events, keyword, showIncompleteOnly]);

  const resultStats = useMemo(() => {
    const total = results.length;
    const incomplete = results.filter((item) => !item.completed).length;
    const withTime = results.filter((item) => !!item.time).length;
    const completed = total - incomplete;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, incomplete, withTime, completionRate };
  }, [results]);

  const monthlyDistribution = useMemo(() => {
    const monthCountMap: Record<string, number> = {};
    for (const item of results) {
      const monthKey = item.date.slice(0, 7);
      monthCountMap[monthKey] = (monthCountMap[monthKey] ?? 0) + 1;
    }
    return Object.entries(monthCountMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [results]);

  const topQueries = useMemo(() => {
    return Object.entries(queryStats)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], 'zh-CN');
      })
      .slice(0, MAX_SAVED_QUERY_COUNT)
      .map(([query]) => query);
  }, [queryStats]);

  useEffect(() => {
    const q = keyword.trim();
    if (!q) return;

    const timer = window.setTimeout(() => {
      setQueryStats((prev) => {
        const next: Record<string, number> = { ...prev, [q]: (prev[q] ?? 0) + 1 };
        persistQueryStats(next);
        return next;
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const handleExportCsv = () => {
    if (!keyword.trim() || results.length === 0) {
      window.alert('当前没有可导出的搜索结果，请先输入关键词并确保有命中结果。');
      return;
    }

    const escapeCsv = (value: string) => {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const now = new Date();
    const exportTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentKeyword = keyword.trim();

    const rows = [
      ['标题', '日期', '时间', '完成状态', '关键词', '导出时间'],
      ...results.map((item) => [
        item.title,
        item.date,
        item.time ?? '无具体时刻',
        item.completed ? '已完成' : '未完成',
        currentKeyword,
        exportTime,
      ]),
    ];
    const csvContent = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.href = url;
    link.download = `global-search-${stamp}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportBriefTxt = () => {
    const q = keyword.trim();
    if (!q || results.length === 0) {
      window.alert('当前没有可导出的简报内容，请先输入关键词并确保有命中结果。');
      return;
    }

    const now = new Date();
    const exportTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const monthlyText = monthlyDistribution.length
      ? monthlyDistribution.map(([month, count]) => `${month}: ${count}`).join('\n')
      : '暂无';
    const detailsText = results
      .map((item, index) => `${index + 1}. ${item.date} ${item.time ?? '无具体时刻'} | ${item.title} | ${item.completed ? '已完成' : '未完成'}`)
      .join('\n');

    const brief = [
      `关键词查询简报`,
      `查询关键词：${q}`,
      `导出时间：${exportTime}`,
      `仅看未完成：${showIncompleteOnly ? '是' : '否'}`,
      ``,
      `一、核心统计`,
      `- 命中总数：${resultStats.total}`,
      `- 未完成数：${resultStats.incomplete}`,
      `- 完成率：${resultStats.completionRate}%`,
      `- 有具体时间条数：${resultStats.withTime}`,
      ``,
      `二、最近 6 个月命中分布`,
      monthlyText,
      ``,
      `三、结果明细（按时间倒序）`,
      detailsText,
      ``,
    ].join('\n');

    const blob = new Blob([`\uFEFF${brief}`], { type: 'text/plain;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.href = url;
    link.download = `global-search-brief-${stamp}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleRemoveQuery = (query: string) => {
    setQueryStats((prev) => {
      const next = { ...prev };
      delete next[query];
      persistQueryStats(next);
      return next;
    });
  };

  const handleClearQueries = () => {
    const confirmed = window.confirm('确定清空所有常用关键词吗？');
    if (!confirmed) return;
    setQueryStats({});
    persistQueryStats({});
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="flex h-[min(85vh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--shell-border-subtle)] bg-[var(--shell-panel)] shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-[var(--shell-border-subtle)]">
          <div>
            <h2 className="text-lg text-[var(--shell-text-strong)] font-semibold">全局关键词搜索</h2>
            <p className="text-xs text-[var(--shell-text-muted)] mt-1">在所有日历事件中按关键词搜索，并显示具体日期时间（默认不限日期）</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--shell-surface-hover)] flex items-center justify-center"
            title="关闭搜索"
          >
            <X className="w-4 h-4 text-[var(--shell-text-muted)]" />
          </button>
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--shell-border-subtle)]">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词（如：走访企业）"
            className="w-full px-3 py-2 bg-[var(--shell-input-deep)] border border-[var(--shell-border-subtle)] rounded-lg text-sm text-[var(--shell-text-strong)] placeholder-[var(--shell-placeholder)] focus:outline-none focus:border-[var(--shell-accent)]"
          />
          <button
            onClick={() => setShowIncompleteOnly((prev) => !prev)}
            className={`mt-2 px-3 py-2 text-xs rounded-md border transition-colors ${
              showIncompleteOnly
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
                : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
            }`}
          >
            {showIncompleteOnly ? '仅看未完成：已开启' : '仅看未完成：已关闭'}
          </button>
          <button
            onClick={handleExportCsv}
            className="mt-2 ml-2 px-3 py-2 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors"
          >
            导出当前结果 CSV
          </button>
          <button
            onClick={handleExportBriefTxt}
            className="mt-2 ml-2 px-3 py-2 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors"
          >
            导出简报 TXT
          </button>
          {topQueries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {topQueries.map((query) => (
                <span
                  key={query}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)]"
                >
                  <button
                    onClick={() => setKeyword(query)}
                    className="hover:text-[var(--shell-text-strong)] transition-colors"
                    title="点击搜索该关键词"
                  >
                    {query}
                  </button>
                  <button
                    onClick={() => handleRemoveQuery(query)}
                    className="text-[var(--shell-subtle)] hover:text-[#EF4444] transition-colors"
                    title="删除该关键词"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={handleClearQueries}
                className="px-2 py-1 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors"
              >
                清空常用
              </button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2">
              <div className="text-[11px] text-[var(--shell-subtle)]">命中总数</div>
              <div className="text-sm font-semibold text-[var(--shell-text-strong)]">{resultStats.total}</div>
            </div>
            <div className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2">
              <div className="text-[11px] text-[var(--shell-subtle)]">未完成数</div>
              <div className="text-sm font-semibold text-[var(--shell-accent)]">{resultStats.incomplete}</div>
            </div>
            <div className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2">
              <div className="text-[11px] text-[var(--shell-subtle)]">有具体时间</div>
              <div className="text-sm font-semibold text-[#10B981]">{resultStats.withTime}</div>
            </div>
            <div className="rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2">
              <div className="text-[11px] text-[var(--shell-subtle)]">完成率</div>
              <div className="text-sm font-semibold text-[#60A5FA]">{resultStats.completionRate}%</div>
            </div>
          </div>
          {!!keyword.trim() && monthlyDistribution.length > 0 && (
            <div className="mt-2 rounded-md border border-[var(--shell-border-subtle)] bg-[var(--shell-input-deep)] px-3 py-2">
              <div className="text-[11px] text-[var(--shell-subtle)] mb-1">按月命中分布（最近 6 个月）</div>
              <div className="flex flex-wrap gap-2">
                {monthlyDistribution.map(([month, count]) => (
                  <span
                    key={month}
                    className="px-2 py-1 text-xs rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)]"
                  >
                    {month}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!keyword.trim() && (
            <p className="text-sm text-[var(--shell-subtle)] py-8 text-center">输入关键词即可搜索全部历史事件</p>
          )}
          {!!keyword.trim() && results.length === 0 && (
            <p className="text-sm text-[var(--shell-subtle)] py-8 text-center">没有命中结果，请换个关键词试试</p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => onJumpToDate(item.date)}
              className="w-full text-left mb-2 px-3 py-2 rounded-lg border border-[var(--shell-border-subtle)] hover:bg-[var(--shell-list-hover)] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--shell-text-strong)] font-medium">{renderHighlightedTitle(item.title)}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToTodayPlan(item.title);
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)] transition-colors"
                    title="加入今日计划"
                  >
                    加入今日计划
                  </button>
                  <div className={`text-xs ${item.completed ? 'text-[#10B981]' : 'text-[var(--shell-accent)]'}`}>
                    {item.completed ? '已完成' : '未完成'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-[var(--shell-text-muted)] mt-1">
                时间：{item.date} {item.time ?? '无具体时刻'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
