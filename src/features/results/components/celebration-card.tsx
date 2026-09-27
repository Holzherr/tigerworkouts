import { ArrowDown, ArrowUp, Medal, Share2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/ui-utils';
import type { ScoreType } from '@/features/runsheet/model';
import { deltaLines, ordinalLabel, streakLabel, type Celebration } from '../celebrate';
import { setLabel } from '../logbook';

export interface CelebrationCardProps {
  celebration: Celebration;
  scoreType: ScoreType;
  exercise: (key: string) => { name: string; unit?: string };
  /** Opens the share card. Left out, there is no Share button. */
  onShare?: () => void;
  className?: string;
}

/**
 * The top of the finish screen. "Workout 42" large, the streak under it, Share on the right; then
 * one row per record set today (coral medal, exercise, the set), then how it compares with the
 * last time of the same workout, an up or down arrow per number. Sections with nothing to say are
 * left out, so a first session shows only the count and the streak.
 */
export const CelebrationCard = ({ celebration: c, scoreType, exercise, onShare, className }: CelebrationCardProps) => {
  const deltas = deltaLines(c, scoreType);
  return (
    <section className={cn('rounded-card border border-brand-line bg-brand-soft px-3 py-3', className)} aria-label="Celebration">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[26px] leading-tight font-black">{ordinalLabel(c.ordinal)}</div>
          <div className="text-[13px] font-semibold text-brand-ink">{streakLabel(c.streak)}</div>
        </div>
        {onShare && (
          <Button variant="ghost" size="sm" onClick={onShare}>
            <Share2 /> Share
          </Button>
        )}
      </div>
      {c.prs.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-bold tracking-widest text-brand-ink uppercase">{c.prs.length === 1 ? 'New record' : `${c.prs.length} new records`}</div>
          {c.prs.map(p => {
            const ex = exercise(p.exerciseKey);
            return (
              <div key={p.exerciseKey} className="mt-1.5 flex items-center gap-2 text-[14px]">
                <Medal className="size-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate font-semibold">{ex.name}</span>
                <span className="font-extrabold tabular-nums">{setLabel(p.set, ex.unit?.replace(' per arm', ''))}</span>
              </div>
            );
          })}
        </div>
      )}
      {deltas.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-bold tracking-widest text-brand-ink uppercase">vs last time</div>
          {deltas.map(d => (
            <div key={d.label} className="mt-1.5 flex items-center gap-2 text-[14px]">
              <span className="w-16 shrink-0 text-muted">{d.label}</span>
              <span className={cn('flex-1 tabular-nums', d.better ? 'font-bold' : d.better === false ? 'text-body' : '')}>{d.text}</span>
              {d.better !== undefined && (d.better ? <ArrowUp className="size-4 text-brand" aria-label="better" /> : <ArrowDown className="size-4 text-faint" aria-label="worse" />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
