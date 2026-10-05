import { Check } from 'lucide-react';
import type { MyAssignment } from '@/features/cloud/coaching';
import { WorkoutCard } from '@/features/discover/components/workout-card';
import type { Runsheet } from '@/features/runsheet/model';
import { Chip } from '@/shared/components/ui/chip';

export interface FromCoachProps {
  assignments: MyAssignment[];
  /** True for an assignment the client has done since it was sent. */
  isDone?: (a: MyAssignment) => boolean;
  onOpen: (r: Runsheet) => void;
}

/** Top of Discover for a coached client: each workout their coach sent, with the coach's note. Not-yet-done first. */
export const FromCoach = ({ assignments, isDone = () => false, onOpen }: FromCoachProps) => {
  const shown = assignments.filter(a => a.workout).sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
  if (!shown.length) return null;
  return (
    <section aria-label="From your coach" className="space-y-2">
      <div className="px-1 text-[11px] font-bold tracking-widest text-muted uppercase">From your coach</div>
      {shown.map(a => (
        <div key={a.id} className="overflow-hidden rounded-card border border-brand-line bg-brand-soft">
          <WorkoutCard runsheet={a.workout!} onOpen={onOpen} className="rounded-none border-0 border-b border-brand-line" />
          <div className="flex items-start gap-2 px-3 py-2">
            <div className="min-w-0 flex-1 text-[13px] text-body">
              <span className="font-bold text-ink">{a.coachName}</span>
              {a.note ? `: “${a.note}”` : ' sent you this'}
            </div>
            {isDone(a) && (
              <Chip variant="brand" size="sm" className="bg-surface">
                <Check className="size-3" /> Done
              </Chip>
            )}
          </div>
        </div>
      ))}
    </section>
  );
};
