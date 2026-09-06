import { ChevronDown, ChevronUp } from 'lucide-react';
import { forwardRef } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtClock } from '@/shared/utils/ui-utils';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { blockSeconds, modeLabel, roundSeconds, type Block, type BlockMode } from '../model';

const MODE_OPTIONS = [
  { value: 'rounds', label: 'Rounds' },
  { value: 'fortime', label: 'For time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'ladder', label: 'Ladder' },
] as const satisfies readonly { value: BlockMode; label: string }[];

export interface BlockHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  block: Block;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Pick<Block, 'name' | 'repeat' | 'mode' | 'timeCapSec' | 'everySec' | 'ladder'>>) => void;
  /** Shown instead of the stats line while a step is being dragged out and one would remain. */
  dissolving?: boolean;
  lifted?: boolean;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Header line of a block: name, "3 steps · 1:30 per round · 12 min", and the orange pill on the
 * right showing how it runs (×8, AMRAP 20:00, EMOM 10, 5 rounds for time). Tap to expand: mode
 * dropdown, rounds / time cap / interval steppers as the mode needs, and the name field.
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
              {block.steps.length} steps · {fmtClock(round)} per round · {Math.round(blockSeconds(block) / 60)} min{block.note ? ` · ${block.note}` : ''}
            </div>
          )}
        </div>
        <Chip variant={expanded ? 'brand-solid' : 'brand'} size="lg" className="gap-0.5 font-extrabold">
          {modeLabel(block)} {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Chip>
      </div>
      {expanded && (
        <div className="space-y-2.5 px-2 pb-3" onPointerDown={stop} onClick={stop}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Run as</span>
            <Dropdown aria-label="Block mode" value={block.mode ?? 'rounds'} options={MODE_OPTIONS} onValueChange={mode => onChange({ mode, timeCapSec: mode === 'amrap' ? (block.timeCapSec ?? 600) : block.timeCapSec, everySec: mode === 'emom' ? (block.everySec ?? 60) : block.everySec })} />
          </div>
          {(block.mode ?? 'rounds') !== 'amrap' && block.mode !== 'ladder' && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">{block.mode === 'emom' ? 'Minutes' : 'Rounds'}</span>
              <Stepper aria-label="Repeat count" value={block.repeat} min={1} max={60} onChange={repeat => onChange({ repeat })} format={v => `${v}×`} />
            </div>
          )}
          {(block.mode === 'amrap' || block.mode === 'fortime') && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">{block.mode === 'amrap' ? 'Time' : 'Time cap'} <span className="text-muted">(min)</span></span>
              <Stepper aria-label="Time cap" value={Math.round((block.timeCapSec ?? 0) / 60)} min={0} max={90} onChange={m => onChange({ timeCapSec: m ? m * 60 : undefined })} />
            </div>
          )}
          {block.mode === 'ladder' && (
            <label className="block">
              <span className="text-[12px] text-muted">Rep scheme</span>
              <input type="text" value={(block.ladder ?? []).join('-')} onChange={e => onChange({ ladder: e.target.value.split(/[-,\s]+/).map(Number).filter(n => n > 0) })} placeholder="21-15-9" className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-[16px] font-semibold text-ink outline-none focus:border-hint" />
            </label>
          )}
          {block.mode === 'emom' && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Every <span className="text-muted">(sec)</span></span>
              <Stepper aria-label="Interval" value={block.everySec ?? 60} step={15} min={15} max={600} onChange={everySec => onChange({ everySec })} />
            </div>
          )}
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
