import { Stepper } from '@/shared/components/ui/stepper';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import type { ExerciseRef, ExerciseStep, Runsheet } from '@/features/runsheet/model';
import { resolveTarget, type TrainingMaxes } from '@/features/runsheet/progression';

export interface TrainingMaxSheetProps {
  /** Exercises to show; defaults to every % TM exercise in `runsheet`. */
  exercises?: ExerciseRef[];
  runsheet?: Runsheet;
  values: TrainingMaxes;
  onChange: (values: TrainingMaxes) => void;
  bodyweightKg?: number;
  onBodyweightChange?: (kg: number) => void;
}

const pctSteps = (r?: Runsheet): ExerciseStep[] => (r ? r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise' && (s.targetPct !== undefined || s.loadFactor !== undefined)) : []);

/**
 * Where a user sets the numbers percentage-based programs run on: one row per lift with a kg
 * stepper for the training max, and a bodyweight row when any step is × bodyweight. Under each
 * row, the loads today's percentages resolve to, so the effect is visible while adjusting.
 */
export const TrainingMaxSheet = ({ exercises, runsheet, values, onChange, bodyweightKg, onBodyweightChange }: TrainingMaxSheetProps) => {
  const steps = pctSteps(runsheet);
  const list = exercises ?? [...new Map(steps.filter(s => s.targetPct !== undefined).map(s => [s.exercise.key, s.exercise])).values()];
  const needsBw = steps.some(s => s.loadFactor !== undefined);
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted">Training max is the number the program's percentages are taken from, usually 90% of your best single.</p>
      {needsBw && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2">
          <span className="text-[14px] font-semibold">Bodyweight <span className="font-normal text-muted">(kg)</span></span>
          <Stepper aria-label="Bodyweight" value={bodyweightKg ?? 0} step={0.5} min={0} max={250} onChange={v => onBodyweightChange?.(v)} />
        </div>
      )}
      {list.map(ex => {
        const mine = steps.filter(s => s.exercise.key === ex.key && s.targetPct !== undefined);
        const pcts = [...new Set(mine.map(s => s.targetPct))].sort((a, b) => (a ?? 0) - (b ?? 0));
        return (
          <div key={ex.key} className="rounded-card border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2.5">
              <ClipThumb size="sm" clip={ex.clip} poster={ex.poster} icon={ex.icon} />
              <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ex.name}</div>
              <Stepper aria-label={`${ex.name} training max`} value={values[ex.key] ?? 0} step={ex.step || 2.5} min={0} max={500} onChange={v => onChange({ ...values, [ex.key]: v })} />
            </div>
            {pcts.length > 0 && values[ex.key] !== undefined && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
                {pcts.map(p => (
                  <span key={p}>
                    {p}% → <b className="text-ink">{resolveTarget({ ...mine[0], targetPct: p }, values, bodyweightKg)} kg</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {list.length === 0 && !needsBw && <div className="py-6 text-center text-[13px] text-muted">This workout uses absolute loads; nothing to set.</div>}
    </div>
  );
};
