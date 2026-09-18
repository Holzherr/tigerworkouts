import { Flame, Repeat2, Timer, TrendingUp } from 'lucide-react';
import { cn, fmtClock } from '@/shared/utils/ui-utils';
import type { ExerciseGroup } from '@/features/exercises/library';
import type { SessionResult } from '@/features/runsheet/progression';
import { effort, streak, type Effort } from '../effort';
import { muscleLoad } from '../muscles';
import { BodyMap } from './body-map';

export interface SessionStatsProps {
  result: SessionResult;
  /** One entry per set actually done, from the runsheet the session ran. */
  worked: { name: string; group?: ExerciseGroup; seconds: number; reps: number; load?: number }[];
  /** Every session, this one included, for the streak line. */
  history?: SessionResult[];
  bodyweightKg?: number;
  className?: string;
}

const Tile = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) => (
  <div className="flex-1 rounded-card border border-line bg-surface px-3 py-2">
    <div className="flex items-center gap-1 text-[11px] font-bold tracking-widest text-muted uppercase">
      {icon}
      {label}
    </div>
    <div className="mt-0.5 text-[19px] leading-tight font-extrabold tabular-nums">{value}</div>
    {sub && <div className="text-[11px] text-muted">{sub}</div>}
  </div>
);

const tonnageLine = (e: Effort) => (e.tonnage >= 1000 ? `${(e.tonnage / 1000).toFixed(1)} t moved` : e.tonnage ? `${Math.round(e.tonnage)} kg moved` : undefined);

/**
 * The part of a finished session that is worth looking at: what you worked, how hard, and
 * whether you are keeping it up. Calories are a METs estimate — honest about being one.
 */
export const SessionStats = ({ result, worked, history = [], bodyweightKg, className }: SessionStatsProps) => {
  const e = effort(result, worked, bodyweightKg);
  const load = muscleLoad(worked);
  const s = streak(history.length ? history : [result]);
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <Tile icon={<Timer className="size-3" />} label="Work" value={fmtClock(e.workSec)} sub={`${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`} />
        <Tile icon={<Flame className="size-3" />} label="Burn" value={`~${e.kcal}`} sub={e.estimatedWeight ? 'kcal · set your weight' : 'kcal estimate'} />
        <Tile icon={<Repeat2 className="size-3" />} label="Effort" value={tonnageLine(e) ?? fmtClock(e.workSec)} sub={tonnageLine(e) ? 'load × reps' : 'time under work'} />
      </div>
      {Object.keys(load).length > 0 && <BodyMap load={load} />}
      <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
        <TrendingUp className="size-4 shrink-0 text-brand" />
        <div className="text-[13px]">
          <span className="font-bold">
            {s.thisWeek} this week
            {s.weeks > 1 ? ` · ${s.weeks} weeks running` : ''}
          </span>
          <span className="text-muted">
            {' '}
            · {s.lastWeek} last week · {s.total} all time
          </span>
        </div>
      </div>
    </div>
  );
};
