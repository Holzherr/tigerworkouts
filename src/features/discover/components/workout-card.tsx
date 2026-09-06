import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { cn } from '@/shared/utils/ui-utils';
import { modeLabel, runsheetMinutes, scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';

export const KIND_LABEL: Record<string, string> = { benchmark: 'Benchmark', program: 'Program', video: 'Video', article: 'Guide', protocol: 'Protocol', user: 'Mine' };

/** First exercise with media, for the card thumb. */
export const heroExercise = (r: Runsheet): ExerciseStep | undefined => {
  const steps = r.items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i])).filter((s): s is ExerciseStep => s.kind === 'exercise');
  return steps.find(s => s.exercise.clip) ?? steps.find(s => s.exercise.poster) ?? steps[0];
};

export interface WorkoutCardProps {
  runsheet: Runsheet;
  onOpen: (r: Runsheet) => void;
  /** Compact = one line row for program day lists. */
  compact?: boolean;
  className?: string;
}

/**
 * Card for a workout in Discover: exercise thumbnail on the left, title, one-line attribution
 * ("Benchmark · CrossFit" / "Program · StrongLifts 5×5 · Workout A" / "Video · Pamela Reif"),
 * then chips for length, first block mode and score type. Compact variant is a single row.
 */
export const WorkoutCard = ({ runsheet: r, onOpen, compact, className }: WorkoutCardProps) => {
  const ex = heroExercise(r);
  const kind = r.source?.kind ?? 'user';
  const who = r.program ? `${r.program.name} · ${r.program.day}` : (r.source?.author ?? r.creator ?? '');
  const firstBlock = r.items.find(i => i.kind === 'block');
  const score = scoreType(r);
  return (
    <button type="button" onClick={() => onOpen(r)} className={cn('flex w-full items-center gap-3 rounded-card border border-line bg-surface text-left active:bg-line-soft', compact ? 'px-3 py-2' : 'p-3', className)}>
      <ClipThumb size={compact ? 'sm' : 'md'} clip={ex?.exercise.clip} poster={ex?.exercise.poster} icon={ex?.exercise.icon ?? '🏋️'} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate font-bold', compact ? 'text-[14px]' : 'text-[15px]')}>{r.title}</div>
        <div className="truncate text-[12px] text-muted">
          {KIND_LABEL[kind]}
          {who ? ` · ${who}` : ''}
        </div>
        {!compact && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip size="sm" variant="value">
              {runsheetMinutes(r)} min
            </Chip>
            {firstBlock && (
              <Chip size="sm" variant="brand">
                {modeLabel(firstBlock)}
              </Chip>
            )}
            {score !== 'none' && (
              <Chip size="sm" variant="outline">
                {score === 'time' ? 'for time' : score === 'rounds' ? 'AMRAP' : score}
              </Chip>
            )}
            {r.video && (
              <Chip size="sm" variant="outline">
                follow along
              </Chip>
            )}
          </div>
        )}
      </div>
      {compact && <span className="text-[12px] text-muted">{runsheetMinutes(r)} min</span>}
    </button>
  );
};
