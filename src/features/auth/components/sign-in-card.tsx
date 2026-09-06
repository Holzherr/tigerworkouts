import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/ui-utils';

export interface SignInCardProps {
  /** Send a 6-digit code to the address; reject to show the error. */
  onSendCode: (email: string) => Promise<void>;
  /** Verify the code; resolve on success. */
  onVerify: (email: string, code: string) => Promise<void>;
  onGoogle?: () => Promise<void>;
  /** Start on the code step for this address (e.g. after a reload). */
  pendingEmail?: string;
  title?: string;
  reasons?: string[];
  className?: string;
}

type Phase = 'email' | 'sending' | 'code' | 'verifying';

const field = 'h-12 w-full rounded-control border border-line bg-surface px-3 text-[16px] outline-none focus:border-hint';

/**
 * Passwordless sign-in in one card. Step one: a short "why", optional Google button, the email
 * field over a full-width "Email me a code" button (never side by side, so it never wraps).
 * Step two: a large centred 6-digit code field with autofocus, full-width Sign in, and
 * "Use a different email" / "Resend code" underneath. Buttons show busy text while waiting;
 * errors appear inline in red under the form.
 */
export const SignInCard = ({ onSendCode, onVerify, onGoogle, pendingEmail, title = 'Sign in to keep your progress', reasons = ['Logs and workouts back up and follow you to any phone', 'No password: we email you a 6-digit code', 'Free, and you can export everything'], className }: SignInCardProps) => {
  const [email, setEmail] = useState(pendingEmail ?? '');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>(pendingEmail ? 'code' : 'email');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setError(null);
    setPhase('sending');
    try {
      await onSendCode(addr);
      setPhase('code');
      setNotice(null);
    } catch (err) {
      setError((err as Error).message || 'Could not send the code');
      setPhase('email');
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\s+/g, '');
    if (!c) return;
    setError(null);
    setPhase('verifying');
    try {
      await onVerify(email.trim(), c);
    } catch (err) {
      setError((err as Error).message || 'That code did not work');
      setPhase('code');
    }
  };

  if (phase === 'code' || phase === 'verifying') {
    return (
      <form onSubmit={verify} className={cn('rounded-card border border-line bg-surface px-4 py-4', className)}>
        <div className="text-[16px] font-bold">Check your email</div>
        <div className="mt-1 mb-3 text-[13px] text-muted">
          We sent a 6-digit code to <b className="text-body">{email}</b>. It works for 10 minutes.
        </div>
        <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus placeholder="000000" aria-label="6-digit code" className={cn(field, 'h-14 text-center text-[24px] font-semibold tracking-[.4em]')} />
        <Button type="submit" block className="mt-2" disabled={phase === 'verifying'}>
          {phase === 'verifying' ? 'Signing in…' : 'Sign in'}
        </Button>
        {error && <div className="mt-2 text-[13px] text-danger">{error}</div>}
        {notice && <div className="mt-2 text-[13px] text-muted">{notice}</div>}
        <div className="mt-3 flex justify-between text-[13px]">
          <button type="button" className="text-muted" onClick={() => (setPhase('email'), setCode(''), setError(null))}>
            Use a different email
          </button>
          <button type="button" className="font-bold text-brand" onClick={() => send().then(() => setNotice('New code sent'))}>
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={send} className={cn('rounded-card border border-line bg-surface px-4 py-4', className)}>
      <div className="text-[16px] font-bold">{title}</div>
      {reasons.length > 0 && (
        <ul className="mt-1 mb-3 space-y-0.5 text-[13px] text-muted">
          {reasons.map(r => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      )}
      {onGoogle && (
        <>
          <Button type="button" variant="ghost" block onClick={() => onGoogle().catch(err => setError((err as Error).message))}>
            Continue with Google
          </Button>
          <div className="my-2 text-center text-[11px] text-faint">or</div>
        </>
      )}
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@example.com" autoComplete="email" inputMode="email" autoCapitalize="off" aria-label="Email" className={field} />
      <Button type="submit" block className="mt-2 whitespace-nowrap" disabled={phase === 'sending'}>
        {phase === 'sending' ? 'Sending…' : 'Email me a code'}
      </Button>
      {error && <div className="mt-2 text-[13px] text-danger">{error}</div>}
    </form>
  );
};
