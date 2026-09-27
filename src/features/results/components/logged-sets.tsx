import { useState } from 'react';
import { measureOf, nextSetType, setMarks, shortUnit, type ExerciseRef } from '@/features/runsheet/model';
import type { SetResult, StepResult } from '@/features/runsheet/progression';
import { SetMark } from '@/features/runsheet/components/set-grid';
import { cn, fmtClock } from '@/shared/utils/ui-utils';
import type { SetPatch } from '../edit-sets';
import { setLabel, setsOf } from '../logbook';

type Field = 'load' | 'reps' | 'seconds' | 'meters' | 'calories';

/** The numbers a row's sets are edited in: what any set has, plus what the exercise counts in. */
export const fieldsFor = (sets: SetResult[], unit: string): Field[] => {
  const has = (f: Field) => sets.some(x => x[f] !== undefined);
  const measure = measureOf(unit);
  const out: Field[] = [];
  if (has('load') || (unit && unit !== 'reps' && !measure)) out.push('load');
  if (has('reps') || !(has('seconds') || has('meters') || has('calories') || measure)) out.push('reps');
  if (has('meters') || measure === 'meters') out.push('meters');
  if (has('calories') || measure === 'calories') out.push('calories');
  if (has('seconds') || measure) out.push('seconds');
  return out;
};

const HEAD: Record<Field, (unit: string) => string> = { load: u => shortUnit(u) || 'kg', reps: () => 'Reps', seconds: () => 'Sec', meters: () => 'm', calories: () => 'Cal' };

export interface LoggedSetsProps {
  row: StepResult;
  exercise: ExerciseRef;
  /** Editing: each set's numbers are inputs and its mark cycles the type. */
  editing?: boolean;
  onEdit?: (index: number, patch: SetPatch) => void;
}

/**
 * One exercise's sets in a logged session. Read: a wrapping row of pills — the set mark (1, W, D,
 * F), what was done ("60 × 8", "500 m in 1:41", "45 s") and, small and muted, when in the session
 * it was ticked. Editing: one line per set, the mark (tap to change the type) then a number box per
 * measure the row has — load, reps, metres, calories, seconds — under a heading row.
 */
export const LoggedSets = ({ row, exercise, editing, onEdit }: LoggedSetsProps) => {
  const sets = setsOf(row);
  if (!sets.length) return null;
  const marks = setMarks(sets.map(x => x.type));
  const unit = shortUnit(exercise.unit);
  if (!editing)
    return (
      <div className="flex flex-wrap gap-1.5 pl-[46px]">
        {sets.map((x, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-pill bg-line-soft px-2 py-0.5 text-[12px] tabular-nums">
            <span className={cn('font-extrabold', x.type === 'warmup' ? 'text-warn' : x.type === 'drop' ? 'text-rest' : x.type === 'failure' ? 'text-danger' : 'text-muted')}>{marks[i]}</span>
            <span className="font-semibold">{setLabel(x, measureOf(exercise.unit) ? '' : unit) || '–'}</span>
            {x.at !== undefined && <span className="text-[10px] text-faint">{fmtClock(x.at)}</span>}
          </span>
        ))}
      </div>
    );
  return <SetsEditor sets={sets} marks={marks} exercise={exercise} onEdit={onEdit} />;
};

/** The editing lines. The columns are fixed when editing starts, so clearing a box keeps it. */
const SetsEditor = ({ sets, marks, exercise, onEdit }: { sets: SetResult[]; marks: string[]; exercise: ExerciseRef; onEdit?: LoggedSetsProps['onEdit'] }) => {
  const [fields] = useState(() => fieldsFor(sets, exercise.unit));
  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };
  return (
    <div className="pl-[46px]" aria-label={`${exercise.name} sets`}>
      <div className="flex items-center gap-1.5 pb-1 text-[10px] font-bold tracking-widest text-muted uppercase">
        <span className="w-8">Set</span>
        {fields.map(f => (
          <span key={f} className="min-w-0 flex-1">
            {HEAD[f](exercise.unit)}
          </span>
        ))}
      </div>
      {sets.map((x, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5">
          <SetMark mark={marks[i]} type={x.type ?? 'normal'} label={`Set ${i + 1}`} onCycle={onEdit ? () => onEdit(i, { type: nextSetType(x.type) }) : undefined} />
          {fields.map(f => (
            <input
              key={f}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label={`Set ${i + 1} ${HEAD[f](exercise.unit)}`}
              value={x[f] ?? ''}
              onChange={e => onEdit?.(i, { [f]: num(e.target.value) })}
              className="h-9 w-0 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-[15px] font-semibold tabular-nums outline-none focus:border-hint"
            />
          ))}
        </div>
      ))}
    </div>
  );
};
