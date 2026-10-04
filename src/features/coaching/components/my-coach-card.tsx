import type { CoachLink, CoachNote } from '@/features/cloud/coaching';
import { Button } from '@/shared/components/ui/button';
import { NotesThread } from './notes-thread';

export interface MyCoachCardProps {
  coach: CoachLink;
  /** Your user id. */
  me: string;
  notes: CoachNote[];
  /** "On Strength A" for a note on an assignment or session. */
  about?: (n: CoachNote) => string | undefined;
  onReply: (body: string) => Promise<string | null>;
  onLeave: () => void;
}

/** Me tab, for a coached client: who coaches you, the notes between you with a reply box, and Leave. */
export const MyCoachCard = ({ coach, me, notes, about, onReply, onLeave }: MyCoachCardProps) => (
  <section aria-label="Your coach" className="space-y-2 rounded-card border border-line bg-surface p-3">
    <div>
      <div className="text-[14px] font-bold">Coached by {coach.name}</div>
      <div className="text-[12px] text-muted">They see the sessions you log and send you workouts.</div>
    </div>
    <NotesThread notes={notes.slice(-6)} me={me} them={coach.name.split(' ')[0]} about={about} onSend={onReply} placeholder={`Reply to ${coach.name.split(' ')[0]}`} />
    <Button variant="danger" size="sm" onClick={() => confirm(`Stop training with ${coach.name}? They stop seeing your sessions straight away.`) && onLeave()}>
      Leave coach
    </Button>
  </section>
);
