import { Check, ChevronDown, ChevronLeft, MessageSquare, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Assignment, CoachNote } from '@/features/cloud/coaching';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { WorkoutIcon } from '@/shared/components/ui/workout-icon';
import { cn } from '@/shared/utils/ui-utils';
import { daysAgo, doneBy, prescribedVsDone, type PlanRow } from '../rollup';
import { NotesThread } from './notes-thread';

export interface ClientDetailScreenProps {
  client: { id: string; name: string; since?: string };
  /** The coach's user id. */
  me: string;
  /** The coach's own workouts: what can be assigned. */
  workouts: Runsheet[];
  /** Null while loading. */
  assignments: Assignment[] | null;
  /** The client's recent sessions, newest first; null while loading. */
  sessions: SessionResult[] | null;
  notes: CoachNote[];
  /** A line in place of the lists (not switched on, load error). */
  notice?: string;
  /** A workout by id, to set each session against what it prescribed. */
  lookup: (id: string) => Runsheet | undefined;
  exercise: (key: string) => { name: string; unit: string };
  onAssign: (workoutId: string, note: string) => Promise<string | null>;
  onUnassign: (id: string) => void;
  onAddNote: (body: string, sessionId?: string) => Promise<string | null>;
  onEnd: () => void;
  onBack: () => void;
  now?: Date;
}

const heading = 'px-1 pt-3 text-[11px] font-bold tracking-widest text-muted uppercase';
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * One client, from the coach's side: send one of your workouts with a note, what you sent and
 * whether it was done, their sessions with each exercise's sets against what the workout set,
 * the notes between you, and End coaching.
 */
