import { ArrowLeftRight, X } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtNum } from '@/shared/utils/ui-utils';
import { forLabel, shortUnit, type ExerciseStep, type ForMode, type RestStep, type Step } from '../model';

const FOR_OPTIONS = [
  { value: 'seconds', label: 'seconds' },
  { value: 'reps', label: 'reps' },
  { value: 'minutes', label: 'minutes' },
] as const satisfies readonly { value: ForMode; label: string }[];

const REST_OPTIONS = [
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
] as const;

const REST_PICKS = [15, 30, 45, 60, 90, 120];

export interface StepRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  step: Step;
  expanded: boolean;
  onToggle: () => void;
  onChange: (step: Step) => void;
  onRemove: () => void;
  /** Tap on the name while expanded; opens the exercise picker upstream. */
  onSwap?: () => void;
  /** Visual state while the row is lifted by a drag. */
  lifted?: boolean;
  /** Visual state while another row hovers over this one to group. */
  groupTarget?: boolean;
  /** Small grey line under the name when collapsed, e.g. "last time 17.5". */
  hint?: string;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * One line of the runsheet. Collapsed: thumb, name, duration, value pill, caret, ✕ — the whole
 * row toggles. Expanded (stays white so it reads as part of its block; the controls sit on a grey
 * well): bigger clip, the name becomes the swap target, then two
 * settings rows: Weight (unit in the label) with a stepper, and For with a stepper plus a
 * seconds / reps / minutes dropdown. Rest steps show quick-pick chips instead of a weight row.
 * Pure: every change is handed back through onChange.
 */
export const StepRow = forwardRef<HTMLDivElement, StepRowProps>(({ step, expanded, onToggle, onChange, onRemove, onSwap, lifted, groupTarget, hint, className, ...rest }, ref) => {
  const isRest = step.kind === 'rest';
  const shell = cn(
    'relative bg-surface transition-[box-shadow,transform] duration-150 select-none',
    lifted && 'rotate-[-0.6deg] scale-[1.03] shadow-lift',
    className
  );

  const removeBtn = (
    <Button variant="quiet" size="icon-sm" aria-label="Remove step" onClick={e => (stop(e), onRemove())} onPointerDown={stop} className={cn('text-hint', expanded && 'text-faint')}>
      <X />
    </Button>
  );

  if (!expanded) {
    return (
      <div ref={ref} role="button" tabIndex={0} aria-expanded={false} onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()} className={cn(shell, 'flex items-center gap-2.5 py-2 pr-2 pl-3')} {...rest}>
        {isRest ? <ClipThumb variant="rest" /> : <ClipThumb clip={step.exercise.clip} poster={step.exercise.poster} icon={step.exercise.icon} />}
        <div className="min-w-0 flex-1">
          <div className={cn('line-clamp-2 text-[14.5px] leading-tight font-semibold', isRest && 'text-body')}>{isRest ? 'Rest' : step.exercise.name}</div>
          <div className="text-[12px] text-muted">{groupTarget ? <span className="font-bold text-brand-ink">Release to make a block</span> : isRest ? 'step' : (hint ?? forLabel(step))}</div>
        </div>
        <Chip variant="value">{isRest ? `${step.seconds}s` : step.target !== undefined ? `${fmtNum(step.target)} ${shortUnit(step.exercise.unit)}` : forLabel(step)}</Chip>
        {removeBtn}
      </div>
    );
  }

  return (
    <div ref={ref} className={shell} {...rest}>
      <div role="button" tabIndex={0} aria-expanded onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()} className="flex items-center gap-3 px-3 pt-3 pb-1">
        {isRest ? <ClipThumb variant="rest" size="lg" className="size-14 text-[20px]" /> : <ClipThumb size="lg" className="size-14" clip={step.exercise.clip} poster={step.exercise.poster} icon={step.exercise.icon} />}
        <div className="min-w-0 flex-1">
          {isRest ? (
            <>
              <div className="text-[15px] font-semibold text-body">Rest</div>
              <div className="text-[12px] text-muted">between steps</div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={e => (stop(e), onSwap?.())}
                onPointerDown={stop}
                aria-label={`${step.exercise.name}, tap to change exercise`}
                className="flex h-10 w-full items-center gap-2 rounded-control border border-line bg-surface pr-2 pl-3 text-left shadow-xs active:bg-line-soft"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{step.exercise.name}</span>
                <ArrowLeftRight className="size-4 shrink-0 text-brand" />
              </button>
              <div className="mt-1 text-[12px] text-muted">Tap to swap exercise</div>
            </>
          )}
        </div>
        {removeBtn}
      </div>
      <div className="mx-2 mb-2 space-y-2.5 rounded-control bg-canvas px-3 py-3" onPointerDown={stop} onClick={stop}>
        {isRest ? <RestBody step={step} onChange={onChange} /> : <ExerciseBody step={step} onChange={onChange} />}
        <div className="text-[12px] text-muted">Tap the header to close</div>
      </div>
    </div>
  );
});
StepRow.displayName = 'StepRow';

const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[14px] text-ink">{children}</div>;

const ExerciseBody = ({ step, onChange }: { step: ExerciseStep; onChange: (s: Step) => void }) => (
  <>
    {step.exercise.unit && (
      <div className="flex items-center justify-between gap-3">
        <Label>
          Weight <span className="text-muted">({step.exercise.unit})</span>
        </Label>
        <Stepper aria-label="Weight" value={step.target ?? 0} step={step.exercise.step} onChange={target => onChange({ ...step, target })} />
      </div>
    )}
    {step.exercise.unit === 'kph' && (
      <div className="flex items-center justify-between gap-3">
        <Label>Incline</Label>
        <Stepper aria-label="Incline" value={step.incline ?? 0} step={1} max={30} onChange={incline => onChange({ ...step, incline })} />
      </div>
    )}
    <div className="flex items-center justify-between gap-3">
      <Label>For</Label>
      <div className="flex items-center gap-1.5">
        <Stepper aria-label="Duration" value={step.forValue} step={step.forMode === 'seconds' ? 5 : 1} min={1} max={step.forMode === 'seconds' ? 600 : 200} onChange={forValue => onChange({ ...step, forValue })} />
        <Dropdown aria-label="Duration unit" value={step.forMode} options={FOR_OPTIONS} onValueChange={forMode => onChange({ ...step, forMode, forValue: defaultFor(forMode) })} />
      </div>
    </div>
  </>
);
const defaultFor = (m: ForMode) => (m === 'seconds' ? 30 : m === 'reps' ? 10 : 5);

const RestBody = ({ step, onChange }: { step: RestStep; onChange: (s: Step) => void }) => {
  const minutes = step.seconds % 60 === 0 && step.seconds >= 60;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {REST_PICKS.map(n => (
          <Chip key={n} variant={n === step.seconds ? 'on' : 'outline'} onClick={() => onChange({ ...step, seconds: n })}>
            {n}
          </Chip>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted">Or set exactly</span>
        <div className="flex items-center gap-1.5">
          <Stepper aria-label="Rest length" value={minutes ? step.seconds / 60 : step.seconds} step={minutes ? 1 : 5} min={minutes ? 1 : 5} max={minutes ? 30 : 600} onChange={v => onChange({ ...step, seconds: minutes ? v * 60 : v })} />
          <Dropdown aria-label="Rest unit" value={minutes ? 'minutes' : 'seconds'} options={REST_OPTIONS} onValueChange={u => onChange({ ...step, seconds: u === 'minutes' ? Math.max(60, Math.round(step.seconds / 60) * 60) : step.seconds })} />
        </div>
      </div>
    </>
  );
};
