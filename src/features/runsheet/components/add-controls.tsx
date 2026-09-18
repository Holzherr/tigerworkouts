import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { cn } from '@/shared/utils/ui-utils';

export type AddKind = 'exercise' | 'rest';

export interface AddTileProps {
  onAdd: (kind: AddKind) => void;
  /** "block" = orange text inside a bracket footer; "loose" = dashed tile for the end of the list. */
  variant?: 'block' | 'loose';
  className?: string;
}

/**
 * Two-part add control. Inside a block it is a slim orange "＋ Exercise · ＋ Rest" line under the
 * rows; at the end of the sheet it is a dashed tile split in two halves.
 */
export const AddTile = ({ onAdd, variant = 'block', className }: AddTileProps) => {
  if (variant === 'block') {
    return (
      <div className={cn('flex items-center justify-center gap-4 pt-2 pb-0.5 text-[13px] font-bold text-brand', className)}>
        <button type="button" onClick={() => onAdd('exercise')} className="inline-flex h-8 items-center gap-1 rounded-control px-2 active:bg-brand-line/40">
          <Plus className="size-4" /> Exercise
        </button>
        <button type="button" onClick={() => onAdd('rest')} className="inline-flex h-8 items-center gap-1 rounded-control px-2 active:bg-brand-line/40">
          <Plus className="size-4" /> Rest
        </button>
      </div>
    );
  }
  return (
    <div className={cn('flex overflow-hidden rounded-tile border-2 border-dashed border-hint text-[13.5px] font-bold text-muted', className)}>
      <button type="button" onClick={() => onAdd('exercise')} className="flex h-12 flex-1 items-center justify-center gap-1 active:bg-line-soft">
        <Plus className="size-4" /> Exercise
      </button>
      <div className="my-2 w-0.5 bg-line" />
      <button type="button" onClick={() => onAdd('rest')} className="flex h-12 flex-1 items-center justify-center gap-1 active:bg-line-soft">
        <Plus className="size-4" /> Rest
      </button>
    </div>
  );
};

export interface SeamInsertProps {
  onInsert: (kind: AddKind) => void;
  className?: string;
}

/**
 * The small ＋ sitting on the seam between two rows. Tapping it swaps in two chips, Exercise and
 * Rest, so the new step lands exactly there. Collapses again after a pick or a tap elsewhere.
 */
export const SeamInsert = ({ onInsert, className }: SeamInsertProps) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('relative z-[3] h-0', className)} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
        {open ? (
          <>
            <Chip size="sm" variant="brand" onClick={() => (setOpen(false), onInsert('exercise'))} className="shadow-sm">
              <Plus className="size-3" /> Exercise
            </Chip>
            <Chip size="sm" variant="brand" onClick={() => (setOpen(false), onInsert('rest'))} className="shadow-sm">
              <Plus className="size-3" /> Rest
            </Chip>
          </>
        ) : (
          <button type="button" aria-label="Insert here" onClick={() => setOpen(true)} className="grid size-[22px] place-items-center rounded-full border border-line bg-surface text-brand shadow-sm">
            <Plus className="size-3.5" strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
};
