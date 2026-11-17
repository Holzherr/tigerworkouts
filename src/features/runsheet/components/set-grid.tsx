import { Button } from '@/shared/components/ui/button';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn } from '@/shared/utils/ui-utils';
import { loadStep, useStepSizes } from '@/shared/utils/step-sizes';
import { countLabel, editSet, nextSetType, plannedSet, plannedType, SET_TYPE_LABEL, setMarks, shortUnit, showsLoad, straightSetStep, withSetCount, type Block, type SetType } from '../model';
import { kitOf, type Equipment } from '../plates';
import { PlatesButton } from './plate-sheet';

export interface SetGridProps {
  block: Block;
  onChange: (block: Block) => void;
  /** Grey line under a set, e.g. last time's set of the same number. */
  hintFor?: (round: number) => string | undefined;
  /** Settings → My equipment, for the plate calculator beside a barbell load. */
  equipment?: Equipment;
}

/** The set number, or W / D / F, as a button that steps the set through the types. */
export const SetMark = ({ mark, type, label, onCycle, className }: { mark: string; type: SetType; label: string; onCycle?: () => void; className?: string }) => (
  <button
    type="button"
    disabled={!onCycle}
    aria-label={`${label}: ${SET_TYPE_LABEL[type]}. Tap to change`}
    onClick={e => {
      e.stopPropagation();
      onCycle?.();
    }}
    className={cn(
      // Drawn at 32px; the tap reaches 44px (DESIGN.md).
      "relative grid h-8 min-w-8 shrink-0 place-items-center rounded-md text-[15px] font-extrabold tabular-nums after:absolute after:-inset-1.5 after:content-['']",
      type === 'warmup' && 'bg-warn-soft text-warn',
      type === 'drop' && 'bg-well text-rest-ink',
      type === 'failure' && 'bg-danger-soft text-danger',
      className
    )}
  >
    {mark}
  </button>
);

/**
 * A straight-set block (one exercise, rounds) as the gym writes it: one row per set with its load
 * and reps, each editable on its own for pyramids and ramping sets. The set number is a button:
 * a tap steps it through warm-up (W), normal (1, 2, 3), drop set (D) and to failure (F). A barbell
 * load has a plate button beside it. The Sets stepper under the rows changes how many times the block repeats.
 */
export const SetGrid = ({ block, onChange, hintFor, equipment }: SetGridProps) => {
  useStepSizes();
  const step = straightSetStep(block);
  if (!step) return null;
  const hasLoad = showsLoad(step);
  const count = countLabel(step.forMode);
  const types = Array.from({ length: block.repeat }, (_, i) => plannedType(step, i));
  const marks = setMarks(types);
  const barbell = hasLoad && kitOf(step.exercise) === 'barbell';
  return (
    <div className="bg-surface px-3 py-2" aria-label="Sets">
      <div className="flex items-center gap-2 pb-1 text-[11px] font-bold tracking-widest text-muted uppercase">
        <span className="w-10">Set</span>
        {hasLoad && <span className="flex-1 text-center">{shortUnit(step.exercise.unit)}</span>}
        {count && <span className="flex-1 text-center">{count}</span>}
      </div>
      {Array.from({ length: block.repeat }, (_, i) => {
        const p = plannedSet(step, i);
        const hint = hintFor?.(i);
        return (
          <div key={i} className="border-t border-line-soft py-1.5">
            <div className="flex items-center gap-2">
              <div className="w-10">
                <SetMark mark={marks[i]} type={types[i]} label={`Set ${i + 1}`} onCycle={() => onChange(editSet(block, i, { type: nextSetType(types[i]) }))} />
              </div>
              {hasLoad && (
                <div className="flex flex-1 items-center justify-center">
                  <Stepper size="sm" aria-label={`Set ${i + 1} load`} value={p.load ?? 0} step={loadStep(step.exercise)} max={1000} onChange={load => onChange(editSet(block, i, { load }))} />
                  {barbell && <PlatesButton load={p.load} equipment={equipment} className="-mr-2" />}
                </div>
              )}
              {count && (
                <div className="flex flex-1 justify-center">
                  <Stepper size="sm" aria-label={`Set ${i + 1} ${count.toLowerCase()}`} value={p.reps} min={1} max={999} onChange={reps => onChange(editSet(block, i, { reps }))} />
                </div>
              )}
            </div>
            {hint && <div className="pl-12 text-[11px] text-muted">{hint}</div>}
          </div>
        );
      })}
      <SetCount block={block} onChange={onChange} />
    </div>
  );
};

/** How many sets, as one stepper, with Vary sets beside it when given: one line where Add set,
 * Remove set and Vary sets used to wrap (Nick, 1 Nov 2026; SetPlanGrid on iOS). */
export const SetCount = ({ block, onChange, onVary }: { block: Block; onChange: (block: Block) => void; onVary?: () => void }) => (
  <div className="flex items-center gap-3 border-t border-line-soft pt-2">
    <span className="text-[14px] font-semibold text-body">Sets</span>
    <Stepper size="sm" aria-label="Sets" value={block.repeat} min={1} max={99} onChange={n => onChange(withSetCount(block, n))} />
    {onVary && block.repeat > 1 && (
      <Button variant="quiet" size="sm" className="ml-auto" onClick={onVary}>
        Vary sets
      </Button>
    )}
  </div>
);
