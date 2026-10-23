import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { AiCoach } from '@/features/cloud/coaching';
import { Button } from '@/shared/components/ui/button';

export interface AiCoachCardProps {
  coach: AiCoach;
  /** Resolves to an error line, or null once saved. */
  onRename: (name: string) => Promise<string | null>;
  /** Off (remove) or back on. */
  onActive: (active: boolean) => void;
}

/**
 * Me tab: your AI coach — the assistant connected to your account (Claude through the TigerWorkouts
 * connector) sending you workouts as a coach would. You name it, rename it or remove it.
 */
export const AiCoachCard = ({ coach, onRename, onActive }: AiCoachCardProps) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(coach.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await onRename(name);
    setBusy(false);
    setError(err);
    if (!err) setEditing(false);
  };

  if (!coach.active)
    return (
      <section aria-label="AI coach" className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
        <div className="min-w-0">
          <div className="text-[14px] font-bold">AI coach removed</div>
          <div className="text-[12px] text-muted">Workouts your AI assistant makes save as your own.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onActive(true)}>
          Bring back {coach.name}
        </Button>
      </section>
    );

  return (
    <section aria-label="AI coach" className="space-y-2 rounded-card border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-brand-soft text-brand [&_svg]:size-4">
          <Sparkles />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-bold">Coached by {coach.name} · AI</div>
          <div className="text-[12px] text-muted">Your AI assistant sends you workouts as your coach. They show at the top of Mine, from {coach.name}.</div>
        </div>
      </div>
      {editing ? (
        <form onSubmit={save} className="space-y-1.5">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus aria-label="AI coach name" className="h-11 w-full rounded-tile border border-line bg-surface px-3 text-[16px] outline-none focus:border-hint" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-danger">{error}</span>
            <div className="flex gap-1">
              <Button variant="quiet" size="sm" onClick={() => (setEditing(false), setName(coach.name), setError(null))}>
                Cancel
              </Button>
              <Button variant="dark" size="sm" type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex gap-1">
          <Button variant="text" size="sm" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button variant="danger" size="sm" onClick={() => confirm(`Remove ${coach.name} as your coach? What it sent stays in your workouts; new ones from your AI assistant save as your own.`) && onActive(false)}>
            Remove AI coach
          </Button>
        </div>
      )}
    </section>
  );
};
