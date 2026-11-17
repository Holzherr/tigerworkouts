import { cn } from '@/shared/utils/ui-utils';
import type { ExerciseStep, Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult, StepResult } from '@/features/runsheet/progression';
import { ruled } from '@/features/runsheet/targets';
import { modeFor, suggestOn, type SuggestPrefs } from '../suggestions';

const isWorking = (x: SetResult) => x.type !== 'warmup' && x.type !== 'drop';
const steps = (r: Runsheet): ExerciseStep[] => r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** The exercises to ask about: progressed by effort, in the main work, not moved by a programme's
 * rules, and logged in sets this session. In workout order, once each. Port of `LiftEffortCard.lifts`. */
export const effortLifts = (r: Runsheet, rows: StepResult[], suggest: SuggestPrefs | undefined): { key: string; name: string }[] => {
  if (!suggestOn(suggest, r)) return [];
  const seen = new Set<string>();
  return steps(r).flatMap(s => {
    const key = s.exercise.key;
    if (modeFor(suggest, key) !== 'effort' || (s.role ?? 'main') !== 'main' || ruled(r, s) || seen.has(key)) return [];
    if (!rows.some(x => x.exerciseKey === key && (x.sets ?? []).some(y => isWorking(y) && (y.reps ?? 0) > 0))) return [];
    seen.add(key);
    return [{ key, name: s.exercise.name }];
  });
};

/** The rows with `rpe` on every working set of the exercise (undefined clears it). */
export const ratedRows = (rows: StepResult[], key: string, rpe: number | undefined): StepResult[] =>
  rows.map(row => {
    if (row.exerciseKey !== key || !row.sets) return row;
    return { ...row, sets: row.sets.map(x => (isWorking(x) ? (rpe === undefined ? (({ rpe: _, ...rest }) => rest)(x) : { ...x, rpe }) : x)) };
  });

export const liftRpe = (rows: SessionResult['steps'], key: string): number | undefined => {
  const all = rows.filter(x => x.exerciseKey === key).flatMap(x => x.sets ?? []).map(x => x.rpe).filter((n): n is number => n !== undefined);
  return all.length ? Math.max(...all) : undefined;
};

/**
 * How hard each lift was, RPE 1–10, on the finish screen: only for lifts progressed by effort,
 * whose next target reads it. Written onto every working set of that exercise in the session.
 */
export const LiftEffortCard = ({ lifts, rows, onRate }: { lifts: { key: string; name: string }[]; rows: StepResult[]; onRate: (key: string, rpe: number | undefined) => void }) =>
  lifts.length ? (
    <section aria-label="How hard was each lift?" className="space-y-3 rounded-card border border-line bg-surface px-3 py-2.5">
      <div>
        <div className="text-[13px] font-bold">How hard was each lift?</div>
        <div className="text-[12px] text-muted">RPE: 10 is nothing left, 7 is three more reps in the tank. Weight goes up once it is 7 or less.</div>
      </div>
      {lifts.map(lift => {
        const value = liftRpe(rows, lift.key);
        return (
          <div key={lift.key}>
            <div className="flex items-baseline justify-between">
              <span className="truncate text-[13px] font-semibold">{lift.name}</span>
              <span className="text-[12px] text-muted">{value ? `RPE ${value}` : 'Tap 1–10'}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" aria-label={`${lift.name} RPE ${n}`} aria-pressed={value === n} onClick={() => onRate(lift.key, value === n ? undefined : n)} className={cn('h-11 rounded-control text-[15px] font-bold tabular-nums transition-colors', value === n ? 'bg-ink text-surface' : 'bg-line-soft text-ink active:bg-line')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  ) : null;
