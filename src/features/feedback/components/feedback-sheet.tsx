import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';

export interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What goes with the note, shown under "What gets sent". */
  context: object;
  onSend: (text: string) => Promise<void>;
}

/**
 * The hidden feedback box (specs/in-app-feedback.md): a note plus the context, to the agent team's queue.
 * Opening it never touches the timer. A failed send keeps the text and says why. The parent remounts it
 * (a new `key`) on every opening, so it starts clean.
 */
export const FeedbackSheet = ({ open, onOpenChange, context, onSend }: FeedbackSheetProps) => {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState('sending'); setError(null);
    try {
      await onSend(text);
      setState('sent'); setText('');
      setTimeout(() => onOpenChange(false), 900);
    } catch (e) {
      setState('idle'); setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Feedback" height="80dvh"
      action={<Button size="sm" disabled={!text.trim() || state !== 'idle'} onClick={send}>{state === 'sending' ? 'Sending…' : 'Send'}</Button>}>
      <p className="text-[13px] text-muted">What went wrong, or what would make it better? It goes to the agent team with this screen, your account and any workout in progress.</p>
      <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={6} maxLength={4000} aria-label="Feedback"
        className="mt-3 w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-hint" placeholder="Type here…" />
      {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
      {state === 'sent' && <p role="status" className="mt-2 text-[14px] font-bold text-ink">Sent, thanks.</p>}
      <details className="mt-3 text-[13px] text-muted">
        <summary className="cursor-pointer py-2">What gets sent</summary>
        <pre className="max-h-48 overflow-auto rounded-card bg-canvas p-3 font-mono text-[11px] leading-snug">{JSON.stringify(context, null, 2)}</pre>
      </details>
    </Sheet>
  );
};
