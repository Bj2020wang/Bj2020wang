import { useRef, useState } from 'react';
import { Plus, Settings, Pencil, Trash2, Check, X } from 'lucide-react';
import type { TodoItem, ViewType, TodoCategory } from '@/types';
import { getWeekDays, formatDateKey } from '@/lib/calendar-utils';

interface TodoSidebarProps {
  todos: TodoItem[];
  viewType: ViewType;
  currentDate: Date;
  filteredTodos: TodoItem[];
  onDragStart: (todo: TodoItem) => void;
  onAddTodo: (text: string, category: TodoCategory) => void;
  onUpdateTodo: (id: string, text: string, category: TodoCategory) => void;
  onDeleteTodo: (id: string) => void;
  onResetLocalData: () => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  noteDateKey: string;
  noteContent: string;
  onSaveNote: (dateKey: string, note: string) => void;
}

const CATEGORY_OPTIONS: { value: TodoCategory; label: string }[] = [
  { value: 'work', label: '工作' },
  { value: 'life', label: '生活' },
  { value: 'study', label: '学习' },
  { value: 'health', label: '健康' },
];

export default function TodoSidebar({
  viewType,
  currentDate,
  filteredTodos,
  onDragStart,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onResetLocalData,
  onExportData,
  onImportData,
  noteDateKey,
  noteContent,
  onSaveNote,
}: TodoSidebarProps) {
  const [newTodoText, setNewTodoText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState<TodoCategory>('work');
  const [newTodoCategory, setNewTodoCategory] = useState<TodoCategory>('work');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TodoCategory>('all');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleDragStart = (e: React.DragEvent, todo: TodoItem) => {
    e.dataTransfer.setData('text/plain', todo.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(todo);
  };

  const addTodo = () => {
    if (newTodoText.trim()) {
      onAddTodo(newTodoText.trim(), newTodoCategory);
      setNewTodoText('');
      setIsAdding(false);
    }
  };

  const startEditTodo = (todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingText(todo.text);
    setEditingCategory(todo.category);
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
    setEditingText('');
    setEditingCategory('work');
  };

  const saveEditTodo = () => {
    if (!editingTodoId) return;
    const nextText = editingText.trim();
    if (!nextText) return;
    onUpdateTodo(editingTodoId, nextText, editingCategory);
    cancelEditTodo();
  };

  const confirmDeleteTodo = (todo: TodoItem) => {
    const confirmed = window.confirm(`确定删除任务「${todo.text}」吗？\n关联的日历事件也会一并删除。`);
    if (!confirmed) return;
    onDeleteTodo(todo.id);
  };

  // Get subtitle based on view
  const getSubtitle = (): string => {
    if (viewType === 'month') {
      return `${currentDate.getMonth() + 1}月待办`;
    }
    if (viewType === 'week') {
      const weekDays = getWeekDays(new Date(currentDate));
      const start = weekDays[0];
      const end = weekDays[6];
      return `${start.fullDate.slice(5, 7)}月${start.date}日 - ${end.fullDate.slice(5, 7)}月${end.date}日`;
    }
    const d = currentDate;
    const dateStr = formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const today = new Date();
    const todayStr = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (dateStr === todayStr) return '今日待办';
    return `${d.getMonth() + 1}月${d.getDate()}日待办`;
  };

  const getEmptyText = (): string => {
    if (viewType === 'month') return `${currentDate.getMonth() + 1}月暂无待办任务`;
    if (viewType === 'week') return '本周暂无待办任务';
    return '今日暂无待办任务';
  };

  const visibleTodos =
    categoryFilter === 'all'
      ? filteredTodos
      : filteredTodos.filter((todo) => todo.category === categoryFilter);

  return (
    <div className="w-[320px] flex-shrink-0 flex flex-col h-full bg-[#212128] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Todo</h1>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A2A32] transition-colors duration-200"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => setShowActionsMenu((prev) => !prev)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A2A32] transition-colors duration-200"
            title="更多操作"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
          {showActionsMenu && (
            <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-[#2E2E36] bg-[#1A1A1F] p-1 shadow-xl">
              <button
                onClick={() => {
                  onExportData();
                  setShowActionsMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs rounded-md text-[#9CA3AF] hover:bg-[#2A2A32] transition-colors"
              >
                导出数据
              </button>
              <button
                onClick={() => {
                  importInputRef.current?.click();
                  setShowActionsMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs rounded-md text-[#9CA3AF] hover:bg-[#2A2A32] transition-colors"
              >
                导入数据
              </button>
              <button
                onClick={() => {
                  onResetLocalData();
                  setShowActionsMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs rounded-md text-[#EF4444] hover:bg-[#2A2A32] transition-colors"
              >
                清空本地 / 恢复默认
              </button>
            </div>
          )}
        </div>
      </div>

      {/* View subtitle */}
      <div className="text-sm text-[#6B7280] mb-3">{getSubtitle()}</div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-2 py-1 text-xs rounded-md border transition-colors ${
            categoryFilter === 'all'
              ? 'border-[#D4A853] text-[#D4A853]'
              : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
          }`}
        >
          全部
        </button>
        {CATEGORY_OPTIONS.map((item) => (
          <button
            key={item.value}
            onClick={() => setCategoryFilter(item.value)}
            className={`px-2 py-1 text-xs rounded-md border transition-colors ${
              categoryFilter === item.value
                ? 'border-[#D4A853] text-[#D4A853]'
                : 'border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Add Todo Input */}
      {isAdding && (
        <div className="mb-4">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="输入新任务..."
            className="w-full px-3 py-2 bg-[#1A1A1F] border border-[#2E2E36] rounded-lg text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <select
              value={newTodoCategory}
              onChange={(e) => setNewTodoCategory(e.target.value as TodoCategory)}
              className="px-2 py-1 bg-[#1A1A1F] border border-[#2E2E36] rounded-md text-[#9CA3AF] text-xs focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              onClick={addTodo}
              className="px-3 py-1 bg-[#D4A853] text-black text-xs font-medium rounded-md hover:bg-[#C49A4A] transition-colors"
            >
              添加
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1 bg-[#2E2E36] text-[#9CA3AF] text-xs rounded-md hover:bg-[#3A3A44] transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Todo List - filtered by view */}
      <div className="flex-1 overflow-y-auto">
        {visibleTodos.length === 0 && (
          <p className="text-sm text-[#6B7280] text-center py-8">{getEmptyText()}</p>
        )}
        {visibleTodos.map((todo) => (
          (() => {
            const count = todo.count ?? 0;
            const isEmptyCount = todo.count === null;
            const canDrag = isEmptyCount || count > 0;
            const isMuted = !canDrag && !isEmptyCount;
            return (
          <div
            key={todo.id}
            draggable={editingTodoId !== todo.id && canDrag}
            onDragStart={(e) => editingTodoId !== todo.id && canDrag && handleDragStart(e, todo)}
            className={`
              flex items-center gap-2 mb-3 group transition-opacity
              ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}
              ${isMuted ? 'opacity-40' : ''}
            `}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
              style={{ backgroundColor: canDrag || isEmptyCount ? todo.color : '#4B5563' }}
            />
            {editingTodoId === todo.id ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditTodo();
                    if (e.key === 'Escape') cancelEditTodo();
                  }}
                  className="w-full px-2 py-1 bg-[#1A1A1F] border border-[#2E2E36] rounded text-white text-sm focus:outline-none focus:border-[#D4A853]"
                  autoFocus
                />
                <select
                  value={editingCategory}
                  onChange={(e) => setEditingCategory(e.target.value as TodoCategory)}
                  className="px-2 py-1 bg-[#1A1A1F] border border-[#2E2E36] rounded text-[#9CA3AF] text-xs focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveEditTodo}
                  className="p-1 rounded hover:bg-[#2A2A32]"
                  title="保存"
                >
                  <Check className="w-4 h-4 text-[#10B981]" />
                </button>
                <button
                  onClick={cancelEditTodo}
                  className="p-1 rounded hover:bg-[#2A2A32]"
                  title="取消"
                >
                  <X className="w-4 h-4 text-[#9CA3AF]" />
                </button>
              </div>
            ) : (
              <span className={`text-[15px] leading-relaxed flex-1 ${canDrag || isEmptyCount ? 'text-white' : 'text-[#6B7280] line-through'}`}>
                {todo.text}
              </span>
            )}
            {/* Count badge */}
            <span className={`
              text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0
              ${isEmptyCount
                ? 'bg-[#2E2E36] text-transparent'
                : count > 1
                ? 'bg-[#D4A853] text-black'
                : count === 1
                  ? 'bg-[#2E2E36] text-[#9CA3AF]'
                  : 'bg-[#2E2E36] text-[#4B5563]'
              }
            `}>
              {isEmptyCount ? 'x' : `x${count}`}
            </span>
            {editingTodoId !== todo.id && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEditTodo(todo)}
                  className="p-1 rounded hover:bg-[#2A2A32]"
                  title="编辑任务"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#9CA3AF]" />
                </button>
                <button
                  onClick={() => confirmDeleteTodo(todo)}
                  className="p-1 rounded hover:bg-[#2A2A32]"
                  title="删除任务"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#EF4444]" />
                </button>
              </div>
            )}
          </div>
            );
          })()
        ))}
      </div>

      {/* Footer Tip */}
      <div className="mt-4 pt-4 border-t border-[#2E2E36]">
        <p className="text-[13px] text-[#6B7280]">按住圆点可拖动到右侧日历规划日程</p>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportData(file);
            e.currentTarget.value = '';
          }}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-[#2E2E36]">
        <div className="text-sm text-white mb-2">笔记（{noteDateKey}）</div>
        <textarea
          key={noteDateKey}
          ref={noteInputRef}
          defaultValue={noteContent}
          placeholder="写下今天的工作日记、笔记或感悟..."
          className="w-full min-h-[92px] px-3 py-2 bg-[#1A1A1F] border border-[#2E2E36] rounded-lg text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853] resize-y"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onSaveNote(noteDateKey, noteInputRef.current?.value ?? '')}
            className="flex-1 px-3 py-2 text-xs rounded-md bg-[#D4A853] text-black font-medium hover:bg-[#C49A4A] transition-colors"
          >
            保存笔记
          </button>
          <button
            onClick={() => {
              if (noteInputRef.current) noteInputRef.current.value = '';
              onSaveNote(noteDateKey, '');
            }}
            className="flex-1 px-3 py-2 text-xs rounded-md border border-[#3E3E48] text-[#9CA3AF] hover:bg-[#2A2A32] transition-colors"
          >
            清空笔记
          </button>
        </div>
      </div>
    </div>
  );
}
