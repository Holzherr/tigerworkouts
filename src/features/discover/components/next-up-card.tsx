import { Play, TrendingUp } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { WorkoutIcon } from '@/shared/components/ui/workout-icon';
import { runsheetMinutes, type Runsheet } from '@/features/runsheet/model';
import type { Streak } from '@/features/results/effort';

export interface NextUpCardProps {
  runsheet: Runsheet;
  /** "Next in StrongLifts 5×5", "Your last workout". */
  reason: string;
  streak: Streak;
  /** Runs it now, skipping the workout page. */
  onStart: () => void;
  /** Opens the workout page, to look or change it first. */
  onOpen: () => void;
}

/** "3 this week · 2 weeks running", or how last week went when this one has nothing yet. */
export const weekLine = (s: Streak) =>
  s.thisWeek
    ? `${s.thisWeek} this week${s.weeks > 1 ? ` · ${s.weeks} weeks running` : ''}`
    : s.lastWeek
      ? `None yet this week · ${s.lastWeek} last week`
      : 'None yet this week';

/**
 * Top of home once there is history: a white card with a coral outline. Orange reason line
 * ("Next in StrongLifts 5×5"), then the workout's icon, title and length with a coral Start on
 * the right; tapping the title opens the workout page instead. Under a hairline, the week so far
 * with a trend icon.
 */
export const NextUpCard = ({ runsheet, reason, streak, onStart, onOpen }: NextUpCardProps) => (
  <section aria-label="Up next" className="rounded-card border border-brand-line bg-surface p-3">
    <div className="text-[12px] font-bold text-brand-ink">{reason}</div>
    <div className="mt-2 flex items-center gap-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <WorkoutIcon runsheet={runsheet} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-extrabold">{runsheet.title}</span>
          <span className="block text-[12px] text-muted">
            {runsheetMinutes(runsheet)} min{runsheet.program?.day ? ` · ${runsheet.program.day}` : ''}
          </span>
        </span>
      </button>
      <Button onClick={onStart} className="shrink-0">
        <Play /> Start
      </Button>
    </div>
    <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-2 text-[13px]">
      <TrendingUp className="size-4 shrink-0 text-brand" />
      <span className="font-bold">{weekLine(streak)}</span>
      <span className="text-muted">· {streak.total} all time</span>
    </div>
  </section>
);
