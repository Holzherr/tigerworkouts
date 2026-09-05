import { cn } from '@/shared/utils/ui-utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon: React.ReactNode;
}

export interface TabBarProps<T extends string = string> {
  items: readonly TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  className?: string;
}

/**
 * Fixed bottom navigation: three equal columns, icon over an 11px label, active one in brand
 * orange. Solid white with a top hairline (no blur, which flickered on iOS). Respects the home
 * indicator inset.
 */
export const TabBar = <T extends string>({ items, active, onSelect, className }: TabBarProps<T>) => (
  <nav className={cn('safe-bottom grid border-t border-line bg-surface', className)} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} aria-label="Main">
    {items.map(t => (
      <button
        key={t.id}
        type="button"
        onClick={() => onSelect(t.id)}
        aria-current={t.id === active ? 'page' : undefined}
        className={cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold [&_svg]:size-6', t.id === active ? 'text-brand' : 'text-muted')}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </nav>
);
