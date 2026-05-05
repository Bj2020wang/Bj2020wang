import type { ViewType } from '@/types';

interface MobileViewSegmentProps {
  viewType: ViewType;
  onSelect: (next: ViewType) => void;
  className?: string;
  /** full：顶栏横向铺满；header：与 compact 同字号，右对齐（日历/统计顶栏）；compact：Todo 底栏居中 */
  variant?: 'full' | 'header' | 'compact';
}

export default function MobileViewSegment({
  viewType,
  onSelect,
  className,
  variant = 'full',
}: MobileViewSegmentProps) {
  const compact = variant === 'compact';
  const header = variant === 'header';

  const btn = (vt: ViewType, label: string) => (
    <button
      key={vt}
      type="button"
      onClick={() => onSelect(vt)}
      className={`
        font-medium transition-colors duration-200
        ${
          header || compact
            ? 'flex-none rounded-lg border px-2.5 py-1.5 text-sm leading-snug'
            : 'min-w-0 flex-1 rounded-lg border px-2 py-2.5 text-sm md:text-xs'
        }
        ${
          viewType === vt
            ? 'border-[var(--shell-accent)] text-[var(--shell-accent)] bg-transparent'
            : 'border-[var(--shell-border)] text-[var(--shell-text-muted)] hover:bg-[var(--shell-surface-hover)]'
        }
      `}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`flex ${header ? 'justify-end gap-1' : compact ? 'flex-wrap justify-center gap-1' : 'gap-1.5'} ${className ?? ''}`}
    >
      {btn('today', 'Today')}
      {btn('week', 'Week')}
      {btn('month', 'Month')}
      {btn('year', 'Year')}
    </div>
  );
}
