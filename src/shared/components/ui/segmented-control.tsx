import { cn } from '@/shared/utils/ui-utils';

export interface SegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label'?: string;
  className?: string;
}

/**
 * Equal-width tabs in a grey track; the selected one is a white pill with a hairline shadow.
 * 36px tall with optional icons. Used for Saved / For you / Search on the home feed.
 */
export const SegmentedControl = <T extends string>({ options, value, onChange, className, 'aria-label': ariaLabel }: SegmentedControlProps<T>) => (
  <div role="tablist" aria-label={ariaLabel} className={cn('grid rounded-tile bg-line-soft p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
    {options.map(o => (
      <button key={o.id} role="tab" aria-selected={value === o.id} type="button" onClick={() => onChange(o.id)} className={cn('flex h-9 items-center justify-center gap-1.5 rounded-control text-[13px] font-bold transition-colors [&_svg]:size-4', value === o.id ? 'bg-surface text-ink shadow-xs' : 'text-muted')}>
        {o.icon}
        {o.label}
      </button>
    ))}
  </div>
);
