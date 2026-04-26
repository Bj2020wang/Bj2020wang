import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent } from '@/types';

interface GlobalSearchPanelProps {
  events: CalendarEvent[];
  onClose: () => void;
  onJumpToDate: (dateStr: string) => void;
}

interface SearchResultItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  completed: boolean;
}

export default function GlobalSearchPanel({ events, onClose, onJumpToDate }: GlobalSearchPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

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

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="flex h-[min(85vh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2E2E36] bg-[#1A1A1F] shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-[#2E2E36]">
          <div>
            <h2 className="text-lg text-white font-semibold">全局关键词搜索</h2>
            <p className="text-xs text-[#9CA3AF] mt-1">在所有日历事件中按关键词搜索，并显示具体日期时间（默认不限日期）</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[#2A2A32] flex items-center justify-center"
            title="关闭搜索"
          >
            <X className="w-4 h-4 text-[#9CA3AF]" />
          </button>
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-b border-[#2E2E36]">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词（如：走访企业）"
            className="w-full px-3 py-2 bg-[#111115] border border-[#2E2E36] rounded-lg text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
          />
          <button
            onClick={() => setShowIncompleteOnly((prev) => !prev)}
            className={`mt-2 px-3 py-2 text-xs rounded-md border transition-colors ${
              showIncompleteOnly
                ? 'border-[#D4A853] text-[#D4A853]'
                : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
            }`}
          >
            {showIncompleteOnly ? '仅看未完成：已开启' : '仅看未完成：已关闭'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!keyword.trim() && (
            <p className="text-sm text-[#6B7280] py-8 text-center">输入关键词即可搜索全部历史事件</p>
          )}
          {!!keyword.trim() && results.length === 0 && (
            <p className="text-sm text-[#6B7280] py-8 text-center">没有命中结果，请换个关键词试试</p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => onJumpToDate(item.date)}
              className="w-full text-left mb-2 px-3 py-2 rounded-lg border border-[#2E2E36] hover:bg-[#23232B] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white font-medium">{item.title}</div>
                <div className={`text-xs ${item.completed ? 'text-[#10B981]' : 'text-[#D4A853]'}`}>
                  {item.completed ? '已完成' : '未完成'}
                </div>
              </div>
              <div className="text-xs text-[#9CA3AF] mt-1">
                时间：{item.date} {item.time ?? '无具体时刻'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
