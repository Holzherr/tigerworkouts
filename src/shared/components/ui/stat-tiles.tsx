import { cn } from '@/shared/utils/ui-utils';

export interface Stat {
  value: string | number;
  label: string;
}

export interface StatTilesProps {
  stats: readonly Stat[];
  className?: string;
}

/** Row of equal white tiles: big tabular number over an 11px label. Three across on a phone. */
export const StatTiles = ({ stats, className }: StatTilesProps) => (
  <div className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
    {stats.map(s => (
      <div key={s.label} className="rounded-card border border-line bg-surface px-3 py-2.5 text-center">
        <div className="text-[20px] font-black tabular-nums">{s.value}</div>
        <div className="text-[11px] text-muted">{s.label}</div>
      </div>
    ))}
  </div>
);
