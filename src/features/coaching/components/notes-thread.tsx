import { X } from 'lucide-react';
import { useState } from 'react';
import type { CoachNote } from '@/features/cloud/coaching';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/ui-utils';
import { daysAgo } from '../rollup';

export interface NotesThreadProps {
  notes: CoachNote[];
  /** Your user id: your notes sit on the right. */
  me: string;
  /** The other person's name, for their notes. */
  them: string;
  /** "On Strength A, 3 Oct" for a note on a session or assignment. */
  about?: (n: CoachNote) => string | undefined;
  /** What a new note is attached to, with a way to clear it. */
  attach?: { label: string; onClear: () => void };
  /** Resolves to an error line, or null when sent. */
  onSend: (body: string) => Promise<string | null>;
  placeholder?: string;
  className?: string;
}

/** Notes between a coach and a client, oldest first, with a box to add one. */
export const NotesThread = ({ notes, me, them, about, attach, onSend, placeholder = 'Write a note', className }: NotesThreadProps) => {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const err = await onSend(body);
    setBusy(false);
    setError(err);
    if (!err) setBody('');
  };
  return (
    <div className={cn('space-y-2', className)}>
      {notes.length === 0 && <div className="px-1 text-[13px] text-muted">No notes yet.</div>}
      {notes.map(n => {
        const mine = n.author === me;
        const on = about?.(n);
        return (
          <div key={n.id} className={cn('max-w-[85%] rounded-card px-3 py-2', mine ? 'ml-auto bg-ink text-white' : 'border border-line bg-surface')}>
            <div className={cn('text-[11px]', mine ? 'text-white/60' : 'text-muted')}>
              {mine ? 'You' : them} · {daysAgo(n.createdAt)}
              {on ? ` · ${on}` : ''}
            </div>
            <div className="text-[14px] whitespace-pre-line">{n.body}</div>
          </div>
        );
      })}
      <form onSubmit={send} className="space-y-1.5 pt-1">
        {attach && (
          <div className="flex items-center gap-1 text-[12px] text-muted">
            <span className="truncate">On {attach.label}</span>
            <Button variant="quiet" size="icon-sm" aria-label="Not on this session" onClick={attach.onClear}>
              <X />
            </Button>
          </div>
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={1000} placeholder={placeholder} aria-label="Note" className="w-full rounded-tile border border-line bg-surface p-3 text-[15px] outline-none focus:border-hint" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-danger">{error}</span>
          <Button variant="dark" size="sm" type="submit" disabled={busy || !body.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </div>
  );
};
