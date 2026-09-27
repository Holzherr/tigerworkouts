import { Medal } from 'lucide-react';
import { cn } from '@/shared/utils/ui-utils';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtDur } from '../logbook';
import { roundRows, type RoundPR } from '../rounds';

export interface SplitsCardProps {
  result: SessionResult;
  /** The last session of the same workout: each round is compared with the same round then. */
  last?: SessionResult;
  /** A block's name from the workout; "Block" when it is gone. */
  blockName?: (blockId: string) => string | undefined;
  /** Rounds that were the workout's fastest ever when done: a medal on the tile. */
  records?: RoundPR[];
  className?: string;
}

/** "−4 s", "+1:06", "same". Negative is faster. */
export const fmtDelta = (d: number) => (d === 0 ? 'same' : `${d < 0 ? '−' : '+'}${fmtDur(Math.abs(d))}`);

/**
 * Round times per circuit, AMRAP or for-time block: a heading per block, then a wrapping row of
 * small tiles — "R3", the round's time, and against last time under it (faster in brand ink,
 * slower muted). The fastest round has a brand outline and "fastest", the slowest says "slowest".
 * Renders nothing for a session with no splits.
 */
export const SplitsCard = ({ result, last, blockName, records = [], className }: SplitsCardProps) => {
  const rows = roundRows(result, last).filter(r => r.times.some(t => t !== undefined));
  if (!rows.length) return null;
  return (
    <section aria-label="Round times" className={cn('rounded-card border border-line bg-surface px-3 py-2.5', className)}>
      <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Round times{last ? ' · vs last time' : ''}</div>
      {rows.map(row => (
        <div key={row.blockId} className="mt-2">
          {rows.length > 1 || blockName?.(row.blockId) ? <div className="text-[13px] font-bold">{blockName?.(row.blockId) ?? 'Block'}</div> : null}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.times.map((t, i) => {
              const d = row.vsLast[i];
              const fast = row.fastest === i;
              const slow = row.slowest === i;
              const rec = records.some(r => r.blockId === row.blockId && r.round === i);
              return (
                <div key={i} className={cn('min-w-15 rounded-lg border px-2 py-1 text-center', fast ? 'border-brand bg-brand-soft' : 'border-line-soft bg-canvas')} aria-label={`Round ${i + 1}${t !== undefined ? ` ${fmtDur(t)}` : ''}${fast ? ', fastest' : slow ? ', slowest' : ''}`}>
                  <div className="flex items-center justify-center gap-0.5 text-[10px] font-bold text-muted">
                    R{i + 1}
                    {rec && <Medal className="size-3 text-brand" aria-label="record" />}
                  </div>
                  <div className="text-[15px] font-extrabold tabular-nums">{t !== undefined ? fmtDur(t) : '–'}</div>
                  {d !== undefined ? <div className={cn('text-[11px] font-semibold tabular-nums', d < 0 ? 'text-brand-ink' : 'text-muted')}>{fmtDelta(d)}</div> : null}
                  {(fast || slow) && <div className={cn('text-[10px] font-bold', fast ? 'text-brand-ink' : 'text-faint')}>{fast ? 'fastest' : 'slowest'}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};
