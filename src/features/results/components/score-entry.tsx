import { Chip } from '@/shared/components/ui/chip';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn } from '@/shared/utils/ui-utils';
import type { ScoreType } from '@/features/runsheet/model';

export interface ScoreEntryProps {
  type: ScoreType;
  /** time: seconds · rounds: rounds + reps/1000 · reps/load/distance: the number */
  value?: number;
  onChange: (value: number | undefined) => void;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The one control that records a workout's score, shaped by its score type: a mm:ss field for
 * time, two steppers for AMRAP rounds and reps, a single big stepper for total reps, kg or metres.
 * Nothing for unscored workouts.
 */
export const ScoreEntry = ({ type, value, onChange, className }: ScoreEntryProps) => {
  if (type === 'none') return null;
  if (type === 'time') {
    const v = value ?? 0;
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return (
      <div className={cn('flex items-center justify-between gap-3', className)}>
        <span className="text-[14px]">Time</span>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Minutes and seconds"
            placeholder="mm:ss"
            defaultValue={value !== undefined ? `${m}:${pad(s)}` : ''}
            onBlur={e => {
              const mm = e.target.value.match(/^(\d+)[:.](\d{1,2})$/) ?? e.target.value.match(/^(\d+)$/);
              onChange(mm ? Number(mm[1]) * 60 + Number(mm[2] ?? 0) : undefined);
            }}
            className="h-11 w-24 rounded-control border border-line bg-surface px-3 text-center text-[17px] font-bold tabular-nums outline-none focus:border-hint"
          />
        </div>
      </div>
    );
  }
  if (type === 'rounds') {
    const rounds = Math.floor(value ?? 0);
    const reps = Math.round(((value ?? 0) % 1) * 1000);
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Rounds</span>
          <Stepper aria-label="Rounds" value={rounds} min={0} max={200} onChange={r => onChange(r + reps / 1000)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">
            + reps <span className="text-muted">(into the next round)</span>
          </span>
          <Stepper aria-label="Extra reps" value={reps} min={0} max={999} onChange={r => onChange(rounds + r / 1000)} />
        </div>
      </div>
    );
  }
  const label = type === 'reps' ? 'Total reps' : type === 'load' ? 'Load (kg)' : 'Distance (m)';
  const step = type === 'load' ? 2.5 : type === 'distance' ? 50 : 1;
  const quick = type === 'distance' ? [1000, 1600, 2000, 2400, 3000] : [];
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px]">{label}</span>
        <Stepper aria-label={label} value={value ?? 0} step={step} min={0} max={99999} onChange={onChange} />
      </div>
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map(q => (
            <Chip key={q} variant={q === value ? 'on' : 'outline'} onClick={() => onChange(q)}>
              {q} m
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
};
