import { cn } from '@/shared/utils/ui-utils';

export interface Stat {
  value: string | number;
  label: string;
  /** Makes the tile a button. */
  onClick?: () => void;
}

export interface StatTilesProps {
  stats: readonly Stat[];
  className?: string;
}

/** Row of equal white tiles: big tabular number over an 11px label. Three across on a phone. A tile with onClick renders as a button. */
export const StatTiles = ({ stats, className }: StatTilesProps) => (
  <div className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
    {stats.map(s => {
      const inner = (
        <>
          <div className="text-[20px] font-black tabular-nums">{s.value}</div>
          <div className="text-[11px] text-muted">{s.label}</div>
        </>
      );
      const cls = 'rounded-card border border-line bg-surface px-3 py-2.5 text-center';
      return s.onClick ? (
        <button key={s.label} type="button" onClick={s.onClick} className={cn(cls, 'active:bg-line-soft')}>
          {inner}
        </button>
      ) : (
        <div key={s.label} className={cls}>
          {inner}
        </div>
      );
    })}
  </div>
);
