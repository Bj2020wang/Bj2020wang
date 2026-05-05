export type MobileMainTab = 'todo' | 'calendar' | 'stats' | 'search';

interface MobileBottomNavProps {
  active: MobileMainTab;
  onChange: (tab: MobileMainTab) => void;
}

const ITEMS: { id: MobileMainTab; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'calendar', label: '月历' },
  { id: 'stats', label: '统计' },
  { id: 'search', label: '搜索' },
];

export default function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  return (
    <nav
      className="flex shrink-0 border-t border-[var(--shell-border-subtle)] bg-[var(--shell-bg)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      aria-label="主导航"
    >
      {ITEMS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="relative flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1"
          >
            <span
              className={`h-0.5 w-7 rounded-full transition-colors ${isActive ? 'bg-[var(--shell-accent)]' : 'bg-transparent'}`}
              aria-hidden
            />
            <span
              className={`text-base font-medium leading-tight ${isActive ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)]'}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
