import { Minus, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Stepper } from '@/shared/components/ui/stepper';
import { addSet, countLabel, editSet, plannedSet, removeSet, shortUnit, straightSetStep, type Block } from '../model';

export interface SetGridProps {
  block: Block;
  onChange: (block: Block) => void;
  /** Grey line under a set, e.g. last time's set of the same number. */
  hintFor?: (round: number) => string | undefined;
}

/**
 * A straight-set block (one exercise, rounds) as the gym writes it: one row per set with its load
 * and reps, each editable on its own for pyramids and ramping sets. Add set / Remove set change how
 * many times the block repeats.
 */
export const SetGrid = ({ block, onChange, hintFor }: SetGridProps) => {
  const step = straightSetStep(block);
  if (!step) return null;
  const hasLoad = !!step.exercise.unit && step.loadFactor === undefined && step.targetPct === undefined;
  const count = countLabel(step.forMode);
  return (
    <div className="bg-surface px-3 py-2" aria-label="Sets">
      <div className="flex items-center gap-2 pb-1 text-[11px] font-bold tracking-widest text-muted uppercase">
        <span className="w-9">Set</span>
        {hasLoad && <span className="flex-1 text-center">{shortUnit(step.exercise.unit)}</span>}
        {count && <span className="flex-1 text-center">{count}</span>}
      </div>
      {Array.from({ length: block.repeat }, (_, i) => {
        const p = plannedSet(step, i);
        const hint = hintFor?.(i);
        return (
          <div key={i} className="border-t border-line-soft py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-9 text-[15px] font-extrabold tabular-nums">{i + 1}</span>
              {hasLoad && (
                <div className="flex flex-1 justify-center">
                  <Stepper size="sm" aria-label={`Set ${i + 1} load`} value={p.load ?? 0} step={step.exercise.step || 1} max={1000} onChange={load => onChange(editSet(block, i, { load }))} />
                </div>
              )}
              {count && (
                <div className="flex flex-1 justify-center">
                  <Stepper size="sm" aria-label={`Set ${i + 1} ${count.toLowerCase()}`} value={p.reps} min={1} max={999} onChange={reps => onChange(editSet(block, i, { reps }))} />
                </div>
              )}
            </div>
            {hint && <div className="pl-11 text-[11px] text-muted">{hint}</div>}
          </div>
        );
      })}
      <div className="flex gap-2 border-t border-line-soft pt-2">
        <Button variant="ghost" size="sm" onClick={() => onChange(addSet(block))}>
          <Plus /> Add set
        </Button>
        <Button variant="ghost" size="sm" disabled={block.repeat <= 1} onClick={() => onChange(removeSet(block))}>
          <Minus /> Remove set
        </Button>
      </div>
    </div>
  );
};
