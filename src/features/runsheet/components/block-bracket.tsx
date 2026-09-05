import { ChevronDown, ChevronUp } from 'lucide-react';
import { forwardRef } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtClock } from '@/shared/utils/ui-utils';
import { roundSeconds, type Block } from '../model';

export interface BlockHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  block: Block;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Pick<Block, 'name' | 'repeat'>>) => void;
  /** Shown instead of the stats line while a step is being dragged out and one would remain. */
  dissolving?: boolean;
  lifted?: boolean;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Header line of a block: name, "3 steps · 1:30 per round · 12 min", and the orange ×N repeat pill
 * on the right. Tap the pill (or the line) to expand a repeat stepper and the name field.
 * Press and drag the header to move the whole block.
 */
export const BlockHeader = forwardRef<HTMLDivElement, BlockHeaderProps>(({ block, expanded, onToggle, onChange, dissolving, lifted, className, ...rest }, ref) => {
  const round = roundSeconds(block);
  return (
    <div ref={ref} className={cn('select-none', lifted && 'rounded-card bg-surface shadow-lift', className)} {...rest}>
      <div role="button" tabIndex={0} aria-expanded={expanded} onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()} className="flex items-center gap-2 px-2 pt-1.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold">{block.name}</div>
          {dissolving ? (
            <div className="text-[12px] font-bold text-brand-ink">1 step left · bracket will dissolve</div>
          ) : (
            <div className="text-[12px] text-muted">
              {block.steps.length} steps · {fmtClock(round)} per round · {Math.round((round * block.repeat) / 60)} min
            </div>
          )}
        </div>
        <Chip variant={expanded ? 'brand-solid' : 'brand'} size="lg" className="gap-0.5 font-extrabold">
          ×{block.repeat} {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Chip>
      </div>
      {expanded && (
        <div className="space-y-2.5 px-2 pb-3" onPointerDown={stop} onClick={stop}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Repeat this block</span>
            <Stepper aria-label="Repeat count" value={block.repeat} min={1} max={30} onChange={repeat => onChange({ repeat })} format={v => `${v}×`} />
          </div>
          <label className="block">
            <span className="text-[12px] text-muted">Block name</span>
            <input type="text" value={block.name} onChange={e => onChange({ name: e.target.value })} className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-[16px] font-semibold text-ink outline-none focus:border-hint" />
          </label>
        </div>
      )}
    </div>
  );
});
BlockHeader.displayName = 'BlockHeader';

export interface BlockBracketProps {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Dashed outline while a drag would leave the block with one step. */
  dissolving?: boolean;
  /** Orange ring while a dragged step hovers to join. */
  groupTarget?: boolean;
  className?: string;
}

/** Orange-tinted bracket around a block's rows: header on top, white card of rows, add footer. */
export const BlockBracket = ({ header, children, footer, dissolving, groupTarget, className }: BlockBracketProps) => (
  <section className={cn('rounded-[18px] border-[1.5px] border-brand-line bg-brand-soft p-1.5 transition-shadow', dissolving && 'border-dashed opacity-90', groupTarget && 'ring-2 ring-brand ring-offset-2 ring-offset-canvas', className)}>
    {header}
    <div className="overflow-hidden rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft">{children}</div>
    {footer}
  </section>
);
