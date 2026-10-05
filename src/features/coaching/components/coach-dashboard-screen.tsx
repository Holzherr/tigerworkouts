import { ChevronLeft, ChevronRight, Link2, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import type { Invite } from '@/features/cloud/coaching';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { cn } from '@/shared/utils/ui-utils';
import { daysAgo, weekSummary, type ClientSummary } from '../rollup';

export interface CoachDashboardScreenProps {
  /** Null while loading. */
  clients: ClientSummary[] | null;
  /** Invites nobody has accepted yet. */
  invites: Invite[];
  /** A line instead of the lists: "Coaching is not switched on yet.", a load error, or "Sign in…". */
  notice?: string;
  /** Creates an invite (with an optional name for it) and shares its link. Resolves to an error line or null. */
  onInvite?: (label: string) => Promise<string | null>;
  onShareInvite: (code: string) => void;
  onDeleteInvite?: (code: string) => void;
  onOpenClient: (id: string) => void;
  onHowItWorks: () => void;
  onBack: () => void;
  /** Where a signed-out coach signs in. */
  signIn?: React.ReactNode;
  now?: Date;
}

const heading = 'px-1 pt-2 text-[11px] font-bold tracking-widest text-muted uppercase';
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/**
 * The coach's home on the web: this week across all clients, Invite a client, invites waiting to be
 * accepted, then each client with sessions this week, last active and a Quiet flag after seven
 * days without a session.
 */
export const CoachDashboardScreen = ({ clients, invites, notice, onInvite, onShareInvite, onDeleteInvite, onOpenClient, onHowItWorks, onBack, signIn, now = new Date() }: CoachDashboardScreenProps) => {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const week = clients && weekSummary(clients);
  const invite = async () => {
    if (!onInvite) return;
    setBusy(true);
    const err = await onInvite(label);
    setBusy(false);
    setError(err);
    if (!err) setLabel('');
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> Back
        </Button>
        <h1 className="mt-1 text-[22px] leading-tight font-extrabold">Coaching</h1>
        <p className="text-[13px] text-muted">Your clients, what they did this week, and who has gone quiet.</p>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-10">
        {signIn}
        {notice && <div className="rounded-card border border-line bg-surface px-3 py-3 text-[14px] text-muted">{notice}</div>}
        {week && week.clients > 0 && (
          <StatTiles
            stats={[
              { value: `${week.trained}/${week.clients}`, label: 'trained this week' },
              { value: week.sessions, label: week.sessions === 1 ? 'session' : 'sessions' },
              { value: week.quiet, label: 'quiet 7+ days' },
            ]}
          />
        )}
        {onInvite && (
          <div className="space-y-2 rounded-card border border-line bg-surface p-3">
            <div className="text-[14px] font-bold">Invite a client</div>
            <div className="text-[12px] text-muted">One link per client. They open it, sign in and accept.</div>
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="Their name (only you see it)" aria-label="Client's name" className="h-11 w-full rounded-tile border border-line bg-canvas px-3 text-[15px] outline-none focus:border-hint" />
            <Button block onClick={invite} disabled={busy}>
              <UserPlus /> {busy ? 'Making a link…' : 'Invite a client'}
            </Button>
            {error && <div className="text-[13px] text-danger">{error}</div>}
          </div>
        )}
        {invites.length > 0 && (
          <>
            <div className={heading}>Waiting to accept</div>
            {invites.map(i => (
              <div key={i.code} className="flex items-center gap-2 rounded-card border border-line bg-surface py-1.5 pr-1 pl-3">
                <Link2 className="size-4 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{i.label || 'Invite link'}</div>
                  <div className="text-[12px] text-muted">Made {daysAgo(i.createdAt, now)}</div>
                </div>
                <Button variant="text" size="sm" onClick={() => onShareInvite(i.code)}>
                  Copy link
                </Button>
                {onDeleteInvite && (
                  <Button variant="quiet" size="icon-sm" aria-label={`Delete invite ${i.label ?? ''}`.trim()} onClick={() => onDeleteInvite(i.code)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
        {clients === null && !notice && <div className="px-1 py-4 text-[13px] text-muted">Loading…</div>}
        {clients && clients.length > 0 && (
          <>
            <div className={heading}>Clients</div>
            {clients.map(c => (
              <button key={c.id} type="button" onClick={() => onOpenClient(c.id)} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left active:bg-line-soft">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-extrabold', c.quiet ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand')}>{initials(c.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    {c.quiet && (
                      <Chip variant="warn" size="sm">
                        Quiet
                      </Chip>
                    )}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {c.sessionsThisWeek} this week · {c.lastActive ? `last trained ${daysAgo(c.lastActive, now)}` : 'no sessions yet'}
                  </span>
                </span>
                <ChevronRight className="size-4 text-faint" />
              </button>
            ))}
          </>
        )}
        {clients && clients.length === 0 && !notice && <EmptyState icon={<Users />} title="No clients yet" body="Invite a client, send them a workout, and see what they did against what you set." action={{ label: 'How coaching works', onClick: onHowItWorks }} />}
        {(clients?.length ?? 0) > 0 && (
          <Button variant="text" size="sm" onClick={onHowItWorks} className="mt-2">
            How coaching works
          </Button>
        )}
      </div>
    </div>
  );
};
