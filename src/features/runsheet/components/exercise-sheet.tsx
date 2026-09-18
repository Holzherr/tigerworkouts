import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { forLabel, shortUnit, type ExerciseStep } from '@/features/runsheet/model';

export interface ExerciseSheetProps {
  step: ExerciseStep | null;
  onOpenChange: (open: boolean) => void;
  /** Weight or speed, in the exercise's own unit. Omit to show the number without a stepper. */
  onTarget?: (target: number) => void;
  onIncline?: (incline: number) => void;
  /** Effective values when a session is running and the plan has been adjusted. */
  target?: number;
  incline?: number;
  /** Line under the steppers, e.g. "applies from here on". */
  note?: string;
}

const isTreadmill = (s: ExerciseStep) => s.exercise.unit === 'kph' || s.incline !== undefined;

/**
 * One exercise, opened from anywhere it is listed: the clip, the coaching cue, and the numbers
 * as steppers rather than text. There is no separate edit mode — if a screen passes a handler
 * the value is editable where you are reading it.
 */
export const ExerciseSheet = ({ step: s, onOpenChange, onTarget, onIncline, target, incline, note }: ExerciseSheetProps) => (
  <Sheet open={!!s} onOpenChange={onOpenChange} title={s?.exercise.name}>
    {s && (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <ClipThumb size="lg" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{forLabel(s)}</div>
            {s.exercise.cue && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.exercise.cue}</p>}
          </div>
        </div>
        {s.exercise.unit && s.exercise.unit !== 'reps' && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
            <span className="text-[15px] font-semibold">
              {s.exercise.unit === 'kph' ? 'Speed' : 'Weight'} <span className="font-normal text-muted">({shortUnit(s.exercise.unit)})</span>
            </span>
            {onTarget ? (
              <Stepper aria-label="Target" value={target ?? s.target ?? 0} step={s.exercise.step} onChange={onTarget} />
            ) : (
              <span className="text-[17px] font-extrabold tabular-nums">{target ?? s.target ?? '—'}</span>
            )}
          </div>
        )}
        {isTreadmill(s) && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
            <span className="text-[15px] font-semibold">Incline</span>
            {onIncline ? (
              <Stepper aria-label="Incline" value={incline ?? s.incline ?? 0} step={1} min={0} max={30} onChange={onIncline} />
            ) : (
              <span className="text-[17px] font-extrabold tabular-nums">{incline ?? s.incline ?? 0}</span>
            )}
          </div>
        )}
        {note && <p className="text-[12px] text-muted">{note}</p>}
      </div>
    )}
  </Sheet>
);
