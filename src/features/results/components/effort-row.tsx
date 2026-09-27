import { cn } from '@/shared/utils/ui-utils';
import { effortWord } from '../celebrate';

export interface EffortRowProps {
  value?: number;
  /** Tapping the chosen number again clears it. */
  onChange: (rpe: number | undefined) => void;
  className?: string;
}

/**
 * "How hard was it?" and ten numbered buttons in one row, 1 to 10. One tap sets it; the chosen
 * button fills ink and the word for its band (Easy, Moderate, Hard, All out) shows beside the label.
 */
export const EffortRow = ({ value, onChange, className }: EffortRowProps) => (
  <section className={cn('rounded-card border border-line bg-surface px-3 py-2.5', className)} aria-label="Effort">
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] font-bold">How hard was it?</span>
      <span className="text-[12px] text-muted">{value ? `${value} · ${effortWord(value)}` : 'Tap 1–10'}</span>
    </div>
    <div className="mt-2 grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          aria-label={`Effort ${n}`}
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? undefined : n)}
          className={cn('h-11 rounded-control text-[15px] font-bold tabular-nums transition-colors', value === n ? 'bg-ink text-white' : 'bg-line-soft text-ink active:bg-line')}
        >
          {n}
        </button>
      ))}
    </div>
  </section>
);