export const ClientDetailScreen = ({ client, me, workouts, assignments, sessions, notes, notice, lookup, exercise, onAssign, onUnassign, onAddNote, onEnd, onBack, now = new Date() }: ClientDetailScreenProps) => {
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [about, setAbout] = useState<string | undefined>();
  const shown = useMemo(() => workouts.filter(w => !query.trim() || w.title.toLowerCase().includes(query.trim().toLowerCase())), [workouts, query]);
  const title = (id: string) => lookup(id)?.title ?? 'A workout';
  const sessionTitle = (id: string) => {
    const s = sessions?.find(x => x.id === id);
    return s ? `${s.title ?? title(s.runsheetId)}, ${dateLabel(s.startedAt)}` : undefined;
  };
  const assignmentTitle = (id?: string) => {
    const a = id ? assignments?.find(x => x.id === id) : undefined;
    return a && title(a.workoutId);
  };
  const send = async () => {
    if (!pick) return;
    setBusy(true);
    const err = await onAssign(pick, note);
    setBusy(false);
    setError(err);
    if (!err) {
      setPick(null);
      setNote('');
    }
  };
  const latest = sessions?.[0]?.id;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> Clients
        </Button>
        <h1 className="mt-1 truncate text-[22px] leading-tight font-extrabold">{client.name}</h1>
        {client.since && <p className="text-[13px] text-muted">Your client since {dateLabel(client.since)}</p>}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-10">
        {notice && <div className="rounded-card border border-line bg-surface px-3 py-3 text-[14px] text-muted">{notice}</div>}

        <section aria-label="Assign a workout" className="space-y-2 rounded-card border border-line bg-surface p-3">
          <div className="text-[14px] font-bold">Send a workout</div>
          {workouts.length === 0 ? (
            <div className="text-[13px] text-muted">Make a workout of your own first (New workout on Discover), then send it here.</div>
          ) : (
            <>
              {workouts.length > 6 && (
                <label className="flex h-10 items-center gap-2 rounded-tile border border-line bg-canvas px-3">
                  <Search className="size-4 text-faint" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find one of your workouts" aria-label="Find a workout" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </label>
              )}
              <div role="radiogroup" aria-label="Your workouts" className="max-h-64 space-y-1 overflow-y-auto">
                {shown.map(w => (
                  <button key={w.id} type="button" role="radio" aria-checked={pick === w.id} onClick={() => setPick(w.id ?? null)} className={cn('flex w-full items-center gap-2.5 rounded-tile border px-2 py-1.5 text-left', pick === w.id ? 'border-brand-line bg-brand-soft' : 'border-transparent active:bg-line-soft')}>
                    <WorkoutIcon runsheet={w} size={36} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{w.title}</span>
                    {pick === w.id && <Check className="size-4 text-brand" />}
                  </button>
                ))}
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="A note with it (optional)" aria-label="Note with the workout" className="w-full rounded-tile border border-line bg-canvas p-3 text-[15px] outline-none focus:border-hint" />
              <Button block onClick={send} disabled={!pick || busy}>
                {busy ? 'Sending…' : `Send to ${client.name.split(' ')[0]}`}
              </Button>
              {error && <div className="text-[13px] text-danger">{error}</div>}
            </>
          )}
        </section>

        <div className={heading}>Sent</div>
        {assignments === null && !notice && <div className="px-1 text-[13px] text-muted">Loading…</div>}
        {assignments?.length === 0 && <div className="px-1 text-[13px] text-muted">Nothing sent yet.</div>}
        {assignments?.map(a => {
          const done = sessions && doneBy(a, sessions);
          return (
            <div key={a.id} className="flex items-start gap-2 rounded-card border border-line bg-surface py-2 pr-1 pl-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold">{title(a.workoutId)}</span>
                  {done ? (
                    <Chip variant="brand" size="sm">
                      <Check className="size-3" /> Done {dateLabel(done.startedAt)}
                    </Chip>
                  ) : (
                    <Chip variant="value" size="sm">
                      Not yet
                    </Chip>
                  )}
                </div>
                <div className="text-[12px] text-muted">Sent {daysAgo(a.createdAt, now)}</div>
                {a.note && <div className="mt-0.5 text-[13px] text-body">“{a.note}”</div>}
              </div>
              <Button variant="quiet" size="icon-sm" aria-label={`Take back ${title(a.workoutId)}`} onClick={() => onUnassign(a.id)}>
                <Trash2 />
              </Button>
            </div>
          );
        })}

        <div className={heading}>Sessions</div>
        {sessions === null && !notice && <div className="px-1 text-[13px] text-muted">Loading…</div>}
        {sessions?.length === 0 && <div className="px-1 text-[13px] text-muted">No sessions in the last 60 days.</div>}
        {sessions?.map(s => {
          const expanded = (open ?? latest) === s.id;
          const rows = prescribedVsDone(lookup(s.runsheetId), s, exercise);
          const dur = s.durationSec ?? (s.activity ? s.activity.minutes * 60 : undefined);
          return (
            <section key={s.id} aria-label={s.title ?? 'Session'} className="overflow-hidden rounded-card border border-line bg-surface">
              <button type="button" onClick={() => setOpen(expanded ? '' : (s.id ?? null))} aria-expanded={expanded} className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-line-soft">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{s.title ?? s.activity?.name ?? title(s.runsheetId)}</span>
                  <span className="block text-[12px] text-muted">
                    {dateLabel(s.startedAt)}
                    {dur ? ` · ${Math.round(dur / 60)} min` : ''}
                    {s.rpe ? ` · effort ${s.rpe}/10` : ''}
                  </span>
                </span>
                {s.completed === false ? (
                  <Chip variant="warn" size="sm">
                    Stopped early
                  </Chip>
                ) : (
                  <Chip variant="value" size="sm">
                    Completed
                  </Chip>
                )}
                <ChevronDown className={cn('size-4 text-faint transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div className="border-t border-line-soft px-3 pt-1 pb-2.5">
                  {rows.length > 0 ? <PlanTable rows={rows} /> : <div className="py-1.5 text-[13px] text-muted">No sets logged.</div>}
                  {s.notes && <div className="mt-1.5 text-[13px] text-body">Their note: “{s.notes}”</div>}
                  <Button variant="text" size="sm" className="mt-1 -ml-2" onClick={() => setAbout(s.id)}>
                    <MessageSquare /> Note on this session
                  </Button>
                </div>
              )}
            </section>
          );
        })}

        <div className={heading}>Notes</div>
        <NotesThread
          notes={notes}
          me={me}
          them={client.name.split(' ')[0]}
          about={n => (n.sessionId ? sessionTitle(n.sessionId) : assignmentTitle(n.assignmentId))}
          attach={about ? { label: sessionTitle(about) ?? 'this session', onClear: () => setAbout(undefined) } : undefined}
          onSend={async body => {
            const err = await onAddNote(body, about);
            if (!err) setAbout(undefined);
            return err;
          }}
          placeholder={`A note for ${client.name.split(' ')[0]}`}
        />

        <div className="pt-6">
          <Button variant="danger" block onClick={() => confirm(`End coaching with ${client.name}? You stop seeing their sessions, and they stop seeing what you sent.`) && onEnd()}>
            End coaching
          </Button>
        </div>
      </div>
    </div>
  );
};

const VERDICT: Record<NonNullable<PlanRow['verdict']>, { label: string; variant: 'brand' | 'warn' | 'value' | 'outline' }> = {
  hit: { label: 'Hit', variant: 'brand' },
  short: { label: 'Short', variant: 'warn' },
  skipped: { label: 'Skipped', variant: 'value' },
  extra: { label: 'Added', variant: 'outline' },
};

/** Each exercise: what was set, what was done, and whether it was hit. */
export const PlanTable = ({ rows }: { rows: PlanRow[] }) => (
  <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
    {rows.map(r => (
      <div key={r.stepId} className="py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-semibold">{r.name}</span>
          {r.verdict && (
            <Chip variant={VERDICT[r.verdict].variant} size="sm">
              {VERDICT[r.verdict].label}
            </Chip>
          )}
        </div>
        <div className="grid grid-cols-[3.5rem_1fr] gap-x-2 text-[12px] tabular-nums">
          {r.planned && (
            <>
              <span className="text-muted">Set</span>
              <span className="text-body">{r.planned}</span>
            </>
          )}
          <span className="text-muted">Done</span>
          <span className={cn(r.done ? 'font-semibold text-ink' : 'text-faint')}>{r.done || '–'}</span>
        </div>
      </div>
    ))}
  </div>
);
